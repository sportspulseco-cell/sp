# PPHL pain points with Avario — the actual competitive brief

These are PPHL's documented operational complaints with Avario, as
told to the SportsPulse team on the discovery call. **This is the
build brief** — every other doc in this folder describes Avario's
*surface*; this one tells us what's *broken* about it and what we
must ship to win the migration.

Read this first. Everything else (`01–15`, `99-gap-analysis.md`) is
support material.

---

## Pain #1 — Schedule does not auto-publish to the public website

### Avario behaviour
Once the schedule is generated it does **not** automatically appear
on the public website. Admin runs a separate publish flow. When a
game changes after publish, the change does not propagate — the
public site keeps showing the stale version until someone re-runs
the publish.

### SportsPulse fix
Single source of truth. The moment admin clicks **Publish**, the
public schedule reflects the data. Every subsequent mutation —
rink swap, time change, cancellation — reflects on the public site
immediately, no secondary action.

### Build notes
- This is an architecture stance, not a feature. The public surface
  reads from the same `games` table the scheduler writes to,
  filtered by `published_at IS NOT NULL`.
- The Publish flow is a state transition (`draft → published`), not
  a copy. No staged snapshot to keep in sync.
- Edge revalidation (`revalidatePath('/schedule/[seasonId]')`) on
  every mutation that touches a published game.
- Test: publish a season, change a game, hard-refresh the public
  page — the change must be visible without re-publish.

---

## Pain #2 — The "change notify" button broke because of cross-vendor API chains

### Avario behaviour
Avario relied on a 3-vendor API chain (Avario → Sea Coast → Horizon)
to notify rinks of schedule changes. When any link failed, rinks
weren't notified, games showed at the wrong time on rink boards,
and admins had to **manually email rinks** to recover.

### SportsPulse fix
Rink notification fires **from within SportsPulse directly** to the
rink's system. No intermediate vendor that can break the chain.

### Build notes
- Direct adapters per rink integration (rink POS, Google Calendar,
  email). No relay through a third party.
- Notification dispatch lives in our own BullMQ/Inngest queue with
  retry + dead-letter visibility (via the Process inbox — see
  `15-process.md`).
- Per-rink "notification health" indicator: last successful
  delivery timestamp, failure count, dead-lettered events.
- Test: simulate a rink endpoint going down, ensure failures are
  visible in the operator inbox and retried automatically.

---

## Pain #3 — Playoff scheduling is clunky; no auto-seeding, no auto-advancement

### Avario behaviour
- Playoff publishing requires manual workarounds
- No automatic seed matching (1v8, 2v7, …)
- No automatic advancement when a team wins
- Public website does not update bracket state cleanly

### SportsPulse fix
1. **Block off playoff ice at season start** — before the regular
   season generator runs, admin reserves N playoff slots. Regular
   season scheduler works around those reserved blocks.
2. **One-click bracket generation** when regular season ends —
   standings drive seed matching automatically.
3. **Auto-advancement** when a result is entered — winner fills the
   correct next-round slot.
4. **Public bracket updates instantly** at every step.

### Build notes
- New entity: `playoff_brackets` (id, season_id, format enum:
  single_elim | double_elim | round_robin_consolation, slots jsonb)
- New entity: `playoff_slot_reservations` (event_id flagged
  `is_playoff_reservation = true` during season setup; scheduler
  treats these as locked / un-assignable until bracket generation)
- New service: `BracketGenerator.fromStandings(seasonId, seedRule)`
  → fills the empty playoff events with team matchups
- New trigger: on `game_results.insert`, if game is part of a
  bracket, advance the winner to the next slot
- Public surface: `<BracketView>` component with live data binding

---

## Pain #4 — No dynamic tournament tier reassignment (Johnny's specific ask)

### Avario behaviour
No concept of teams moving between upper / middle / lower divisions
based on tournament performance. Once a team is in a tier, they
stay there for the whole tournament.

### SportsPulse fix
**Dynamic tournament mode**. At the start of each round:
1. System evaluates every team's prior-round result
2. Winners move up a tier, losers drop down
3. Next-round schedule generates against the new tier assignments

### Build notes
- New entity: `tournament_rounds` (id, tournament_id, round_index,
  state enum: pending | active | complete)
- New entity: `tournament_tier_assignments` (round_id, team_id,
  tier enum: upper | middle | lower) — one row per team per round
- New service: `TournamentReseed.evaluate(roundId)` — looks at last
  round's results, computes new tier per team
- After admin confirmation, generator creates round-N+1 fixtures
  scoped to teams within the same new tier
