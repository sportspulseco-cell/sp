"""
SportsPulse scheduler-solver — CP-SAT service.

Single endpoint: POST /solve, request/response matching
packages/scheduler-core/src/contracts.ts exactly. The TypeScript
contract is the wire-format source of truth; if either side changes,
both sides change.

MVP constraints in this build:
  HARD
    - Each fixture placed in exactly one slot
    - Each slot holds at most one fixture (no venue/surface double-book)
    - Each team plays at most one game during any overlapping interval
    - Locked fixtures pinned to their assigned slot
    - Playoff-reservation slots excluded from regular-season generation

  SOFT (deferred to next iteration)
    - Time-slot fairness as a minimize-max-deviation objective term
    - Home/away balance
    - Gap balance

Auth: SOLVER_API_KEY env (set as an HF Space secret). If unset, the
service runs in dev-open mode (useful for local docker run).
"""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel
from ortools.sat.python import cp_model


# =====================================================================
# Wire contract — mirrors packages/scheduler-core/src/contracts.ts.
# =====================================================================


class Blackout(BaseModel):
    startTsUtc: str
    endTsUtc: str


class TeamInput(BaseModel):
    teamId: str
    divisionId: str
    blackouts: Optional[list[Blackout]] = None


class SlotInput(BaseModel):
    slotId: str
    surfaceId: str
    venueId: str
    startTsUtc: str
    durationMin: int
    band: Optional[str] = None  # early | mid | late | None
    hourlyCostCents: int
    isPlayoffReservation: bool


class LockedFixture(BaseModel):
    homeTeamId: str
    awayTeamId: str
    slotId: str


class SolverWeights(BaseModel):
    timeSlotFairness: float
    homeAwayBalance: float
    gapBalance: float


class BandDefinition(BaseModel):
    band: str
    startsAt: Optional[str] = None
    endsBefore: Optional[str] = None


class GameAssignment(BaseModel):
    homeTeamId: str
    awayTeamId: str
    slotId: str
    constraintIds: list[str]


class SolveRequest(BaseModel):
    seasonId: str
    divisionId: Optional[str] = None
    teams: list[TeamInput]
    slots: list[SlotInput]
    lockedFixtures: list[LockedFixture]
    gamesPerPair: int
    bandDefinitions: list[BandDefinition]
    weights: SolverWeights
    maxLateFraction: Optional[float] = None
    timeLimitSeconds: int
    seed: str
    hint: Optional[list[GameAssignment]] = None


class ObjectiveBreakdown(BaseModel):
    timeslotFairnessDeviation: float
    homeAwayImbalance: float
    gapImbalance: float


class HardViolation(BaseModel):
    type: str
    description: str
    gamesAffected: list[str]
    resolutionHint: Optional[str] = None


class SoftViolation(BaseModel):
    type: str
    description: str
    teamId: Optional[str] = None
    targetPct: Optional[float] = None
    achievableMinPct: Optional[float] = None
    resolutionHint: Optional[str] = None


class InfeasibilityReport(BaseModel):
    summary: str
    hardViolations: list[HardViolation]
    softViolations: list[SoftViolation]
    unplacedGames: int
    placedGames: int


class SolveResponse(BaseModel):
    status: str  # OPTIMAL | FEASIBLE | INFEASIBLE | TIMEOUT
    assignments: list[GameAssignment]
    objectiveValue: float
    objectiveBreakdown: ObjectiveBreakdown
    perTeamBandCounts: dict[str, dict[str, int]]
    infeasibility: Optional[InfeasibilityReport] = None
    solveTimeMs: int


# =====================================================================
# Auth
# =====================================================================

API_KEY = os.environ.get("SOLVER_API_KEY")


def require_api_key(x_api_key: Optional[str] = Header(default=None, alias="X-API-Key")):
    if API_KEY is None:
        # Dev-open mode: no key configured. Set SOLVER_API_KEY in production
        # (HF Space Secret) to require auth.
        return
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


# =====================================================================
# Helpers
# =====================================================================


