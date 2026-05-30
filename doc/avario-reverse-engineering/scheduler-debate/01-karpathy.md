# Design Memo: SportsPulse League Scheduler — Karpathy Lens
**Ruthless minimalism. Ship software that works. Earn complexity.**

---

## 1. Problem Framing

Strip away the product language. What is this, actually?

You have a finite set of **ice slots** (venue × date × start-time, each with a duration) and a finite set of **team pairs** that need to play each other a specified number of times. The scheduler's job is to assign each required game to a slot such that:

- No team plays twice in the same time window (hard constraint)
- No venue hosts two games on the same sheet at the same time (hard constraint)
- Some games are pre-pinned to specific slots and cannot move (hard constraint — pain #7)
- Time-slot exposure is roughly equal across teams (soft constraint — pain #8)
- Home/away balance is roughly equal across teams (soft constraint)
- Teams confirmed in tournaments are absent from their travel dates (hard constraint — pain #4/6)

That's it. At PPHL's scale — 160 teams, ~506 events per season across ~26 venues — the combinatorial search space is large in the abstract but **trivially bounded in practice**. A 16-team division with 10 weeks of play has at most 120 required fixtures and maybe 200 available slots. The real "hard" instances are multi-division conflicts where the same venue and the same teams appear across tiers, but even then you're talking hundreds of constraints, not millions.

This is **not** a general CSP requiring heavy-metal solvers. It is a bipartite matching problem on top of a filterable event graph, with a fairness post-pass. The PPHL audit engine (07-analyze-audit.md) surfaces ~8,000 "issues" on a 506-event schedule — but look at the actual distribution: 2,449 of them are "Required Days" (soft preferences, not hard infeasibilities) and 3,539 are "In-House Game Balancing" (distribution quality, not correctness). The real hard-error count is 265. That ratio tells you everything: the schedule is not a constraint-satisfaction problem that requires a solver to find a feasible point — it is a **mostly-greedy assignment** followed by a quality audit. The audit is the hard part to build; the solver is not.

The framing that matters: **schedule generation is the easy pass; schedule health auditing + incremental repair is the daily-driver product**.

---

## 2. Core Algorithm Recommendation

### Phase 1 — Greedy Construction (hardest-constrained-first)

Order unassigned fixtures by decreasing constraint-density, then assign each to its best available slot.

```
function generateSchedule(divisionId, seasonId):
  fixtures = buildRequiredFixtures(divisionId)          # round-robin pairs × games-per-pair
  lockedGames = db.games.where(divisionId, locked=true) # pain #7 — immovable
  availableSlots = db.events.where(seasonId, unassigned=true)
                            .excluding(lockedGames.slots)
                            .excluding(playoffReservations) # pain #3

  # Score each slot for each fixture: fewer eligible slots = harder fixture
  fixtures.sortBy(f => countEligibleSlots(f, availableSlots))  # hardest first

  assignment = {}
  for fixture in fixtures:
    candidates = availableSlots
      .filter(s => !teamConflict(fixture, s, assignment))      # hard
      .filter(s => !venueConflict(s, assignment))              # hard
      .filter(s => !tournamentBlackout(fixture.teams, s))      # hard
      .sortBy(s => slotFairnessScore(fixture, s, assignment))  # soft: prefer slots
                                                               #   that reduce team's
                                                               #   late-game count
    if candidates.empty:
      unresolved.add(fixture)                 # surface as audit finding, not crash
    else:
      best = candidates[0]
      assignment[fixture] = best
      availableSlots.remove(best)

  return { assignment, unresolved }
```

This is O(F × S) where F = fixtures and S = slots. For PPHL's numbers (F ≈ 200 per division, S ≈ 500 total), this is microseconds per division. The "hardest first" ordering is the key heuristic — it's the same insight behind minimum-remaining-values in backtracking solvers, but here we don't need full backtracking because conflicts are rare enough that greedy succeeds on 95%+ of fixtures.

### Phase 2 — Fairness Balancing Pass (local search)

After initial assignment, check time-slot band distribution per team (pain #8). Compute each team's early/mid/late percentage. For teams outside the tolerance band, attempt a series of swaps:

```
function rebalanceTimeSlots(assignment, tolerance):
  bandProfile = computeBandProfile(assignment)   # {teamId: {early: 0.4, mid: 0.3, late: 0.3}}
  violations = teamsOutsideTolerance(bandProfile, tolerance)

  for team in violations:
    overloadedBand = team.worstBand()
    candidateSwaps = assignment
      .where(team is participant, slot in overloadedBand)
      .crossJoin(assignment.where(team is NOT participant, slot NOT in overloadedBand))
      .filter(swapIsLegal)          # no new hard conflicts created
      .sortBy(swapFairnessGain)     # largest delta in band score first
      .take(1)
    if candidateSwaps:
      applySwap(candidateSwaps[0], assignment)
      # recompute bandProfile and repeat until stable or max_iterations

  return { assignment, residualImbalance }
```

This is hill-climbing — simple, deterministic, debuggable. Max iterations is 50 per team in practice. If the schedule is so constrained that no legal swap reduces imbalance below tolerance, **surface the residual imbalance to the admin** with exact numbers rather than silently accepting a biased schedule. That transparency is the product differentiator.

### Phase 3 — Conflict Resolver (bounded local search for pain #9)

The conflict resolver is a separate pass that runs on demand (or after any manual mutation) and proposes up to 3 repair moves per conflict:

```
function proposeConflictResolutions(conflict):
  # A conflict = two games sharing venue×time or team×time
  options = []

  # Option strategy 1: slide one game forward/back in the same venue
  for delta in [-2h, +2h, -1day, +1day]:
    candidate = shift(conflict.gameA, delta)
    if isLegal(candidate, existingAssignment):
      options.add({ move: "shift", game: A, delta, preview: describeMove(...) })

  # Option strategy 2: swap venue (same time, different rink)
  for altVenue in nearbyVenues(conflict.venue):
    candidate = reassign(conflict.gameA, altVenue)
    if isLegal(candidate, existingAssignment):
      options.add({ move: "venue_swap", game: A, venue: altVenue, ... })

  # Option strategy 3: swap games (A takes B's original slot)
  for otherGame in gamesNearDate(conflict.date):
    if swapIsLegal(conflict.gameA, otherGame, existingAssignment):
      options.add({ move: "swap", gameA, gameB: otherGame, ... })

  return options.sortBy(disturbanceScore).take(3)  # least-disruptive first
```

Each option is validated fully before being shown. "Least-disruptive" = fewest downstream changes. This is not a solver; it's a bounded neighborhood search capped at maybe 100 candidates per conflict, which runs in under 100ms.

### Complexity Honest Assessment

- Greedy construction: O(F × S log S) with sorted candidates — fast.
- Fairness pass: O(T × F × S) per iteration, T = teams, max 50 iterations — fast.
- Conflict resolver: O(C × K) where C = candidates considered per conflict (bounded ≤ 100), K = conflicts — fast.
- Audit engine: O(R × E) where R = rules, E = events — this is the real work, but it's embarrassingly parallel SQL queries, not search.

No exponential blowup anywhere. The whole scheduler for a 16-team division runs in well under a second. The whole season audit runs in under 5 seconds as SQL.

---

## 3. Where I'd Refuse Complexity

**What I would NOT build (yet):**

**1. CP-SAT / OR-Tools integration.** Google's OR-Tools CP-SAT solver is excellent. It is also 200KB of native binary, requires a separate job queue, produces solutions that are hard to explain to a non-engineer, and needs a careful model to encode soft constraints as weighted penalties. For 160 teams and 506 events, it is a bulldozer for a job that needs a shovel. The greedy + hill-climbing approach produces schedules that are good enough, runs synchronously in the web request (or a short background job), and has stack traces a developer can read. Bring in CP-SAT when: (a) you have a season with 500+ teams and 5,000+ games where greedy consistently fails to find feasible assignments, OR (b) you need to prove globally-optimal fairness, not just "within tolerance." Neither applies to PPHL today.

**2. Z3 / SMT encoding.** SMT solvers are beautiful for verifying logical properties of protocols. They are the wrong tool for scheduling. The encoding overhead alone would dwarf the actual computation. Worse, Z3 returns SAT/UNSAT — unhelpful for the admin who needs "move this game here" not "no solution exists."

**3. LLM-in-the-loop for schedule generation.** An LLM cannot produce a verified conflict-free schedule. It can hallucinate a convincing-looking schedule with subtle double-bookings. The audit engine would catch the hallucinations, but why pay the latency and nondeterminism tax for a generation step that a 50-line greedy loop handles perfectly? LLMs are the right tool for natural language *interfaces* to the scheduler ("move all Team A games off Thursdays in February") — not for the scheduling computation itself.

**4. Global re-optimization on every edit.** When an admin locks one game, don't re-run the entire season schedule. Re-run only the affected division's unresolved fixtures. The scheduler must be **surgical**, not a batch rebuild, because real-world ops are continuous.

**Where complexity IS genuinely warranted:**

- **N-way tiebreaker engine** (pain #5): This is actually a surprisingly subtle algorithm. A 4-way head-to-head cycle has no meaningful H2H winner. The fallback chain (away goals → home goals → goal differential) needs to be provably correct and auditable. This deserves careful implementation and test fixtures for every tie-type, but it's still deterministic pure-function logic, not a solver.
- **Parity window partial regeneration** (pain #6): The "remove orphaned fixtures, regenenerate into available slots" pass is the hardest algorithmic piece in the whole system. Getting it right — especially the "prove we didn't touch locked games" requirement — needs care. But it's still the same greedy construction algorithm applied to a subset, not a new class of problem.

---

## 4. Pain-by-Pain

**Pain #1 — Schedule doesn't auto-publish to public website.**
Trivial. Architecture stance: `published_at IS NOT NULL` column on `games`, edge revalidation on every mutation touching a published row. The existing `games` table in `packages/db/src/schema/game.ts` needs `published_at timestamp` and `locked_at timestamp` columns added. Zero algorithm.

**Pain #2 — Change-notify button broken by 3-vendor API chain.**
Trivial algorithmically. BullMQ queue with per-rink adapters and a dead-letter inbox. The "hard" part is writing the SportsEngine + Arbiter adapters, not the dispatch logic.

**Pain #3 — No auto-seeding, no auto-advancement in playoffs.**
Moderate. Bracket generation from standings is a solved pattern: sort by points, apply 1v(N), 2v(N-1) seeding, fill playoff_slot_reservations. Auto-advancement on result entry is a simple trigger: `on game.finalized where game.gameType='playoff', advance winner to next_slot_id`. The `playoff_config` jsonb column already exists on `divisions` in the schema. This is plumbing, not computer science.

**Pain #4 — No dynamic tournament tier reassignment.**
Moderate. Evaluate last-round results per team, compute new tier assignments, call the partial regenerator for round N+1. The `tournament_tier_assignments` table proposed in the spec is the right model. Complexity lives in the "teams with byes" and "3-way tie" edge cases — not in the core algorithm.

**Pain #5 — 3-way tiebreaker has no logic.**
Genuinely interesting but small scope. The key insight: when N >= 3 teams are all equal on head-to-head record among themselves, head-to-head is provably uninformative (each has beaten one and lost to another in a cycle). Fall through to the next tiebreaker. Implement as a pure function: `rank(teamIds[], ruleset) → [{teamId, position, rule_applied, value}[]`. Write exhaustive unit tests for 2-way, 3-way, 4-way, all-tied cases. The audit trail is a `tiebreaker_log` jsonb column on the standings row, not a separate table.

**Pain #6 — No 2-week parity window / mid-season tier moves.**
The hardest pain to get right. The challenge is not the algorithm — it's the invariant: "untouched games stay untouched." This requires `locked_at` on every game (not just manually locked ones), a clear definition of "untouched" (games that started before the parity decision date, plus any manually locked game), and careful transaction design for the orphan-removal + slot-release + regeneration sequence. Build this as an explicit state machine: `parity_window.state = pending | open | decided | applied`, with the regeneration step gated on `decided → applied` admin confirmation.

**Pain #7 — Manual schedule uploads ignored as base.**
Moderate plumbing. Parse CSV/XLSX, validate for hard-constraint violations within the upload itself (double-bookings, division mismatches), surface violations inline before commit. On commit, write with `locked = true, source = 'manual_import'`. Generator already ignores `locked = true` rows. The preview-before-commit pattern is the key UX choice.

**Pain #8 — Time-slot bias.**
Moderate. The fairness balancing pass (phase 2 above) handles this. The real product work is the admin-visible deviation report — a per-team time-band breakdown with a "worst offender" sort. The algorithm is simple arithmetic; the UI surface is what makes it a differentiator.

**Pain #9 — Conflicts require Excel round-trip.**
Moderate. The conflict resolver (phase 3 above) is bounded local search. The hard part is the UI: showing a before/after delta on hover, applying the change transactionally with audit, rolling back on cascade. The algorithm itself is 100 lines of TypeScript.

---

## 5. Risks and Honest Unknowns

**Where the minimal approach breaks down:**

1. **High venue contention across divisions.** If 12 divisions all compete for 3 venues on Friday nights, the greedy pass will produce a high unresolved count even with hardest-first ordering. Mitigation: expose the unresolved count prominently; let admin expand the search window (allow games on different days of the week). At the limit, adding a simple backtracking step (when greedy fails on a fixture, try the next-best candidate and see if it unblocks others) would help. This is not CP-SAT; it's a 20-line recursive backtrack with a depth limit.

2. **Parity window cascades.** If multiple teams move tiers at the same parity window, their orphaned slots are released simultaneously and the regenerator must fill all of them. If the slots are insufficient, you have a genuinely infeasible sub-problem. The right response is to surface the infeasibility explicitly ("Team A moved to Tier B but only 3 of the required 8 slots could be filled — here are the gaps") rather than silently generating an incomplete schedule.

3. **The 506-event season has grown to 2,000 events.** PPHL is ~160 teams today. If the platform scales to 500 teams and 2,000 games, the O(F × S) greedy pass and O(T × F × S) balancing pass still run in seconds — but the audit engine's per-rule SQL queries may need indexing attention. This is a database tuning problem, not an algorithm upgrade.

4. **Inter-division fairness constraints.** If a team plays in multiple divisions (which adult-rec leagues sometimes allow), hard-conflict checks must span divisions. The current `games` schema indexes on `(homeTeamId, scheduledStartTsUtc)` and `(awayTeamId, scheduledStartTsUtc)` — exactly the right shape for this check.

5. **The unknown: PPHL's actual constraint density.** The 8,000 audit findings on a 506-event schedule look bad, but 6,000+ of them are soft-preference "Required Days" and "Game Balancing" issues — not infeasibilities. The real question is what percentage of those are blocking for PPHL operations, and whether the tolerance knobs will be set tightly enough to make the greedy approach's residual unresolved count acceptable. This needs a conversation with PPHL before designing the tolerance UI, not after.

---

## 6. The Hill I'll Die On

**The constraint you must encode first is not time-slot fairness or home/away balance — it is the locked-game invariant, and it must be enforced at the database layer, not in application code.**

Every other lens in this debate will propose clever algorithms. The Google lens will propose CP-SAT with elegant soft-constraint weighting. The OpenAI lens will propose an LLM that "understands" the schedule. Here is what will actually happen at 11pm on a Wednesday when the PPHL scheduler is working against a deadline: someone will hit a bug, a transaction will fail half-applied, and six games will have their venue assignments overwritten — including three that PPHL's head scheduler manually locked at 9pm. That is not a hypothetical. That is the exact failure mode that caused PPHL to export to Excel in the first place. No algorithm, however sophisticated, recovers trust after it silently destroys a human's work.

The `locked_at` column must be a hard database constraint, not an application-level flag. The generator must check it in a SELECT FOR UPDATE. The conflict resolver must refuse to include locked games in its proposed swaps. The parity regenerator must verify the locked-game set is unchanged before and after — as a database assertion, not a code comment. Build this invariant into the schema before you write the first line of scheduling logic. Everything else — fairness optimization, playoff seeding, tiebreaker chains — can be iterated on and improved post-launch. A scheduler that accidentally moves a locked game is not a v1 you can iterate from; it is a trust breach you can never fully recover.

The simplest algorithm that maintains inviolable constraints beats the cleverest algorithm that violates them 0.1% of the time. Ship the constraint. Earn the complexity later.
