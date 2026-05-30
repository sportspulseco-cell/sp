# Scheduler Design Memo — Anthropic Team Lens
## Correctness, Explainability, Auditability, Graceful Degradation

*Author: Anthropic team perspective*
*Date: 2026-05-26*
*Context: SportsPulse scheduler design debate — vs. Karpathy (minimalism), Google (CP-SAT), Microsoft (Z3/SMT), OpenAI (LLM-in-loop)*

---

## 1. Problem Framing — The Schedule Is a Legal Document

Every other team in this debate will frame the scheduler as an optimization problem: given constraints C, find assignment A that minimizes cost function F. That framing is correct but incomplete for this domain.

In an adult-rec hockey league, a schedule is a **quasi-contractual commitment** made to thirty teams, two rinks, a dozen referees, and a paying public. When a captain challenges a playoff seed, they don't want to hear "the algorithm converged." They want to read a sentence: *"Your team ranked third because you and Hammocks both went 7-3 in round-robin, but Hammocks scored 12 away goals to your 9 — rule 3b in the league's 2025-2026 tiebreaker hierarchy, configured by admin finacraco@gmail.com on Oct 4."* When a team captain complains that they got seven late games in a row, the admin needs to show a per-team fairness report, not a shrug.

**The primary output of the SportsPulse scheduler is not a schedule. It is a schedule plus a complete, human-readable justification for every cell in it.** The schedule without the justification is incomplete work.

This reframing matters architecturally because it changes what the engine must preserve: not just the final assignment, but the **decision trace** — which constraint placed each game, which pass moved it, why this slot was chosen over the two alternatives the engine considered, and when a human overrode the engine's recommendation. Pains #5 (tiebreaker audit) and #8 (show the imbalance, don't silently ship it) are not edge features bolted onto a working scheduler. They are the proof that the scheduler's reasoning is correct.

The design follows directly: every game row carries a provenance trail. Every tiebreaker resolution carries the full hierarchy walk. Every balancing pass emits a fairness report. Every conflict resolution records which option was offered, which was chosen, and which constraints the system verified before committing. The schedule health surface (`/scheduling/analyze`, per `doc/avario-reverse-engineering/07-analyze-audit.md`) is not a QA step run at the end — it is a live dashboard that reflects the invariant state of the schedule at all times.

---

## 2. Invariants and Guarantees — Structural Enforcement, Not Assertions

### The hard invariants

These must hold at all times, not just after generation. Each is enforced as a **structural constraint on every mutation**, not a post-hoc check.

| Invariant | Enforcement mechanism |
|---|---|
| No venue double-booking | Unique partial index on `(venue_name, surface_label, scheduled_start_ts_utc)` in `packages/db/src/schema/game.ts` where `status NOT IN ('cancelled','postponed')`. A conflicting INSERT/UPDATE fails at the DB layer before any application code can commit it. |
| No team plays two games simultaneously | Partial unique index on `(home_team_id, scheduled_start_ts_utc)` and `(away_team_id, scheduled_start_ts_utc)` (the `homeIdx` and `awayIdx` already exist in the schema; extend them to be unique for non-cancelled games). |
| Locked games are never mutated by the engine | `locked_at IS NOT NULL` is a DB-level guard: the scheduler service's UPDATE statement includes `WHERE locked_at IS NULL` on every engine-driven write. It cannot touch a locked row even if the application has a bug. A separate `GENERATED ALWAYS AS` column `is_engine_mutable` computed from `locked_at IS NULL AND status = 'scheduled'` makes this queryable. |
| Every published game has a provenance record | FK from `games.id` to `game_provenance.game_id` with `NOT NULL` — the INSERT to `games` is wrapped in a transaction that also inserts the provenance row. If the provenance insert fails, the game insert rolls back. |
| Parity-window untouched games carry proof of non-touch | `locked_at` stamped by `ScheduleRegenerator.applyTierMove()` before the regeneration pass runs. Per pain #6 build notes: *"Critical: untouched games must have a locked_at so the regenerator can prove it didn't touch them."* |

### Deterministic, reproducible output

The scheduler engine MUST accept an explicit `seed: string` parameter. Given the same input graph (teams, venues, time slots, constraints) and the same seed, it must produce bit-for-bit identical output. This is non-negotiable for trust: when a captain disputes a schedule, the admin must be able to re-run generation with the logged seed and get the same result, then walk the decision trace to explain the outcome.