def _parse_ts(s: str) -> int:
    """ISO-8601 UTC → Unix seconds (integer). Accepts trailing 'Z'."""
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def _slot_intervals(slots: list[SlotInput]) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for s in slots:
        start = _parse_ts(s.startTsUtc)
        out.append((start, start + s.durationMin * 60))
    return out


def _enumerate_fixtures(
    teams: list[TeamInput], games_per_pair: int, division_filter: Optional[str]
) -> list[tuple[str, str]]:
    """
    Round-robin: each unordered same-division pair appears `games_per_pair`
    times. If `division_filter` is set, restrict to that division.
    """
    relevant = [
        t for t in teams if division_filter is None or t.divisionId == division_filter
    ]
    by_div: dict[str, list[str]] = {}
    for t in relevant:
        by_div.setdefault(t.divisionId, []).append(t.teamId)

    fixtures: list[tuple[str, str]] = []
    for div_teams in by_div.values():
        for i in range(len(div_teams)):
            for j in range(i + 1, len(div_teams)):
                for _ in range(games_per_pair):
                    fixtures.append((div_teams[i], div_teams[j]))
    return fixtures


def _empty_objective() -> ObjectiveBreakdown:
    return ObjectiveBreakdown(
        timeslotFairnessDeviation=0.0, homeAwayImbalance=0.0, gapImbalance=0.0
    )


# =====================================================================
# FastAPI app
# =====================================================================

app = FastAPI(title="SportsPulse Scheduler-Solver", version="0.1.0")


@app.get("/health")
def health():
    return {"ok": True, "service": "scheduler-solver", "version": "0.1.0"}


