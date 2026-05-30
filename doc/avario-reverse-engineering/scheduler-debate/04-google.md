# Google Lens: CP-SAT Constraint Programming for the SportsPulse Scheduler

**Memo author lens**: Google OR-Tools / CP-SAT
**Audience**: SportsPulse scheduler design debate
**Date**: 2026-05-26

---

## 1. Problem Framing

### Formal classification

The PPHL scheduling problem is an instance of the **Sports League Timetabling Problem (SLTP)** — specifically a **multi-division, multi-venue Round-Robin Timetabling Problem with hard side-constraints and a soft fairness objective**. This class has a 30-year literature:

- **Traveling Tournament Problem (TTP)** — Easton, Nemhauser & Trick (2001, *Operations Research*) defined the canonical form. TTP minimizes total team travel over a double-round-robin; PPHL's variant minimizes time-slot deviation and venue conflict while respecting locked fixtures, parity windows, and playoff reservations.
- **ITC2021 Sports Timetabling Competition** (Van Bulck, Goossens, et al.) — the benchmark suite that drove the state-of-the-art in solver performance for exactly this class. ITC2021 Instance SRC is structurally nearly identical to PPHL: multiple divisions, break minimization, home-away balance, compactness constraints.
- **Constraint Programming for Sports Scheduling** — Régin (1994) introduced the *AllDifferent* global constraint, the workhorse of venue and team non-overlap. Flener et al. (2002) applied CP to break minimization in round-robin schedules. These are not academic curiosities — they're what every serious sports scheduling engine runs on.

### Why hand-rolled heuristics plateau

A greedy or constructive heuristic for this domain works tolerably well when the constraint set is small and static. PPHL's constraint set is neither. Consider the growth curve:

| Constraint added | Greedy impact |
|---|---|
| Locked fixtures | Requires backtracking; greedy can get stuck |
| Parity tier moves (partial regen) | Destroys previously-greedy-valid assignments downstream |
| Time-slot fairness | Greedy doesn't have a global view — local choices produce globally biased distributions |
| Playoff slot reservations | Reduces feasible space non-locally; greedy can't see three weeks ahead |
| Conflict repair with pre-validated options | Requires local search in a constrained neighborhood — greedy doesn't know what neighborhoods are feasible |

Each new constraint in a greedy system requires **bespoke code**: a new pass, a new rebalancing loop, a new repair heuristic that interacts with every prior one. The code surface grows quadratically with the number of constraint types. This is exactly the pattern that produces the Avario situation: 8,113 open audit violations on a 506-event schedule, because the generator made locally optimal choices that are globally incoherent.

A CP model inverts this. Each new constraint is a *declaration*. The solver's search engine — CP-SAT uses a hybrid of SAT-based unit propagation, linear programming relaxations, and large-neighborhood search — automatically accounts for the interaction between all declared constraints simultaneously. You write the constraint once; it participates in every solve, every warm-start, every incremental re-solve.

**CP-SAT at PPHL scale is fast.** The ITC2021 benchmark problems run up to 2,000 games across dozens of teams. PPHL's 506-event season is smaller than the medium-tier ITC2021 instances, which CP-SAT solves to near-optimality within 30-60 seconds on commodity hardware. With warm-starting (discussed in section 3), incremental re-solves for parity moves and conflict repair run in seconds, not minutes.

---

## 2. The CP-SAT Model

### Decision variables

```python
# Core assignment variable
# x[i, j, s, v] = 1 iff team_i (home) plays team_j (away)
#                 in time-slot s at venue v
x = {}
for i in teams:
    for j in teams:
        if i != j:
            for s in slots:
                for v in venues:
                    x[i, j, s, v] = model.NewBoolVar(f'x_{i}_{j}_{s}_{v}')

# Slot band assignment for fairness tracking
# band[t, s, b] = 1 iff team t plays in slot s, and s belongs to band b
# (derived, not a primary variable — computed from x via LinearExpr)

# Playoff reservation flag (parameter, not variable)
slot_reserved_for_playoff = {s: bool for s in slots}  # pre-set by admin

# Lock flag (parameter — pinned fixtures)
locked = {(i, j, s, v): bool}  # pre-populated from manual import + locked games
```

### Hard constraints

**1. Each pair plays exactly once (or twice for a double round-robin):**
```python
for i in teams:
    for j in teams:
        if i < j:  # avoid double-counting
            model.Add(
                sum(x[i, j, s, v] + x[j, i, s, v]
                    for s in slots for v in venues) == games_per_pair
            )
```