Implementation: the engine uses a seeded pseudorandom number generator (e.g., a splitmix64 PRNG initialized from the seed) for any tie-breaking in slot selection. No `Math.random()`. No `Date.now()` in decision paths. The seed is stored in `schedule_runs.seed` and surfaced in the audit log.

The `AuditWriterService` in `apps/superadmin-api/src/modules/audit/application/audit-writer.service.ts` already awaits writes synchronously (the BUG-013 fix in `audit.interceptor.ts`). The scheduler extends this: each generation run emits a single `schedules.generate` audit event with the seed, input hash, constraint set snapshot, and output game count in the `after` field. Any admin can see exactly what was fed to the engine and reproduce the result.

---

## 3. Explainability Architecture — Provenance as a First-Class Concern

### The `game_provenance` table

This is a new table in `packages/db/src/schema/game.ts`. It is not optional. Every game row owns exactly one provenance row (enforced by the FK + NOT NULL constraint described above).

```
game_provenance
  id             uuid PK
  game_id        uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE UNIQUE
  schedule_run_id  uuid NOT NULL REFERENCES schedule_runs(id)
  placement_pass   text NOT NULL   -- 'initial_assignment' | 'balancing' | 'conflict_resolution' | 'manual_import' | 'manual_override' | 'locked_import'
  constraint_ids   text[] NOT NULL -- array of constraint IDs that "placed" this game here
  candidate_slots  jsonb           -- up to 5 alternatives the engine considered and rejected, each with rejection_reason
  balancing_delta  jsonb           -- if moved by TimeSlotBalancer: {teamId, band, before_pct, after_pct}
  human_actor_id   uuid REFERENCES auth.users(id)  -- set if a human override placed or moved this game
  override_reason  text            -- human-supplied reason for manual override
  created_at     timestamptz NOT NULL DEFAULT now()
  updated_at     timestamptz NOT NULL DEFAULT now()
```

### The `schedule_runs` table

```
schedule_runs
  id             uuid PK
  season_id      uuid NOT NULL REFERENCES seasons(id)
  seed           text NOT NULL
  input_hash     text NOT NULL   -- SHA-256 of the serialized constraint + venue + team input
  constraint_snapshot  jsonb NOT NULL  -- full constraint set at time of generation
  games_created  integer NOT NULL
  games_locked_preserved  integer NOT NULL
  ran_by_user_id uuid REFERENCES auth.users(id)
  ran_at         timestamptz NOT NULL DEFAULT now()
  duration_ms    integer
  status         text NOT NULL  -- 'completed' | 'failed' | 'partial'
  infeasibility_report  jsonb   -- populated when status = 'failed' or 'partial'
```

### Tiebreaker walk records

The `StandingsResolver.rank(teamIds, ruleset)` service returns not just the ranked list but a `TiebreakerTrace` per resolved position. This trace is stored in `standings_snapshots.tiebreaker_trace jsonb`. The UI renders it as a collapsible hierarchy: hover a team's position in the standings table and see the full walk: *"Step 1: H2H record — three-way tie detected, H2H skipped (3-way ties are statistically circular per league rule). Step 2: Away goals — Hammocks 12, Marlboro Reds 9, Eastside 7. Position resolved."*

The tiebreaker ruleset is **per-season configurable** (Setup → Season → Standings) and stored as a ranked JSON array in `seasons.tiebreaker_ruleset`. The engine walks this array in order and never deviates. The trace records the exact ruleset version at the time of resolution, so rule changes mid-season don't retroactively alter logged decisions.

### Time-slot fairness report

The `TimeSlotBalancer.rebalance(scheduleId)` service emits a `TimeSlotFairnessReport` stored in `schedule_audit_findings` (per the spec in `07-analyze-audit.md`). The report contains, per team:

- Games per band (early / mid / late) as count and percentage
- Deviation from the league-configured `time_slot_balance_tolerance`
- Pre-balancing and post-balancing values
- Number of swaps performed to achieve the current distribution
- Whether the tolerance target was met; if not, the residual gap

This feeds directly into the `/scheduling/analyze` audit surface. Every team that exceeds tolerance appears as an open `TimeSlotImbalance` finding. Admins can sort by `deviation_pct DESC` to see the worst cases first.

### Extension of the existing audit interceptor

