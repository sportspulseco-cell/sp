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

  SOFT
    - Time-slot fairness, home/away balance, weekly spread and preferences

Auth: SOLVER_API_KEY env (set as an HF Space secret). If unset, the
service runs in dev-open mode (useful for local docker run).
"""

from __future__ import annotations

import os
import time
import hashlib
import math
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
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
    preferredWeekdays: Optional[list[int]] = None  # ISO weekdays, 1=Monday
    preferredVenueIds: Optional[list[str]] = None
    maxOffNightGames: Optional[int] = None
    maxOffVenueGames: Optional[int] = None


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
    timezone: str = "UTC"
    maxGamesPerTeamPerWeek: Optional[int] = None


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


CAPABILITIES = ["team_blackouts", "late_cap", "weekly_cap", "preferences", "fairness_objective"]


class SolveResponse(BaseModel):
    capabilities: list[str] = Field(default_factory=lambda: CAPABILITIES.copy())
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
    return {"ok": True, "service": "scheduler-solver", "version": "0.2.0", "capabilities": CAPABILITIES}


@app.post(
    "/solve",
    response_model=SolveResponse,
    dependencies=[Depends(require_api_key)],
)
def solve(req: SolveRequest) -> SolveResponse:
    t0 = time.monotonic()
    if req.gamesPerPair < 1 or req.timeLimitSeconds < 1:
        raise HTTPException(422, "Games per pair and time budget must be positive.")
    if req.maxLateFraction is not None and not 0 <= req.maxLateFraction <= 1:
        raise HTTPException(422, "Late fraction must be between zero and one.")
    if any(not math.isfinite(v) or v < 0 for v in req.weights.model_dump().values()):
        raise HTTPException(422, "Objective weights must be finite and non-negative.")
    if req.maxGamesPerTeamPerWeek is not None and req.maxGamesPerTeamPerWeek < 1:
        raise HTTPException(422, "Weekly game limit must be positive.")
    try:
        zone = ZoneInfo(req.timezone)
    except Exception:
        raise HTTPException(422, "Invalid season timezone.")
    if len({t.teamId for t in req.teams}) != len(req.teams) or len({s.slotId for s in req.slots}) != len(req.slots):
        raise HTTPException(422, "Duplicate team or slot IDs.")
    if any(s.durationMin <= 0 for s in req.slots):
        raise HTTPException(422, "Slot duration must be positive.")
    for team in req.teams:
        for blackout in team.blackouts or []:
            try:
                valid = _parse_ts(blackout.startTsUtc) < _parse_ts(blackout.endTsUtc)
            except (ValueError, OverflowError):
                valid = False
            if not valid:
                raise HTTPException(422, "A team blackout needs valid start and end times, with end after start.")
        if any(d not in range(1, 8) for d in (team.preferredWeekdays or [])) or any(
            value is not None and value < 0 for value in [team.maxOffNightGames, team.maxOffVenueGames]
        ):
            raise HTTPException(422, "Invalid team scheduling preferences.")

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
    home_first = [model.NewBoolVar(f"home_first_{i}") for i in range(n_fix)]

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
    pinned_fixture_indices: set[int] = set()
    for lf in req.lockedFixtures:
        target_j = slot_index_by_id.get(lf.slotId)
        if target_j is None:
            unpinned_locks.append(lf)
            continue
        matched = False
        for i, (a, b) in enumerate(fixtures):
            if i not in pinned_fixture_indices and {a, b} == {lf.homeTeamId, lf.awayTeamId}:
                model.Add(x[i, target_j] == 1)
                model.Add(home_first[i] == int(a == lf.homeTeamId))
                pinned_fixture_indices.add(i)
                matched = True
                break
        if not matched:
            unpinned_locks.append(lf)
    # A missing or extra lock must make the problem infeasible, never disappear.
    if unpinned_locks:
        model.AddBoolOr([])

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

    # Separate inventory rows may still cover the same physical ice interval.
    for a_j in range(n_slot):
        for b_j in range(a_j + 1, n_slot):
            if available_slots[a_j].surfaceId == available_slots[b_j].surfaceId and (
                intervals[a_j][0] < intervals[b_j][1] and intervals[b_j][0] < intervals[a_j][1]
            ):
                model.Add(sum(x[i, a_j] + x[i, b_j] for i in range(n_fix)) <= 1)

    local_times = [datetime.fromtimestamp(start, zone) for start, _ in intervals]
    objective_terms = []
    band_deviations = []
    gap_deviations = []
    preference_terms = []
    home_deviations = []
    for team in req.teams:
        idxs = team_fixtures.get(team.teamId, [])
        if not idxs:
            continue
        total = len(idxs)
        home_count = sum(home_first[i] if fixtures[i][0] == team.teamId else 1 - home_first[i] for i in idxs)
        home_deviation = model.NewIntVar(0, total, f"home_{team.teamId}")
        model.AddAbsEquality(home_deviation, 2 * home_count - total)
        home_deviations.append(home_deviation)
        for j, (start, end) in enumerate(intervals):
            if any(start < _parse_ts(b.endTsUtc) and _parse_ts(b.startTsUtc) < end for b in (team.blackouts or [])):
                for i in idxs:
                    model.Add(x[i, j] == 0)
        late = [j for j, slot in enumerate(available_slots) if slot.band == "late"]
        if req.maxLateFraction is not None:
            model.Add(sum(x[i, j] for i in idxs for j in late) <= math.floor(total * req.maxLateFraction + 1e-9))
        weeks = {}
        for j, dt in enumerate(local_times):
            weeks.setdefault(tuple(dt.isocalendar()[:2]), []).append(j)
        for week, js in weeks.items():
            count = sum(x[i, j] for i in idxs for j in js)
            if req.maxGamesPerTeamPerWeek is not None:
                model.Add(count <= req.maxGamesPerTeamPerWeek)
            # Spread games across available weeks; units are scaled by week count.
            deviation = model.NewIntVar(0, max(total * len(weeks), total), f"gap_{team.teamId}_{week}")
            model.AddAbsEquality(deviation, len(weeks) * count - total)
            gap_deviations.append(deviation)
        for band in ("early", "mid", "late"):
            js = [j for j, slot in enumerate(available_slots) if slot.band == band]
            deviation = model.NewIntVar(0, max(1, total * n_slot), f"band_{team.teamId}_{band}")
            model.AddAbsEquality(deviation, n_slot * sum(x[i, j] for i in idxs for j in js) - total * len(js))
            band_deviations.append(deviation)
        for name, unwanted, limit in [
            ("night", [j for j, dt in enumerate(local_times) if team.preferredWeekdays and dt.isoweekday() not in team.preferredWeekdays], team.maxOffNightGames),
            ("venue", [j for j, slot in enumerate(available_slots) if team.preferredVenueIds and slot.venueId not in team.preferredVenueIds], team.maxOffVenueGames),
        ]:
            count = sum(x[i, j] for i in idxs for j in unwanted)
            if limit is not None:
                model.Add(count <= limit)
            preference_terms.append(count)
    fairness_weight = round(req.weights.timeSlotFairness * 100)
    gap_weight = round(req.weights.gapBalance * 100)
    home_weight = round(req.weights.homeAwayBalance * 100)
    objective_terms.extend(fairness_weight * d for d in band_deviations)
    objective_terms.extend(gap_weight * d for d in gap_deviations)
    objective_terms.extend(home_weight * n_slot * d for d in home_deviations)
    if band_deviations:
        worst = model.NewIntVar(0, max(1, n_fix * n_slot), "worst_band_deviation")
        model.AddMaxEquality(worst, band_deviations)
        objective_terms.append(fairness_weight * len(req.teams) * worst)
    objective_terms.extend(max(1, fairness_weight) * n_slot * p for p in preference_terms)
    model.Minimize(sum(objective_terms))

    # =====================================================================
    # Solve
    # =====================================================================

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(req.timeLimitSeconds)
    # Deterministic-by-seed for the default single-worker path; the full
    # solution is also persisted (locked decision #4) so multi-worker is
    # operationally safe — increase here if larger instances need it.
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = int.from_bytes(hashlib.sha256(req.seed.encode()).digest()[:4], "big") % (2**31)

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
            if not solver.Value(home_first[i]):
                home, away = away, home
            # A locked fixture retains its exact home/away designation.
            lock = next((lf for lf in req.lockedFixtures if lf.slotId == available_slots[j].slotId and {lf.homeTeamId, lf.awayTeamId} == {home, away}), None)
            if lock:
                home, away = lock.homeTeamId, lock.awayTeamId
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
        objectiveValue=solver.ObjectiveValue(),
        objectiveBreakdown=ObjectiveBreakdown(
            timeslotFairnessDeviation=sum(solver.Value(d) for d in band_deviations) / max(1, n_slot),
            homeAwayImbalance=sum(abs(sum(a.homeTeamId == t.teamId for a in assignments) - sum(a.awayTeamId == t.teamId for a in assignments)) for t in req.teams),
            gapImbalance=sum(solver.Value(d) for d in gap_deviations),
        ),
        perTeamBandCounts=per_team_bands,
        solveTimeMs=elapsed_ms,
    )
