# Scheduler Design Memo — OpenAI/LLM-Native Lens

**Author lens**: LLM-native product thinking, eval-driven development,
agentic UX, fast iteration velocity.  
**Core tension**: a schedule is a constraint-satisfaction artifact with
provable correctness requirements. An LLM is a stochastic function over
token distributions. These two things must never be confused, and the
entire value proposition of this memo rests on drawing that line
precisely.

---

## 1. Problem Framing: Hard-Constraint Core vs. Fuzzy/Judgment Surface

### The hard-constraint core — must be deterministic and provably correct

These are not "soft preferences." A violation here breaks the league.

| Constraint | Why determinism is mandatory |
|---|---|
| No double-booking (venue × timeslot) | Two teams showing up to the same rink at the same time is a real-world collision |
| Locked fixtures untouched | Admin manually placed these — regenerating over them destroys trust irreversibly |
| Team can't play itself | Trivial but must be enforced by rule, not by model intuition |
| Playoff seeding formula (1v8, 2v7, …) | The ruleset is contractual; any deviation is a grievance |
| N-way tiebreaker hierarchy | H2H → away goals → home goals → GD in an exact cascade; the order is the rulebook |
| Home/away game counts within tolerance | A league promise to every team; fairness is a constraint |
| Time-slot band quotas (pain #8) | "No team has more than 30% late games" — either the invariant holds or it doesn't |
| Parity-window orphan removal | When a team moves, their future games in the old tier must be fully released |
| No team games that overlap in time | A team cannot play two games simultaneously |
| Playoff reservation blocks (pain #3) | Ice reserved for playoffs must not be consumed by regular-season generation |

**Every item on this list is a binary predicate.** It is satisfied or it
is not. No LLM has any business evaluating these. An LLM that says "I
think this schedule looks balanced" is useless — and actively dangerous
if it papers over a real violation with confident-sounding prose.

The right tool for this core is a **deterministic constraint engine**:
either a hand-coded rule evaluator (fast, readable, debuggable) or a
CP-SAT solver if the problem's search space genuinely requires it. For
adult-rec hockey at PPHL scale (506 events, ~30 teams per season), a
hand-coded rule engine with a greedy optimizer is probably sufficient
and far easier to test and explain than a CP solver.

### The fuzzy/judgment surface — where human judgment is being replaced

These are cases where a human would read context, weigh trade-offs, and
form an opinion. The output is a _recommendation_, not a binary
commitment.

| Decision | Why it's fuzzy |
|---|---|
| Parity-window recommendation: move up / stay / move down | Depends on recent form, margin of wins, strength of schedule, admin's league knowledge |
| Conflict-resolution option ranking (pain #9) | Three valid options exist; ranking them by "least disruption" involves reading context across the whole schedule |
| Manual-upload validation explanations (pain #7) | Violation found — explain it in plain English so admin understands what to fix |
| "Why is this game scheduled here?" natural-language query | Requires reading rule-evaluation context and translating it into human language |
| Announce schedule changes to rinks in a coherent message | Structured data → well-composed email (pain #2) |
| Tiebreaker audit explanation ("Tied on H2H, resolved by away goals: 12 vs 9 vs 7") | Structured data → readable narrative |

**Where would an LLM be a liability?**

- Anywhere it can hallucinate a fixture (a game that doesn't exist in
  the database). Guard: the model sees only engine output, never
  constructs game data itself.
- Anywhere it needs to count precisely (e.g., "how many late games does
  team X have?"). The model should never do arithmetic; it reads numbers
  the engine already computed.
- Anywhere the output is acted on without human confirmation. Every LLM
  output in this system is a draft the admin must explicitly accept.
- Parity decisions that have downstream schedule consequences. The model
  recommends; the deterministic engine executes.

---

## 2. Where the Model Earns Its Place

### (a) Parity-window recommendations (pain #6)

**What's deterministic**: `ParityRecommendation.compute(windowId)` runs
SQL over standings within the current tier: wins, losses, goal
differential, goals-for, goals-against, margin of last 3 games. It
produces a structured record per team:

```json
{
  "teamId": "abc123",
  "currentTier": "mid",
  "windowRecord": "4-1",
  "tierRank": 1,
  "pointsAboveNextTier": 8,
  "recommendedAction": "move_up"
}
```

The `recommendedAction` field is already deterministic (rank 1 in tier
= recommend up; rank last = recommend down; middle = stay). This covers
80% of cases.

**What the model adds**: the _rationale_ the admin reads before
confirming. Admins don't want to click "confirm" on a bare enum. They
want to read:

> "Eastside Hammers went 4-1 in the B2 division this window, finishing
> first by 8 points. Their goal differential (+14) was the best in the
> division. They haven't lost a game by more than one goal. Moving them
> up to B1 for the next window is consistent with the last three parity
> cycles."

That paragraph is generated from the structured record. The model cannot
invent data; it reads the numbers and narrates them. The admin sees both
the structured record and the narration and clicks confirm.

**Hallucination guard**: the prompt contains only the structured record.
It is explicitly instructed: "Do not state any numbers that are not in
the data below. Do not make claims about games not listed." Output is
validated against the source record before display (any number in the
narrative must appear in the source JSON).

### (b) Conflict-resolution option ranking (pain #9)

**What's deterministic**: `ConflictResolver.proposeOptions(conflict)`
produces up to 3 pre-validated deltas. Each delta has already been
verified by the constraint engine to not introduce a worse conflict.
Example output:

```json
[
  { "optionId": "A", "delta": [{"gameId": "g1", "newSlot": "2026-10-14T21:00", "venue": "Eastside"}], "disruptionScore": 1 },
  { "optionId": "B", "delta": [{"gameId": "g2", "newSlot": null, "venue": "Northgate", "time": "19:00"}], "disruptionScore": 2 },
  { "optionId": "C", "delta": [{"gameId": "g1", "newDate": "2026-10-16", "slot": "same-time"}], "disruptionScore": 3 }
]
```

The options are already valid. The `disruptionScore` is deterministic
(number of downstream ripple changes).

**What the model adds**: a plain-English label for each option matching
the exact format shown in pain #9:

> "Move Game A to 9pm at Eastside Arena (one change, no other games
> affected)"  
> "Move Game B to Northgate Arena at 7pm (one venue change, travel time
> for referees increases by 12 minutes)"  
> "Swap Game A to Oct 16 at the same time (two days later, involves
> rescheduling a different team's practice slot)"

The model reads the delta and the existing schedule context (other games
nearby in time, team travel patterns, referee assignments) and writes
the human-readable label. Admin clicks one. The deterministic engine
applies the delta.

**Hallucination guard**: all factual claims (times, venues, teams) are
extracted from the delta struct, not generated. The model's job is
sentence construction around verified facts, not fact generation.

### (c) Natural-language schedule queries / "why is this game here?"

Admins working a 506-event grid will have questions that don't map to
filter dropdowns: "Why does the Hammers game land on a Tuesday night
instead of Saturday?" or "Which teams have the most back-to-back game
pairs this month?"

**Architecture**: the query is parsed by the model into a structured
filter or aggregation query, executed against the database, and the
results are narrated back. The model never touches raw fixture data
without first emitting a structured query that goes through the normal
API layer.

This is the "LLM as a natural-language SQL interface" pattern. It is
only as reliable as the query it generates. Mitigate by:
1. Showing the generated query to the admin before executing (optional
   transparency mode).
2. Constraining the model to a well-typed query DSL, not raw SQL.
3. Bounding the scope to read-only queries; mutations always use the
   structured conflict resolver or explicit UI actions.

**Where this earns its keep**: the "why is this game here?" case. The
constraint engine stores audit findings in `schedule_audit_findings`.
When asked why a game is placed where it is, the model reads the
relevant audit rows and tiebreaker evaluation records, then writes a
paragraph explaining the scheduling decision. This is pure narration
of existing structured data — zero hallucination risk when the data
exists; fall back to "no audit record found for this game" when it
doesn't.

### (d) Manual-upload validation feedback (pain #7)

`ManualScheduleImport.preview(file, seasonId)` returns:

```json
{
  "violations": [
    {
      "row": 14,
      "ruleId": "double_booking",
      "gameA": { "id": "g1", "time": "2026-10-14T19:00", "venue": "Eastside" },
      "gameB": { "id": "g2", "time": "2026-10-14T19:00", "venue": "Eastside" }
    },
    {
      "row": 22,
      "ruleId": "division_mismatch",
      "team": "Hammers",
      "teamDivision": "B2",
      "gameDivision": "A1"
    }
  ]
}
```

In Avario today, the admin sees a raw error log. This is a spreadsheet
jockey workflow. The model turns each violation into:

> "Row 14: Game A (Oct 14 at 7pm, Eastside) and Game B (Oct 14 at 7pm,
> Eastside) are both assigned to the same venue at the same time. Fix by
> moving one game to a different time slot or venue."  
> "Row 22: The Hammers are registered in B2 but row 22 places them in
> an A1 game. Either move them to a B2 game or update their division
> assignment first."

This is the highest-trust use of the model in the system because the
stakes of a bad explanation are low (admin just re-checks the rule). The
model is summarizing a structured violation record — if it invents a
cause that isn't in the violation struct, the admin will catch it
immediately against their spreadsheet.

---

## 3. Eval Strategy

This is where the LLM-native discipline matters most. "It looks right"
is not a test.

### 3.1 Deterministic core: property-based invariant tests

Every hard constraint becomes a property test. Use a framework like
fast-check (TypeScript) to generate random valid inputs and assert
invariants hold after scheduling.

**Required invariants** (each is an automated test that must pass on
every scheduler run):

```
INV-01: no_double_booking
  For all (venue, timeslot) pairs, at most one game is assigned.

INV-02: locked_fixtures_untouched
  For all events where locked_at IS NOT NULL, (venue, timeslot, team1, team2)
  must be identical before and after any generation run.

INV-03: no_self_play
  For all games, team1_id != team2_id.

INV-04: no_team_time_overlap
  For all (team, start_time, end_time) triples, no two games for the same
  team overlap in time.

INV-05: home_away_balance_within_tolerance
  For each team, |home_games - away_games| <= floor(total_games * tolerance).

INV-06: time_slot_band_quota
  For each team and each band, band_count / total_games <= max_band_fraction
  (where max_band_fraction = season.time_slot_balance_tolerance).

INV-07: playoff_reservations_untouched
  For all events where is_playoff_reservation = true during regular-season
  generation, no game assignment is made to that slot.

INV-08: parity_orphans_released
  After a tier move for team T from date D: for all games where
  team_id = T AND start_time > D AND old_tier = T.prev_tier,
  the game has no team assignment (released to unassigned inventory).

INV-09: tiebreaker_determinism
  Given identical standings input, StandingsResolver.rank() must produce
  identical output on every invocation (no randomness).

INV-10: tiebreaker_n_way_skip_h2h
  When 3+ teams share identical H2H win records within the group,
  the applied tiebreaker must NOT be "head_to_head".
```

Property-based generation: randomly produce season configs with N teams
(N from 4 to 32), M venues (1 to 8), varying locked-fixture sets, and
verify all 10 invariants. Target: 10,000 random schedules without a
single invariant failure before shipping.

### 3.2 Golden-set regression tests

Maintain a set of fully-specified season fixtures (small, medium, large)
where the expected output is known. These are not generated — they are
hand-authored by the scheduling domain expert (the PPHL scheduler).

Golden sets required:

| Set | Description | Size |
|---|---|---|
| GS-01 | Minimal: 4 teams, 1 venue, 6 weeks | 24 games |
| GS-02 | Parity-window: 8 teams, 3 tiers, 2-week window at week 4 triggers moves | 48 games |
| GS-03 | Locked-import: 6 manual fixtures pre-loaded, generator fills 40 more | 46 games |
| GS-04 | Three-way tiebreaker: 6 teams, standings engineered to produce 3-way H2H tie | 30 games |
| GS-05 | Playoff: 8 teams, regular season seeding drives 1v8/2v7 bracket | 40 games |
| GS-06 | Time-slot stress: 10 teams, only 30% early slots available, fairness must be achieved or flagged | 60 games |
| GS-07 | Over-constrained: intentionally impossible to satisfy all constraints simultaneously — engine must surface the conflicts rather than silently violate them | 20 games |

GS-07 is critical. The system must **never** silently produce an
invalid schedule when constraints can't be satisfied. It must surface
the impossibility and let the admin decide what to relax. An LLM that
"smooths over" the impossibility is the worst possible outcome.

### 3.3 LLM output evals

For every generative output (parity rationale, conflict option label,
violation explanation):

**Faithfulness check**: every number in the generated text must appear
in the source structured record. Run as a post-generation assertion:
extract all numerals from the text, verify each is present in the input
JSON. Fail the eval if any numeral is fabricated.

**Coverage check**: the generated text must reference every field marked
`required_in_narration` in the source schema. Tiebreaker narration must
mention the rule applied and the values for all tied teams.

**Format check**: option labels for conflict resolution must match the
template pattern (action verb + game identifier + venue/time change +
parenthetical scope of impact).

Eval these on a set of 100 hand-authored scenario inputs where the
expected output (or its structural properties) is known. Track
faithfulness rate per deployment. Target: 100% faithfulness (zero
hallucinated numbers) before shipping to admins.

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ADMIN UI (Next.js)                           │
│  • Inline conflict cards      • Parity review table             │
│  • Natural-language query box • Upload validation panel         │
│  • Tiebreaker audit tooltip   • Schedule health dashboard       │
└────────────────────────┬────────────────────────────────────────┘
                         │ API calls (read display data + apply actions)
┌────────────────────────▼────────────────────────────────────────┐
│              NARRATION LAYER  (LLM boundary)                    │
│                                                                 │
│  Input:  structured records from deterministic engine           │
│  Output: human-readable text + ranked/labeled UI copy           │
│                                                                 │
│  Invariant: this layer NEVER writes to the database.            │
│  Invariant: this layer NEVER calls the scheduler.               │
│  Invariant: every output is a draft confirmed by a human.       │
│                                                                 │
│  Components:                                                    │
│   ParityNarrator.explain(recommendation: ParityRecord)          │
│   ConflictOptionLabeler.label(options: ConflictOption[])        │
│   ViolationExplainer.explain(violations: Violation[])           │
│   ScheduleQueryEngine.query(nl: string) → StructuredQuery       │
│   TiebreakerNarrator.explain(resolution: TiebreakerResult)      │
└────────────────────────┬────────────────────────────────────────┘
                         │ reads structured data only
┌────────────────────────▼────────────────────────────────────────┐
│           DETERMINISTIC ENGINE  (no model involvement)          │
│                                                                 │
│   ScheduleGenerator          — constraint-satisfying generator  │
│   ConflictResolver           — proposeOptions() + apply()       │
│   ParityRecommendation       — compute(windowId)                │
│   StandingsResolver          — rank(teamIds, ruleset)           │
│   TimeSlotBalancer           — rebalance(scheduleId)            │
│   BracketGenerator           — fromStandings(seasonId)          │
│   ManualScheduleImport       — preview() + commit()             │
│   AuditEngine                — run(seasonId) → findings[]       │
└────────────────────────┬────────────────────────────────────────┘
                         │ reads/writes
┌────────────────────────▼────────────────────────────────────────┐
│                     DATABASE (Postgres / Supabase)              │
│  games · events · parity_windows · playoff_brackets             │
│  schedule_audit_findings · tiebreaker_resolutions               │
│  locked_at · published_at                                       │
└─────────────────────────────────────────────────────────────────┘
```

**The key architectural boundary**: the narration layer reads structured
records out of the engine. It writes nothing. It calls nothing that has
side effects. It is a pure rendering step that happens to use a language
model instead of a template engine.

This means:
- If the LLM is unavailable or misbehaves, every function in the system
  still works. The narration falls back to a template-rendered string
  (less elegant, fully correct).
- The LLM cannot cause a bad schedule. It can only produce a bad
  explanation. Bad explanations are recoverable; bad schedules are not.
- Model upgrades (from Sonnet to a future model, or to a different
  provider) require zero changes to the deterministic core.

---

## 5. Pain-by-Pain Approach

**Pain #1 — Schedule does not auto-publish**: Pure architecture. The
`published_at` state transition plus `revalidatePath` on every mutation.
No model involvement; this is a database concern.

**Pain #2 — Cross-vendor notification chain broke**: Direct BullMQ/Inngest
adapters per rink, with delivery health telemetry. The model can compose
the rink-facing notification email from structured game-change data
(venue, time, teams affected) — converting a delta record into a
professional-sounding email is exactly the narration-layer pattern.

**Pain #3 — No playoff auto-seeding or auto-advancement**: `BracketGenerator.fromStandings()` and the winner-advancement trigger are fully deterministic. The model's role here is zero — seeding is math.

**Pain #4 — No dynamic tournament tier reassignment**: `TournamentReseed.evaluate(roundId)` is deterministic (rank → up/down/stay). The model optionally narrates the tier assignment rationale per team for the admin review screen.

**Pain #5 — Three-way tiebreaker**: The cascade (H2H → away goals → home goals → GD) is a strict ordered evaluation. `StandingsResolver` implements it deterministically. The model narrates the audit explanation for the tooltip: which rule fired, what the values were for each team. The narration is the only model involvement.

**Pain #6 — No 2-week parity window**: The parity engine computes recommendations deterministically. The model writes the per-team move rationale the admin reads before clicking confirm. Every move the admin approves feeds back into the deterministic regenerator.

**Pain #7 — Manual uploads overwritten by generator**: `ManualScheduleImport.preview()` surfaces violations as structured records. The model converts each violation into a plain-English explanation pointing the admin back to the specific row they need to fix. The locked-fixture contract is enforced entirely by the deterministic generator.

**Pain #8 — Time-slot bias**: `TimeSlotBalancer.rebalance()` is a deterministic optimization pass. The model produces the per-team time-slot health summary sentence the admin sees in the health-check dashboard. The invariant either holds or it doesn't — the model's opinion is irrelevant to that binary.

**Pain #9 — Conflicts force Excel round-trip**: `ConflictResolver.proposeOptions()` generates valid, pre-validated deltas deterministically. The model writes the human-readable label for each option in the inline conflict card. Admin clicks a label. Engine applies the delta transactionally, re-runs the audit, commits or rolls back.

---

## 6. The Hill I Will Die On

**The case for the narration layer, precisely drawn.**

Here is what I expect the other lenses to say: Karpathy will say "the
model adds latency and variability to a determinism problem; just build
the UI well." The CP-SAT and Z3 camps will say "the hard problem is hard
and the soft problem is a template." They are right about the scheduler.
They are wrong about the workflow.

The PPHL scheduler is not a mathematician. She is a rec-league ops
person who looks at a 506-event grid and decides whether to move a team
up a tier based on a combination of standings data, her knowledge of the
coaches, and how the window has felt. She has been doing this in
Avario's flat grid + Excel export for years. The win condition for
SportsPulse is not a better CP-SAT solver — it is a system where she
trusts the recommendations enough to click confirm instead of building
her own spreadsheet model alongside it.

That trust is built by explanation. When the engine says "move up" and
shows a structured table, she might trust it. When it says "move up"
and shows her a paragraph that reads like how she would have reasoned
through it — citing the exact record, the tier rank, the GD, the trend
— she will trust it. The paragraph costs 200 milliseconds and one API
call. It does not touch the schedule. It cannot produce a wrong schedule.
The worst it can do is produce a poorly-worded paragraph, which she
reads, shrugs at, and overrides.

The narration layer is not a scheduler. It is a UI component that
happens to use a language model instead of a Handlebars template. The
discipline is in keeping it exactly that: a rendering concern, never a
correctness concern. Every time the model is tempted to "help" by
proposing a fix, re-seeding a bracket, or suggesting a parity move that
the engine hasn't already computed and validated, the answer is no.

The places the model does not belong: generating fixtures, computing
standings, resolving tiebreakers, applying conflict resolutions,
executing parity moves, or running any operation that writes to the
games table. Full stop. Conceded without argument.

The places the model does belong: turning verified engine output into
the sentence an ops person would have written herself, so she spends
three seconds confirming a good recommendation instead of fifteen
minutes reverse-engineering it from a table. That is a real product win.
It is not hype. It is a narrow, testable, reversible, provider-agnostic
enhancement that degrades gracefully to a template when the model is
unavailable. Build it that way and there is nothing to debate.