The global `AuditInterceptor` at `apps/superadmin-api/src/modules/audit/interface/audit.interceptor.ts` already writes every successful mutation. For scheduler-specific operations, the engine registers **explicit before/after diffs** via `AuditWriterService.write({ before, after })` rather than relying on the coarse URL-based inference. The `before` field for a `schedules.generate` action carries the previous schedule summary (game count, fairness metrics, open findings count). The `after` field carries the new values. An admin reading the audit log can see at a glance: *"Generation run at 14:32 by admin X: 156 games placed, 0 locked games touched, fairness deviation reduced from 34% to 8%, 3 infeasibilities reported."*

---

## 4. Graceful Degradation — Infeasibility Is Information, Not Failure

When the constraint solver cannot produce a fully valid schedule, it must **never**:
- Silently relax a constraint
- Ship a schedule it knows violates a hard constraint
- Return a "best effort" result without clearly labeling what was sacrificed

Instead, it reports an **Infeasibility Report** via the `schedule_runs.infeasibility_report jsonb` column and surfaces it in a blocking interstitial before the admin can see the generated schedule.

### Infeasibility report structure

```jsonb
{
  "summary": "12 games could not be placed within constraints",
  "hard_violations": [
    {
      "type": "venue_capacity_exceeded",
      "description": "Eastside Arena Blue Sheet has 3 overlapping assignments on Nov 14 between 18:00–22:00",
      "games_affected": ["<uuid>", "<uuid>", "<uuid>"],
      "slack_needed_minutes": 60,
      "resolution_hint": "Add one additional venue slot on Nov 14 or move 1 game to Nov 15"
    }
  ],
  "soft_violations": [
    {
      "type": "time_slot_balance_unachievable",
      "description": "Team 'Hammocks' cannot achieve ≤30% late games given venue availability; current minimum is 41%",
      "team_id": "<uuid>",
      "target_pct": 0.30,
      "achievable_min_pct": 0.41,
      "resolution_hint": "Increase late-game tolerance to 42% or add two early/mid slots in the venue pool"
    }
  ],
  "unplaced_games": 12,
  "placed_games": 144,
  "seed": "abc123",
  "ran_at": "2026-11-01T14:32:00Z"
}
```

The admin-facing UI renders this as a conflict card before any schedule is visible. Each hard violation shows:
- The constraint that failed
- The gap (how many more slots / fewer constraints would be needed to resolve it)
- A pre-computed `resolution_hint` from the engine's slack analysis

This connects directly to pain #9: the pre-computed resolution options in `ConflictResolver.proposeOptions(conflict)` use the same slack analysis the infeasibility report uses. The engine already does the work of figuring out what *would* fix the problem — the infeasibility report is just that analysis surfaced before generation completes rather than after.

**Constraint relaxation requires explicit human authorization.** If the admin wants to override a hard constraint (e.g., "accept this venue double-booking because both teams agreed"), they must click through a confirmation dialog, supply a reason, and their decision is written to `game_provenance.override_reason` with their `human_actor_id`. The system never silently makes this choice.

### Partial regeneration (parity window moves, per pain #6)

When `ScheduleRegenerator.applyTierMove()` cannot fill all orphaned slots in the new tier, it does not guess. It stops, writes a partial infeasibility report, and presents the admin with the exact count: *"6 of 8 games were successfully rescheduled. 2 games have no valid slot in the available window given the current venue pool. Options: extend the parity window by one week, or manually assign these 2 games."* The 6 placed games are committed; the 2 unplaced games remain as `status = 'unassigned'` findings in the audit surface.

---

## 5. Pain-by-Pain — The Explainability Dimension

**Pain #1 — Auto-publish.** Provenance is the prerequisite: a game can only be published if `game_provenance.game_id IS NOT NULL`, ensuring no game reaches the public website without a traceable origin. The `published_at` transition triggers an audit event via the existing `AuditInterceptor`.

**Pain #2 — Rink notifications.** Every notification dispatch is logged with delivery status, retry count, and failure detail. The rink-notification health indicator in the Process inbox (`15-process.md`) is the explainability surface: admins see exactly which rink missed which notification and why.

**Pain #3 — Playoff brackets.** `BracketGenerator.fromStandings()` writes a `bracket_provenance` record per seed assignment: which standing position drove which seed, which tiebreaker walk produced that standing. When a captain disputes their playoff seed, the trace is one click away.