@app.post(
    "/solve",
    response_model=SolveResponse,
    dependencies=[Depends(require_api_key)],
)
def solve(req: SolveRequest) -> SolveResponse:
    t0 = time.monotonic()

    # Playoff-reservation slots are excluded from the regular-season pool
    # (pain #3 — playoff ice blocked off up front).
    available_slots = [s for s in req.slots if not s.isPlayoffReservation]

    fixtures = _enumerate_fixtures(req.teams, req.gamesPerPair, req.divisionId)

    # Cheap infeasibility check up front: more fixtures than slots is
    # unsatisfiable by pigeonhole. Surface this without invoking the solver.
    if len(fixtures) > len(available_slots):
        return SolveResponse(
            status="INFEASIBLE",
            assignments=[],
            objectiveValue=0.0,
            objectiveBreakdown=_empty_objective(),
            perTeamBandCounts={},
            infeasibility=InfeasibilityReport(
                summary=(
                    f"{len(fixtures)} fixtures requested but only "
                    f"{len(available_slots)} non-playoff slots available."
                ),
                hardViolations=[
                    HardViolation(
                        type="insufficient_inventory",
                        description=(
                            "Not enough ice slots in the pool to place every "
                            "fixture."
                        ),
                        gamesAffected=[],
                        resolutionHint=(
                            "Add slots, reduce gamesPerPair, or unreserve "
                            "playoff slots."
                        ),
                    )
                ],
                softViolations=[],
                unplacedGames=len(fixtures) - len(available_slots),
                placedGames=0,
            ),
            solveTimeMs=int((time.monotonic() - t0) * 1000),
        )

    model = cp_model.CpModel()

    # x[i, j] = 1 iff fixture i is placed in slot j.
    n_fix = len(fixtures)
    n_slot = len(available_slots)
    x = {
        (i, j): model.NewBoolVar(f"x_{i}_{j}")
        for i in range(n_fix)
        for j in range(n_slot)
    }

    # 1) Each fixture placed in exactly one slot.
    for i in range(n_fix):
        model.AddExactlyOne(x[i, j] for j in range(n_slot))

    # 2) Each slot holds at most one fixture (no venue/surface double-book).
    for j in range(n_slot):
        model.AddAtMostOne(x[i, j] for i in range(n_fix))

    # 3) Locked fixtures pinned to their assigned slot (the sacred invariant
    #    expressed as a hard equality).
    slot_index_by_id = {s.slotId: idx for idx, s in enumerate(available_slots)}
    unpinned_locks: list[LockedFixture] = []
    for lf in req.lockedFixtures:
        target_j = slot_index_by_id.get(lf.slotId)
        if target_j is None:
            unpinned_locks.append(lf)
            continue
        matched = False
        for i, (a, b) in enumerate(fixtures):
            if {a, b} == {lf.homeTeamId, lf.awayTeamId}:
                model.Add(x[i, target_j] == 1)
                matched = True
                break
        if not matched:
            unpinned_locks.append(lf)

    # 4) Per-team non-overlap. For each team, for each pair of overlapping
    #    slots, at most one of that team's fixtures may occupy them.
    intervals = _slot_intervals(available_slots)
    team_fixtures: dict[str, list[int]] = {}
    for i, (a, b) in enumerate(fixtures):
        team_fixtures.setdefault(a, []).append(i)
        team_fixtures.setdefault(b, []).append(i)

    for team, idxs in team_fixtures.items():
        for a_j in range(n_slot):
            a_start, a_end = intervals[a_j]
            for b_j in range(a_j + 1, n_slot):
                b_start, b_end = intervals[b_j]
                if a_start < b_end and b_start < a_end:
                    model.Add(
                        sum(x[i, a_j] for i in idxs)
                        + sum(x[i, b_j] for i in idxs)
                        <= 1
                    )

    # =====================================================================
    # Solve
    # =====================================================================

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(req.timeLimitSeconds)
    # Deterministic-by-seed for the default single-worker path; the full
    # solution is also persisted (locked decision #4) so multi-worker is
    # operationally safe — increase here if larger instances need it.
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = abs(hash(req.seed)) % (2**31)

    status = solver.Solve(model)
    elapsed_ms = int((time.monotonic() - t0) * 1000)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        wire_status = "INFEASIBLE" if status == cp_model.INFEASIBLE else "TIMEOUT"
        return SolveResponse(
            status=wire_status,
            assignments=[],
            objectiveValue=0.0,
            objectiveBreakdown=_empty_objective(),
            perTeamBandCounts={},
            infeasibility=InfeasibilityReport(
                summary=(
                    "No feasible assignment found within the time budget."
                    if wire_status == "TIMEOUT"
                    else (
                        "The hard constraints are jointly unsatisfiable. "
                        "Likely causes: too many locked fixtures conflict, "
                        "insufficient slot coverage for some team, or "
                        "overlapping slot inventory."
                    )
                ),
                hardViolations=(
                    [
                        HardViolation(
                            type="locked_slot_missing",
                            description=(
                                f"Locked fixture {lf.homeTeamId} vs "
                                f"{lf.awayTeamId} targets slot {lf.slotId} "
                                "which is not in the available pool."
                            ),
                            gamesAffected=[],
                            resolutionHint=(
                                "Verify slot id, or remove the lock so the "
                                "engine can place this fixture freely."
                            ),
                        )
                        for lf in unpinned_locks
                    ]
                ),
                softViolations=[],
                unplacedGames=n_fix,
                placedGames=0,
            ),
            solveTimeMs=elapsed_ms,
        )

    # Materialise assignments.
    assignments: list[GameAssignment] = []
    per_team_bands: dict[str, dict[str, int]] = {}

    for i in range(n_fix):
        for j in range(n_slot):
            if solver.Value(x[i, j]) != 1:
                continue
            home, away = fixtures[i]
            slot = available_slots[j]
            assignments.append(
                GameAssignment(
                    homeTeamId=home,
                    awayTeamId=away,
                    slotId=slot.slotId,
                    constraintIds=["no_venue_double_book", "no_team_overlap"],
                )
            )
            if slot.band:
                for tid in (home, away):
                    bands = per_team_bands.setdefault(
                        tid, {"early": 0, "mid": 0, "late": 0}
                    )
                    bands[slot.band] = bands.get(slot.band, 0) + 1
            break

    return SolveResponse(
        status="OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
        assignments=assignments,
        objectiveValue=0.0,
        objectiveBreakdown=_empty_objective(),
        perTeamBandCounts=per_team_bands,
        solveTimeMs=elapsed_ms,
    )