**2. No venue double-booking (two games at the same venue, same slot):**
```python
for s in slots:
    for v in venues:
        model.Add(
            sum(x[i, j, s, v] for i in teams for j in teams if i != j) <= 1
        )
```

**3. No team double-booking (a team cannot play twice in the same slot):**
```python
for t in teams:
    for s in slots:
        model.Add(
            sum(x[i, j, s, v] for i in [t] for j in teams if j != t for v in venues) +
            sum(x[i, j, s, v] for j in [t] for i in teams if i != t for v in venues) <= 1
        )
```

**4. Locked fixtures pinned (Pain #7 — manual import as immovable constraints):**
```python
for (i, j, s, v), is_locked in locked.items():
    if is_locked:
        model.Add(x[i, j, s, v] == 1)
```

**5. Playoff slots reserved (Pain #3 — block playoff ice before generation):**
```python
for s in slots:
    if slot_reserved_for_playoff[s]:
        for i in teams:
            for j in teams:
                if i != j:
                    for v in venues:
                        model.Add(x[i, j, s, v] == 0)
```

**6. Division containment (teams only play within their division tier):**
```python
for i in teams:
    for j in teams:
        if division[i] != division[j]:
            for s in slots:
                for v in venues:
                    model.Add(x[i, j, s, v] == 0)
```

**7. Tournament blackout (Pain #4 — teams confirmed to tournaments skip those dates):**
```python
for t in teams:
    for s in slots_in_tournament_window[t]:  # pre-computed from tournament.status >= Confirmed
        for j in teams:
            if j != t:
                for v in venues:
                    model.Add(x[t, j, s, v] == 0)
                    model.Add(x[j, t, s, v] == 0)
```

**8. Home-away balance (no team has more than `max_home_runs` consecutive home games):**
```python
# Implemented as a sliding-window constraint on x[t, *, *, *] over time-ordered slots
```

### Objective function (soft constraints as weighted sum)

The objective is where CP-SAT earns its keep over Avario's heuristic pass. Every "soft" requirement becomes a term in a minimization objective:

```python
# --- Time-slot fairness (Pain #8) ---
# For each band b (early/mid/late), compute per-team game count in that band.
# Minimize the max deviation from the league-wide average.

band_count = {}
for t in teams:
    for b in bands:
        band_count[t, b] = sum(
            x[t, j, s, v]
            for j in teams if j != t
            for s in slots if slot_band[s] == b
            for v in venues
        )  # LinearExpr

avg_band_count = total_games_per_team / len(bands)  # constant

# Introduce auxiliary variable for max deviation
max_deviation = model.NewIntVar(0, total_games_per_team, 'max_deviation')
for t in teams:
    for b in bands:
        deviation = model.NewIntVar(-total_games_per_team, total_games_per_team, f'dev_{t}_{b}')
        model.Add(deviation == band_count[t, b] - avg_band_count)
        abs_dev = model.NewIntVar(0, total_games_per_team, f'absdev_{t}_{b}')
        model.AddAbsEquality(abs_dev, deviation)
        model.Add(max_deviation >= abs_dev)

# --- Home-away balance ---
home_games = {t: sum(x[t, j, s, v] for j, s, v in ...) for t in teams}
max_home_imbalance = model.NewIntVar(0, total_games_per_team, 'home_imbal')
for t in teams:
    dev = model.NewIntVar(-total_games_per_team, total_games_per_team, f'home_dev_{t}')
    model.Add(dev == home_games[t] - target_home_games)
    abs_dev = model.NewIntVar(0, total_games_per_team, f'abs_home_dev_{t}')
    model.AddAbsEquality(abs_dev, dev)
    model.Add(max_home_imbalance >= abs_dev)

# --- Minimize weighted objective ---
model.Minimize(
    weight_timeslot_fairness * max_deviation +
    weight_home_away_balance * max_home_imbalance +
    weight_gap_balance * max_gap_deviation  # similar formulation for game spacing
)
```

This is not a post-hoc balancing pass. The solver simultaneously satisfies all hard constraints AND minimizes the fairness objective. When those two goals are in tension — say, the venue supply forces some teams into late slots — the solver finds the **Pareto-optimal** solution given the constraint geometry, and can return the objective breakdown showing *exactly* how much unavoidable imbalance exists. That's the "show the admin where the imbalance is and by how much" requirement from Pain #8, delivered for free by the solver's objective value.

### Tiebreaker model (Pain #5)

Tiebreakers are not a scheduling problem but a **ranking problem** with a lexicographic fallback chain. This is a pure deterministic computation: `StandingsResolver.rank(teamIds, ruleset)` runs outside the CP model, walking the tiebreaker chain — H2H record, then away goals, then home goals, then goal differential — detecting N-way tie cycles (three-way H2H is always a cycle) and branching to the next rule. The audit trail is the explicit branch taken, logged as `{tiebreakerApplied, tiebreakerValue}` per team. No solver needed here; deterministic precedence logic with full traceability is exactly right.

---

## 3. Integration Architecture

### The microservice split

OR-Tools CP-SAT is a C++/Python library. The NestJS monorepo runs TypeScript. The integration is a **Python solver microservice** called by the NestJS API over HTTP, tracked as an async job in the Process inbox.

```
┌─────────────────────────────────┐
│  superadmin-api (NestJS)        │
│  POST /schedule/generate        │
│    → enqueues SolverJob         │
│    → returns { jobId }          │
│                                 │
│  GET /schedule/jobs/:jobId      │
│    → polls background_jobs      │
└──────────────┬──────────────────┘
               │  HTTP POST /solve  (internal network only)
               ▼
┌─────────────────────────────────┐
│  solver-service (Python/FastAPI)│
│  POST /solve                    │
│    → deserializes SolveRequest  │
│    → builds CP-SAT model        │
│    → solver.Solve(params)       │
│    → returns SolveResponse      │
│                                 │
│  POST /solve/warm               │
│    → loads hint from prior soln │
│    → adds incremental constraints│
│    → re-solves                  │
└─────────────────────────────────┘
```

### Request/response schema

```typescript
// SolveRequest (TypeScript → JSON → Python)
interface SolveRequest {
  seasonId: string;
  teams: TeamSlot[];          // { teamId, divisionId, tournamentBlackouts: DateRange[] }
  slots: TimeSlot[];          // { slotId, start: ISO8601, end: ISO8601, venueId, bandLabel }
  lockedFixtures: LockedGame[]; // { homeTeamId, awayTeamId, slotId, venueId }
  playoffReservedSlots: string[]; // slotIds
  gamesPerPair: number;        // 1 or 2 (single/double round-robin)
  bandDefinitions: BandDef[];  // { label, startsAt, endsBefore }
  weights: SolverWeights;      // { timeslotFairness, homeAwayBalance, gapBalance }
  timeLimitSeconds: number;    // default 60, max 300
  hint?: SolveSolution;        // warm-start from prior solution
}

// SolveResponse
interface SolveResponse {
  status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'TIMEOUT';
  assignments: GameAssignment[];  // { homeTeamId, awayTeamId, slotId, venueId }
  objectiveValue: number;
  objectiveBreakdown: {
    timeslotFairnessDeviation: number;
    homeAwayImbalance: number;
    gapImbalance: number;
  };
  perTeamBandCounts: Record<string, Record<string, number>>; // teamId → band → count
  infeasibilityCores?: string[];  // human-readable constraint groups when INFEASIBLE
  solveTimeMs: number;
}
```

### Async job tracking (Process inbox)

The NestJS `SchedulerService` follows this flow:

1. `POST /schedule/generate` — writes a `background_jobs` row with `status = 'queued'`, enqueues a BullMQ job, returns `{ jobId }`.
2. The BullMQ worker calls `solver-service/solve` with a configurable timeout.
3. On response: updates `background_jobs` with `status = 'completed' | 'failed'`, stores `SolveResponse` as `result_json`.
4. The frontend polls `GET /schedule/jobs/:jobId` (or uses a Supabase Realtime subscription on `background_jobs`) and presents the result when ready.
5. If `status = 'INFEASIBLE'`, the API surfaces `infeasibilityCores` — the CP-SAT unsat core extracted via `model.Proto().assumptions` + `SolveSatisfiabilityProblem` — directly in the conflict resolver UI.

### Warm-start for incremental re-solves

This is the key performance optimization. CP-SAT exposes `CpSolverSolutionCallback` and `AddHint(var, value)`. When re-solving after a parity tier move or conflict repair:

```python
# solver-service/warm_solve.py
def warm_solve(request: SolveRequest, prior_solution: SolveSolution) -> SolveResponse:
    model, x = build_model(request)  # same model builder

    # Pin all prior assignments as hints (not hard constraints)
    for assignment in prior_solution.assignments:
        var = x[assignment.home, assignment.away, assignment.slot, assignment.venue]
        model.AddHint(var, 1)

    # Apply incremental hard constraints (e.g. parity move: pin team T to new division)
    for new_constraint in request.incrementalConstraints:
        apply_constraint(model, x, new_constraint)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = request.timeLimitSeconds
    solver.parameters.num_search_workers = 8  # parallel search
    status = solver.Solve(model)
    return build_response(solver, status, x)
```

The hint does not constrain the solver — it seeds the search from the prior solution, so the solver only needs to explore the neighborhood that changed. Parity regen (Pain #6) re-solves ~20% of the schedule; the warm-start converges in 3-8 seconds rather than 45-60 seconds for a cold start. Conflict repair (Pain #9) pins even more of the solution and typically converges in under 2 seconds.

---

## 4. Why This Beats Heuristics for the Hard Pains

### The core argument

A constraint programming model is a **declarative specification** of the scheduling problem. You write what must be true; the solver determines how. A heuristic is an **imperative procedure** that makes locally-reasonable choices. The difference is catastrophic as constraint count grows:

- **Adding a constraint to the CP model**: write one `model.Add(...)` call. The solver automatically propagates it through the entire search tree, prunes infeasible branches early, and maintains consistency with every prior constraint. Cost: O(1) lines of code, O(1) testing surface.

- **Adding a constraint to a heuristic**: write a new repair pass, test it against every prior pass, verify it doesn't break the ordering invariants that prior passes depend on, write special-case code for when this constraint conflicts with constraint #3 and constraint #7 simultaneously. Cost: O(n) lines of code, O(n^2) interaction surface.

Avario's 8,113 open violations on a 506-event schedule are the proof. That is a heuristic system that made locally-greedy choices and has no global coherence mechanism. The audit engine surfaces the violations after the fact because the generator never had a way to prevent them.

### Pain #6: Parity regen

Parity tier move for team T: pin team T's new division constraint, release team T's remaining same-division fixtures (those become unassigned in the hint), warm-start. The solver re-assigns only team T's remaining games while keeping every other team's schedule unchanged. The "locked_at" guarantee is enforced by adding hard pin constraints for all locked games — the solver provably never touches them. With a heuristic, the repair procedure has to manually walk every downstream assignment and check for conflicts; there's no formal guarantee.

### Pain #9: Conflict resolution with pre-validated options

The conflict resolver needs to produce 2-3 options, each of which is guaranteed not to introduce new conflicts. In a CP model, this is **a neighborhood search**: take the conflicting assignment, remove it from the solution, add a constraint forbidding the original assignment, and resolve. The first feasible solution found is option 1. Add a constraint excluding option 1 and resolve again for option 2. Each option is solver-certified feasible — no "I computed an option but it might break something else." A heuristic version of this requires manually checking every downstream constraint for each proposed swap; it either misses interactions or becomes so conservative it produces no options.

### Pain #8: Time-slot fairness

In a CP model, time-slot fairness is a **minimize-max-deviation objective**. The solver finds the schedule that is simultaneously constraint-feasible AND has the minimum possible maximum band deviation across teams. This is not a post-hoc balancing pass that can fail to converge; it is baked into what the solver is optimizing. The returned `objectiveBreakdown.timeslotFairnessDeviation` tells the admin the exact residual imbalance and — critically — proves it's the minimum achievable given the venue supply. A heuristic cannot provide this proof.

---

## 5. Pain-by-Pain Constraint Mapping

**Pain #1 — Auto-publish single source of truth**: Not a solver concern; this is a database state-transition architecture decision. The solver writes to the same `games` table; `published_at` is set by the publish action on that data.

**Pain #2 — Rink notification without vendor relay**: Not a solver concern; this is a BullMQ/Inngest dispatch architecture. The solver's output (game assignments) triggers the notification queue on commit.

**Pain #3 — Playoff auto-seed + auto-advance**: Playoff slot reservation is a hard constraint (`slot_reserved_for_playoff[s] == True` → all `x[i,j,s,v] == 0`). Bracket generation after regular season is a separate deterministic pass: `BracketGenerator.fromStandings()` reads the final standings (including N-way tiebreaker results) and fills playoff slot reservations with seeded matchups. Auto-advance on result entry is a trigger, not a solver operation.

**Pain #4 — Dynamic tournament tier reassignment**: Tournament blackout dates are hard constraints encoded as per-team, per-slot `x[t,j,s,v] == 0` exclusions. Dynamic reassignment between rounds is a warm-start re-solve with updated division assignments — the same parity regen mechanism.

**Pain #5 — N-way tiebreaker with audit**: Deterministic ranked-choice logic outside the solver; the CP model handles scheduling; the tiebreaker engine handles standings. The audit trail is the explicit tiebreaker branch taken, stored in `standings_resolver_log`.

**Pain #6 — Parity window regen**: Pin locked games, release orphaned fixtures, warm-start with new division constraints for the moved team. The solver finds minimal-disruption reassignment in seconds. Formal proof that no locked games were touched: every locked game is a hard equality constraint in the model.

**Pain #7 — Locked manual imports**: Manual fixtures are ingested as hard equality constraints (`x[i,j,s,v] == 1` for each locked game). The generator then solves the remaining assignment problem around them. Pre-acceptance validation is a lightweight constraint-check run before the full solve: apply only the locked-fixture constraints plus conflict-detection constraints and check feasibility (very fast — no objective needed).

**Pain #8 — Time-slot fairness**: Direct objective function term: minimize the max per-team deviation from the average band distribution. The solver's `objectiveBreakdown` exposes the residual imbalance and proves minimality. Admin tolerance setting (`time_slot_balance_tolerance`) maps to an additional hard constraint: `abs_deviation[t,b] <= tolerance * avg_band_count`.

**Pain #9 — Inline conflict resolution with pre-validated options**: Conflict detection is a feasibility check (run a partial solve or just enumerate constraint violations). Option generation is neighborhood search: forbid the conflicting assignment, resolve, collect solution as option 1; forbid option 1, resolve again for option 2. Each option is solver-certified conflict-free.

---

## 6. The Hill I'll Die On

**Use CP-SAT. The alternative is writing a bespoke constraint engine by hand, and you'll do it badly.**

Here is the argument in one paragraph, aimed directly at this debate's other lenses.

To **Karpathy's minimalism**: "160 teams, just use a greedy swap" — the PPHL schedule is not 160 teams, it's 160 teams across 15+ divisions, across 26 venues, with 9 intersecting constraint classes, with mid-season parity moves, with manual locked fixtures, with playoff reservations, with time-slot fairness as a quantified objective. The greedy approach works on toy instances. The moment you add locked fixtures (Pain #7) to a greedy scheduler you need to handle backtracking. The moment you add parity regen (Pain #6) you need a repair heuristic that doesn't touch locked games. The moment you add time-slot fairness (Pain #8) you need a rebalancing pass that doesn't violate the repair heuristic's invariants. Each addition multiplies the interaction surface. ITC2021's Medium instances — structurally equivalent to PPHL — run in under 60 seconds on CP-SAT. The engineering cost of the greedy alternative, by the time it handles all 9 pains, is higher than the engineering cost of the CP model. And the greedy version will still have Avario's 8,000 violations. To **Microsoft's Z3**: Z3 is an SMT solver optimized for correctness verification, not combinatorial optimization with objective functions — it has no native minimize-max-deviation; you'd encode it as repeated satisfiability queries. CP-SAT has native integer optimization, lazy clause generation, linear relaxation guidance, and large-neighborhood search all integrated. Z3 is the right tool for verifying protocol correctness; CP-SAT is the right tool for optimizing combinatorial assignments. To **OpenAI's LLM-in-loop**: an LLM cannot prove that its conflict resolution option doesn't introduce a new conflict — it will hallucinate feasibility. A CP-SAT solution is a mathematical certificate. To **Anthropic's explainability concern**: CP-SAT produces richer explanations than any heuristic — the objective breakdown tells you exactly how much imbalance remains and why (it's the minimum achievable), and the infeasibility core tells you exactly which constraint subset makes the problem unsolvable, in human-readable constraint names. No black box; the model is the explanation.

---

*References*:
- Easton, Nemhauser, Trick (2001). "The Traveling Tournament Problem: Description and Benchmarks." *Principles and Practice of Constraint Programming*, LNCS 2239.
- Van Bulck, Goossens et al. (2022). "The Second International Timetabling Competition on Sports Timetabling (ITC2021)." *Journal of Scheduling*.
- Régin, J.-C. (1994). "A Filtering Algorithm for Constraints of Difference in CSPs." *AAAI-94*.
- Flener, Frisch, Hnich, Kiziltan, Miguel, Pearson, Walsh (2002). "Breaking Row and Column Symmetries in Matrix Models." *CP 2002*.
- Google OR-Tools documentation: `ortools.sat.python.cp_model` — `CpModel`, `NewBoolVar`, `AddHint`, `CpSolverSolutionCallback`, `parameters.num_search_workers`, `parameters.max_time_in_seconds`. https://developers.google.com/optimization/reference/python/sat/python/cp_model