**Pain #4 — Dynamic tournament tier reassignment.** `TournamentReseed.evaluate(roundId)` writes per-team tier change records with the prior-round stats that drove the recommendation. Admin confirmation is required and logged; the confirmation is the audit record that authorizes the tier move.

**Pain #5 — Three-way tiebreaker.** The full `TiebreakerTrace` per resolved position is the entire fix here. "Tied with X and Y on H2H — H2H skipped (3-way, statistically circular) — resolved by away goals (12 vs 9 vs 7)" is the single sentence that turns a disputed position into an accepted one. Without this, any tiebreaker logic, no matter how correct, will be challenged.

**Pain #6 — Parity window + partial regen.** `locked_at` on untouched games is the proof that the regenerator didn't alter them. The infeasibility report on unplaced slots means admins never discover a broken schedule three days later — they see the problem immediately and with remediation options.

**Pain #7 — Manual locked fixtures.** `source = 'manual_import'` and `locked = true` on every imported row is the audit record. `ManualScheduleImport.preview()` returns violations inline before commit, so the import itself is auditable: violation_count_resolved is logged, as are the importing user and the pre-commit validation state.

**Pain #8 — Time-slot fairness.** The `TimeSlotFairnessReport` is specifically the answer to "show the admin where the imbalance is and by how much" — the exact language from the pain description. This is not a nice-to-have; it is the explicit requirement stated in the brief.

**Pain #9 — Inline conflict resolution.** Each pre-computed option from `ConflictResolver.proposeOptions()` must document which constraints it satisfies, which it relaxes, and what its side effects are on adjacent games. When an admin clicks an option, the delta is logged as a `conflict_resolution` pass in `game_provenance.placement_pass` for every affected game.

---

## 6. The Hill We Will Die On — Determinism and Provenance Are Non-Negotiable

The Karpathy argument will be: keep it simple, write a greedy heuristic, ship fast. The Google argument will be: CP-SAT is proven correct and globally optimal. The Microsoft argument will be: Z3 gives you formal verification of constraint satisfaction. The OpenAI argument will be: an LLM can handle the messy, partially-specified real-world constraints that formal solvers choke on.

Here is the problem with every one of those positions in this specific domain: **a schedule you cannot explain is a schedule you cannot defend.**

CP-SAT finds a provably optimal solution and produces no human-readable justification for why slot A was chosen over slot B. Z3 formally verifies that no constraints are violated and tells you nothing about how it decided between equally valid assignments. An LLM in the loop produces naturalistic text about its reasoning, none of which is verifiable or reproducible — run the same prompt twice and you get two different schedules and two different explanations. The greedy heuristic is the most honest of the group: at least it's simple enough to trace by hand. But it has no infeasibility analysis, no provenance model, and no fairness reporting.

Adult-rec league administrators are not researchers who care whether the solution is globally optimal. They are operational staff who will receive an angry email from a captain at 11pm on a Thursday claiming the schedule is unfair. At that moment, the value of the system is entirely determined by its ability to produce a sentence like: *"Your team received 4 late games because the Eastside Arena Blue Sheet was unavailable before 9pm on the 6 Tuesdays when you were originally slated for early slots — the specific dates are Nov 4, Nov 11, Nov 18, Dec 2, Dec 9, Dec 16. The balancing pass redistributed the remaining 2 late slots to the Marlboro Reds and Northgate Hawks, achieving the closest achievable distribution within the configured 30% tolerance. The full fairness report is at [link]."*

No non-deterministic component, no black-box solver, and no LLM can produce that sentence and stand behind it. We can. The engine we are proposing is a deterministic, seeded, constraint-aware scheduler whose every decision is recorded in `game_provenance`, whose tiebreaker walks are stored in `standings_snapshots.tiebreaker_trace`, whose fairness passes emit structured reports into `schedule_audit_findings`, and whose infeasibility cases produce actionable gap analysis rather than silent failure. It extends the existing `AuditInterceptor` and `AuditWriterService` architecture that already exists in `apps/superadmin-api/src/modules/audit/` rather than inventing a parallel system. The schedule it produces may not be globally optimal. It will be correct, traceable, reproducible, and defensible — which is what leagues actually need.

Use CP-SAT or Z3 as a constraint-checking oracle if you want formal verification of the hard invariants. Never use either as the primary scheduling engine if the output of the engine cannot be explained to a non-technical captain in plain English. The provenance model is not overhead on top of the scheduler. It is the scheduler's primary deliverable.