- Special-case: handle teams with byes, teams that withdrew, teams
  in a 3-way tie (see Pain #5)

---

## Pain #5 — Three-way tiebreaker has no specific logic

### Avario behaviour
Three-way head-to-head ties are unhandled. SportsPulse team
acknowledged this scenario hadn't been tested yet at the time of
the call.

### SportsPulse fix
When three teams are H2H-tied in a round-robin, **head-to-head is
statistically meaningless** (each won and lost vs. the other two).
Fall back through the tiebreaker hierarchy:

1. Away goals scored
2. Home goals scored
3. Goal differential
4. (Next league-configured rule)

The standings view shows *exactly* which tiebreaker resolved each
position so teams can audit it.

### Build notes
- Tiebreaker engine: `StandingsResolver.rank(teamIds, ruleset)`
  → ranked list with `{teamId, position, tiebreakerApplied,
  tiebreakerValue}` per row
- Detect N-way ties: when more than 2 teams share H2H record,
  skip H2H and try next rule. Document this branch explicitly.
- Ruleset is **per-season configurable** (in Setup → Season →
  Standings) — not hard-coded
- Standings UI: hover/tap a team's position → tooltip shows
  "Tied with X and Y on H2H — resolved by away goals (12 vs 9 vs 7)"
- Test fixtures must include: 2-way tie (H2H wins), 3-way tie
  (skip H2H), 4-way tie, all teams tied through all rules

---

## Pain #6 — No 2-week parity window support (mid-season tier moves)

### Avario behaviour
PPHL runs a 2-week parity window: teams play for 2 weeks, then admin
judges whether each team should move up/down a division.
**Avario does not adjust the schedule** when a team moves mid-season.
Already-generated games for that team **stay as they were**,
producing orphaned fixtures, wrong-division matchups, broken sched.

### SportsPulse fix
1. Scheduler has a **native parity window concept**
2. Every 2 weeks a parity review is **automatically triggered**
3. Admin sees a simple UI: each team's performance + a
   recommendation (move up / stay / move down)
4. On admin confirmation of a move, the scheduler:
   - Removes the team's remaining same-division fixtures (orphans)
   - Regenerates new same-tier fixtures into available ice slots
5. **Untouched** fixtures stay exactly as they were

### Build notes
- New entity: `parity_windows` (id, season_id, window_index,
  start_date, end_date, review_due_date, state)
- Auto-create parity windows on season creation per
  `season.parity_window_weeks` setting (configurable, default 2)
- Cron triggers: `ParityReview.open(windowId)` at end of each window
- New service: `ParityRecommendation.compute(windowId)` → per-team
  recommendation based on standings within current tier
- Admin UI: `/scheduling/parity-review/:windowId` — table of teams
  × recommendations × admin override × confirm-all button
- `ScheduleRegenerator.applyTierMove(teamId, newTier, fromDate)`:
  - Identifies orphan fixtures (team's games in old tier after
    fromDate that haven't started)
  - Releases the ice (event → unassigned)
  - Re-runs generator against the team's new tier peers, slotting
    into available ice
- **Critical**: untouched games must have a `locked_at` so the
  regenerator can prove it didn't touch them

---

## Pain #7 — Manual schedule uploads are ignored as a base

### Avario behaviour
PPHL sometimes uploads a hand-built 2-week schedule. Avario does not
treat it as the foundation — it regenerates over it, breaking the
manual work and applying league constraints (game counts, home/away
balance, venue allocation) as if the manual games don't exist.

### SportsPulse fix
1. Admin uploads CSV/XLSX of manual fixtures
2. System **ingests them first** as `locked = true`
3. Generator runs for the **remaining** schedule, treating locked
   games as immovable constraints
4. **Pre-acceptance validation** of the upload itself:
   - Check rule violations (double-bookings, division mismatches,
     home/away imbalance) **within** the upload
   - Flag conflicts inline so admin can fix before generator runs

### Build notes
- New importer: `ManualScheduleImport.preview(file, seasonId)` →
  returns `{accepted: Event[], violations: Violation[]}` without
  committing
- Admin reviews violations → fixes in source file → re-uploads → on
  green, clicks Commit
- `ManualScheduleImport.commit(previewId)` writes events with
  `locked = true, source = 'manual_import'`
- Generator (see Pain #9) respects `locked = true` rows — never
  touches them
- Audit: log import event_count, violation_count_resolved,
  importing_user_id

---

## Pain #8 — Time-slot bias: some teams get all the late games

### Avario behaviour
Generator does not enforce time-slot fairness. Over a full season
some teams get the majority of late-night slots while others get
predominantly early games. Major captain/player complaint in
adult-rec leagues.

### SportsPulse fix
Time-slot distribution is a **first-class generator constraint**,
not an afterthought.

1. Calculate per-team early/mid/late slot proportions during
   generation
2. Apply a **balancing pass** — redistribute slots until each
   team's profile is within tolerance of every other team's
3. If perfect balance is mathematically impossible, **show the
   admin where the imbalance is and by how much** — don't silently
   ship a biased schedule
4. Admin-tunable tolerance: e.g. "no team has more than 30% of
   games after 9pm"

### Build notes
- New season setting: `time_slot_bands` (jsonb) — e.g.
  `[{label:'early', endsBefore:'18:00'}, {label:'mid',
  startsAt:'18:00', endsBefore:'21:00'}, {label:'late',
  startsAt:'21:00'}]`
- New season setting: `time_slot_balance_tolerance` (number,
  0.0–1.0) — max allowed deviation in proportion between teams
- Generator pass: `TimeSlotBalancer.rebalance(scheduleId)` after
  initial slot assignment
- Audit category: extend `analyze-audit` engine (see
  `07-analyze-audit.md`) with a `TimeSlotImbalance` rule that
  surfaces per-team-per-band deviations
- Admin UI: a per-team time-slot pie chart in the schedule
  health-check view; sortable by deviation desc

---

## Pain #9 — Conflicts force Excel round-trip; no in-system resolution

### Avario behaviour
When the generator produces conflicts (double-bookings, overlapping
team games, constraint violations), admin must:
1. Export schedule to Excel
2. Manually identify + fix
3. Re-import

No in-system conflict resolution.

### SportsPulse fix
Conflicts surface **inline** in the same scheduling window. Each
conflict shows:
- The two (or more) games in conflict
- *Why* they conflict (the rule that's broken)
- **2–3 one-click resolution options** the system pre-computes

Example:
> Game A and Game B are both assigned to Eastside Arena at 7pm on
> Oct 14.
> Options:
> · Move Game A to 9pm at Eastside Arena
> · Move Game B to Northgate Arena at 7pm
> · Swap Game A to Oct 16

Admin clicks. Conflict resolves. Rest of schedule auto-adjusts.

### Build notes
- The Analyze/Audit engine (see `07-analyze-audit.md`) already
  identifies conflicts; this pain extends it with resolution actions
- `ConflictResolver.proposeOptions(conflict)` returns up to 3
  pre-computed resolution moves. Each move = a delta of event
  reassignments that the resolver has already validated does not
  introduce a worse conflict
- One-click apply via `ConflictResolver.apply(conflict, optionId)`
  → wraps the delta in a transaction, re-runs the audit, commits
  if clean, rolls back if it cascades
- UI: conflict appears as an inline card in the schedule grid;
  options render as buttons with the predicted before/after state
  shown on hover
- If the resolver can't find 3 clean options (over-constrained
  schedule), show admin a free-form drag-and-drop fallback in the
  same window — still no Excel

---

## Cross-cutting themes

These 9 pain points cluster into 4 underlying themes:

### A. One source of truth (Pains 1, 2)
Avario splits the source of truth across systems (Avario, Sea Coast,
Horizon) and across states (generated vs. published). Every split
creates a sync failure mode. SportsPulse must keep the database as
the only source — public reads, rink notifications, mobile views all
project from it.

### B. Dynamic schedule mutation is a first-class operation (Pains 3, 4, 6, 7, 9)
Avario treats schedule generation as a one-shot batch job. Real-
world ops are **continuous**: parity moves, manual overrides,
playoff seeding, conflict fixes. SportsPulse must treat the
schedule as a mutable graph where every change preserves locked
constraints and re-balances the rest.

### C. Fairness as a constraint, not an afterthought (Pains 5, 8)
Time-slot bias and tiebreaker ambiguity erode trust. Make fairness
explicit, visible, configurable. Show the admin *how* a decision
was reached.

### D. In-system resolution (Pain 9)
No tool that requires Excel + re-import is acceptable. The full
workflow stays in one window.

## Updated build order (replaces the order in `99-gap-analysis.md`)

The 9 pains drive a new priority. Build in this order:

1. **Architecture: one-source-of-truth Publish** (Pain #1)
   — every other feature builds on this
2. **Conflict resolver with inline options** (Pain #9)
   — biggest day-to-day workflow win, sells the platform
3. **Locked-fixture import + generator** (Pain #7)
   — enables admin trust during cutover
4. **Time-slot balancing constraint** (Pain #8)
   — the single most-complained-about issue in adult-rec
5. **Parity window engine** (Pain #6)
   — PPHL operates on a 2-week cadence, can't migrate without it
6. **Playoff blocks + bracket generator + auto-advancement** (Pain #3)
   — season-defining moment, needs to feel polished
7. **Tiebreaker engine with N-way handling + audit trail** (Pain #5)
   — small code, big trust dividend
8. **Direct rink notifications without vendor relay** (Pain #2)
   — depends on Publish + Process inbox being live
9. **Dynamic tournament tier reassignment** (Pain #4)
   — Johnny's ask, but more contained than the league-schedule items

Everything in `99-gap-analysis.md` (Reports suite, Reconcile, full
integration matrix, Available) flows after these 9 are addressed.

## How to use this doc

When implementing any scheduler feature, **start from this file**.
For each PR:
- Cite the pain # it addresses
- Show the before/after that PPHL will see
- Surface the relevant build notes
- Confirm with the user that the fix matches the operational pain
  they described

If a feature doesn't connect to one of the 9 pains, ask whether it
should be deferred until the 9 are closed out.
