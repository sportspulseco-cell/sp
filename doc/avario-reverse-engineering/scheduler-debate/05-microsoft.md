# Microsoft lens: Z3/SMT correctness + enterprise reliability

> **Debate position**: two complementary strengths.
> (a) Microsoft Research's Z3 — the world's leading SMT solver — gives you
> formal verification, UNSAT cores, and an incremental push/pop API that
> maps directly onto the scheduler's most user-visible fairness and
> feasibility problems.
> (b) Microsoft is the enterprise-integration company. The boring-but-mission-
> critical patterns — transactional outbox, idempotency keys, circuit
> breakers, dead-letter visibility, delivery reconciliation — are exactly what
> Avario got wrong and exactly what will determine whether the migration wins.

---

## 1. Problem framing: solver problem vs. systems-reliability problem

The 9 PPHL pain points split cleanly into two categories that require
fundamentally different engineering disciplines.

### The solver problem (pains #3, #4, #5, #6, #7, #8, #9)

These are constraint-satisfaction and optimization problems: generate a
schedule that respects locked fixtures, balances time-slot distribution,
moves teams across tiers mid-season, seeds playoffs correctly, resolves
N-way tiebreakers with a documented chain of evidence, and finds
conflict-repair moves on demand. They are solvable with formal methods or
combinatorial optimization. They are hard, but their failure mode is
**visible**: the admin sees a bad schedule and can press "re-generate."

### The systems-reliability problem (pains #1 and #2)

Pain #1 is not a feature gap. It is an architectural failure: Avario keeps
two copies of the schedule — an internal draft and a published snapshot on
the public website — and the mechanism that syncs them is a manual step that
humans forget or that silently diverges after every subsequent mutation. The
fix is not a better algorithm; it is removing the second copy entirely (a
filtered view of the canonical `games` table, keyed on `published_at IS NOT
NULL`; `revalidatePath('/schedule/[seasonId]')` on every mutation).

Pain #2 is a distributed-systems reliability failure. The 3-vendor API chain
(Avario → Sea Coast → Horizon) is a series composition of fallible HTTP calls
with no retry, no idempotency, and no failure visibility. When one link
breaks, rinks show stale times on their boards and admins resort to manual
email. The scheduler itself played no role in this failure. The best SAT
solver in the world cannot prevent a silent HTTP 503 from disappearing into
the void.

**Claim**: PPHL's most trust-destroying, migration-blocking pains are not
algorithmic — they are distributed-systems reliability problems. The
competitor built a fine schedule generator and then shipped it behind a
fragile, opaque integration layer. SportsPulse wins the migration by getting
the reliability layer right, not by out-optimizing on constraint satisfaction.
The solver is table stakes. The plumbing is the differentiator.

---

## 2. The Z3/SMT angle: where it beats CP-SAT and where it doesn't

### Honest comparison

Google's CP-SAT (OR-Tools) is the stronger **optimizer**. For problems of the
form "find the best schedule across a large combinatorial space under soft and
hard constraints, maximizing an objective function," CP-SAT's propagation
engine and large-neighborhood search are faster and more scalable than Z3's
general-purpose SMT machinery. If the sole job is generating a 506-event
regular-season schedule from scratch and producing an optimal time-slot
distribution, CP-SAT wins on wall-clock time and solution quality.

Z3 wins on three axes that directly address PPHL's documented pains.

### Axis 1: UNSAT cores — the explainability differentiator

When a schedule is infeasible, CP-SAT tells you "no solution found." Z3's
incremental solver tells you **which subset of constraints is jointly
unsatisfiable** — the minimal UNSAT core. This is exactly what pain #8 asks
for ("if perfect balance is mathematically impossible, show the admin where
the imbalance is and by how much") and pain #9 ("why do they conflict — the
rule that's broken"). In practice:

```
// Pain #8: time-slot fairness
solver.push()
solver.add(teamALateGames <= tolerance * totalGames)   // constraint 1
solver.add(teamBLateGames <= tolerance * totalGames)   // constraint 2
solver.add(allLateSlots == fixedIceInventory)           // constraint 3
if (solver.check() === 'unsat') {
  const core = solver.unsatCore()
  // core tells you: constraints 1 and 3 are jointly unsatisfiable
  // → "Team A cannot meet the 30% late-game cap because the rink
  //    only offers 2 late slots per week and Team A plays 3 games"
}
solver.pop()
```

The admin gets a specific, auditable explanation — not a spinner that
eventually reports failure. This directly satisfies the `07-analyze-audit.md`
requirement for per-violation descriptions with `actual_value` and
`target_value`.

### Axis 2: Incremental push/pop for "add a constraint, re-check"

The `push/pop` API lets you add constraints, check satisfiability, then roll
back if the change creates infeasibility — all without re-solving from
scratch. This maps directly onto:

- **Pain #9 (conflict repair)**: `ConflictResolver.proposeOptions()` can use
  Z3 push/pop to test each candidate resolution move, verify it doesn't
  introduce a secondary conflict, and report back — before committing anything
  to the database. Each option is a "what-if" Z3 context that gets popped
  after validation.
- **Pain #6 (parity regen)**: `ScheduleRegenerator.applyTierMove()` needs to
  verify that after removing a team's orphaned fixtures and regenerating new
  ones, the remaining locked games (those with `locked_at` set) are still
  satisfiable with the new assignments. Push the locked constraints first,
  then push the new-team constraints, check — if unsat, pop and surface the
  core to the admin.
- **Pain #7 (locked imports)**: `ManualScheduleImport.preview()` can assert
  the uploaded fixtures as Z3 hard constraints and immediately check whether
  the remaining schedule space can satisfy all balancing rules. If not, the
  UNSAT core identifies which manual fixtures are the source of infeasibility
  — not a generic "your import caused a conflict."

### Axis 3: Tiebreaker logic as provable rules (pain #5)

The N-way tiebreaker hierarchy is not an optimization problem — it is a
decision procedure: given a set of teams with identical H2H records, does
rule R₁ produce a unique ranking? If not, does R₂? Z3 can **prove** that a
tiebreaker rule uniquely ranks N teams or find a counter-example (two teams
that still tie after applying the full hierarchy). This is stronger than unit
tests: it is a machine-checked proof over all possible score combinations.
The `StandingsResolver.rank(teamIds, ruleset)` service can expose a
`verify(ruleset)` method that runs Z3 offline to certify no ambiguous case
exists before the ruleset goes into production.

### Recommended architecture: Z3 as verifier, CP-SAT as generator

| Phase | Tool | Rationale |
|---|---|---|
| Initial schedule generation (full season, 500+ events) | CP-SAT | Best optimizer; brute-force search space |
| Post-generation feasibility proof (confirm all constraints satisfied) | Z3 | UNSAT core if something is wrong |
| Conflict option generation (pain #9) | Z3 push/pop | Each option is a push/check/pop; rollback is free |
| Parity regen feasibility check (pain #6) | Z3 push/pop | Locked constraints + new-team constraints |
| Time-slot imbalance diagnosis (pain #8) | Z3 UNSAT core | Explain exactly which team/slot combination is infeasible |
| Tiebreaker ruleset verification (pain #5) | Z3 prove | Offline certification before deployment |
| Locked-fixture upload validation (pain #7) | Z3 push/pop | Manual fixtures as hard constraints; check remaining space |

Z3 ships as a Node.js binding (`z3-solver` npm package, ~4 MB WASM). It runs
in the API process — no external service to operate. The incremental API
means you can embed it directly in NestJS service methods without a separate
solver microservice.

---

## 3. The reliability architecture: publish + notification done right

This is the Microsoft lens's core claim. The following patterns make it
structurally impossible for the publish/notify layer to silently fail the way
the competitor's did.

### 3a. Transactional outbox (pain #1 and pain #2)

The fundamental failure in Avario's notification path is that the HTTP call
to the external system is not atomic with the database write. If the HTTP call
fires and then the server crashes, or if it never fires because of a
pre-commit exception, you never know which state the external system is in.

The fix is the **transactional outbox pattern**:

1. Within the same database transaction that mutates `games` (a rescheduling,
   a cancellation, a publish state transition), also insert a row into an
   `outbox_events` table: `{ id, aggregate_type, aggregate_id, event_type,
   payload_json, idempotency_key, created_at, delivered_at }`.
2. A BullMQ worker polls `outbox_events WHERE delivered_at IS NULL`, reads
   each event, calls the downstream integration adapter, and on success sets
   `delivered_at = now()`.
3. If the BullMQ worker crashes mid-delivery, the row stays `delivered_at IS
   NULL` and is retried on next poll — no event is lost. If the downstream
   system received the call before the crash, the `idempotency_key` (a stable
   hash of the event content) prevents double-processing on retry.

This pattern eliminates the "did the notification fire or not?" ambiguity that
required PPHL admins to manually email rinks as a fallback.

```
-- packages/db/src/schema/outbox.ts (new table)
outbox_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type  text NOT NULL,          -- 'game', 'season', etc.
  aggregate_id    uuid NOT NULL,
  event_type      text NOT NULL,          -- 'game.rescheduled', 'season.published'
  target_integration text NOT NULL,       -- 'rink_direct', 'sportsengine', 'arbiter'
  payload_json    jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,   -- prevents double-delivery on retry
  created_at      timestamptz DEFAULT now(),
  delivered_at    timestamptz,            -- null = pending
  failed_at       timestamptz,            -- null = not yet failed
  attempt_count   int DEFAULT 0,
  last_error      text
)
```

The `idempotency_key` is computed as `sha256(aggregate_id || event_type ||
payload_json)` at insert time. Downstream adapters must accept and
deduplicate on this key — this is the contract test anchor (section 4).

### 3b. Circuit breakers per integration (pain #2)

The 3-vendor relay broke because any one vendor going down took out the entire
notification chain. Even if we eliminate the relay (direct adapters per rink),
a rink's POS system going offline for maintenance should not prevent
notifications to other rinks from delivering.

Each integration adapter wraps its HTTP client in a **circuit breaker** (e.g.,
`opossum` npm package):

- **Closed** (healthy): calls go through; failures increment a counter.
- **Open** (tripped): after N failures in T seconds, calls are rejected
  immediately without hitting the external API. The outbox worker marks the
  event as `failed_at` and logs the circuit-open reason.
- **Half-open** (recovering): one probe call goes through; if it succeeds, the
  circuit closes.

Circuit state is stored in Redis (per integration, per org) and surfaced on
the operations dashboard. An admin can see at a glance which rink integrations
are currently open/tripped and why — and can manually reset a circuit after
confirming the vendor is back up.

### 3c. Dead-letter queue surfaced in the Process inbox (pain #2)

Events that exhaust their retry budget (configurable, default: 5 retries with
exponential back-off starting at 30 seconds) move to a dead-letter queue.
The BullMQ dead-letter queue maps directly to entries in the `background_jobs`
table (see `15-process.md`) with `state = 'failed'` and `error` populated with
the last HTTP response body.

The `/operations/jobs` page (the Process inbox analog) shows these failed
delivery jobs with:
- Integration target (which rink, which platform)
- Event type and game ID
- Last error text
- "Retry now" button (admin-initiated re-delivery with the same idempotency key)
- "Dismiss" button (marks as acknowledged, removes from inbox count)

This is the exact surface that Avario is missing. When the competitor's
3-vendor chain broke, there was no inbox showing which games failed to notify
and why — admins discovered the failure only when rinks called to report wrong
times on the boards.

### 3d. Delivery receipts and reconciliation (tying pain #2 to Reconcile)

The `13-reconcile.md` module exists to detect drift between SportsPulse's
canonical schedule and external systems. The reliability architecture closes
the loop:

- `outbox_events.delivered_at` records when SportsPulse sent the event.
- The Reconcile module's nightly cron (`IntegrationsAdapter.fetch()` + diff)
  records when the external system's data actually matches.
- The gap between `delivered_at` and "reconcile-confirmed-match" is the
  **delivery receipt lag** — surfaced on the integration health dashboard as a
  per-integration metric.

This means an admin can query: "Which games were pushed to SportsEngine more
than 2 hours ago but still don't match?" That is the answer to pain #2, made
systematic and visible rather than discovered via angry phone calls.

### 3e. One-source-of-truth publish (pain #1)

The architecture fix for pain #1 is already documented in
`00-pphl-painpoints.md`. The reliability angle: the `revalidatePath` call on
every mutation that touches a published game must be **inside the same
database transaction** that sets `published_at`. If `revalidatePath` is called
after the transaction commits, a brief window exists where the public page
still shows stale data. If the mutation rolls back (e.g., constraint
violation), `revalidatePath` should not have fired. The transactional outbox
handles this: the cache invalidation event goes into the outbox table inside
the transaction and is delivered after commit.

---

## 4. Enterprise integration: the adapter layer

The integration density gap is the competitive moat. Avario has 14 integration
paths (9 outbound + 5 inbound) across 8 systems. SportsPulse has zero.
Building these one-off would produce the silo problem (CLAUDE.md cardinal
rule). The fix is a uniform, independently testable adapter layer.

### 4a. Package structure

```
packages/integrations/
  src/
    framework/
      adapter.interface.ts      // IntegrationAdapter<TConfig, TEvent>
      outbox-worker.ts          // BullMQ worker: polls outbox_events, dispatches
      circuit-breaker.ts        // opossum wrapper, Redis state
      idempotency.ts            // idempotency_key computation
      contract-test.harness.ts  // shared test scaffold for every adapter
    adapters/
      sportsengine/
        index.ts                // SportsEngineAdapter implements IntegrationAdapter
        contract.test.ts        // contract tests against mock SE API
        types.ts
      arbiter/
        index.ts
        contract.test.ts
        types.ts
      google-calendar/
        index.ts
        contract.test.ts
      rink-direct/              // generic rink email / iCal adapter
        index.ts
        contract.test.ts
```

### 4b. The adapter interface

```typescript
// packages/integrations/src/framework/adapter.interface.ts
export interface IntegrationAdapter<TConfig, TEvent> {
  readonly kind: IntegrationKind         // 'sportsengine' | 'arbiter' | ...
  readonly direction: 'push' | 'pull' | 'both'

  // Push: deliver an outbox event to the external system.
  // Must be idempotent when called with the same idempotencyKey.
  push(event: TEvent, idempotencyKey: string, config: TConfig): Promise<PushResult>

  // Pull: fetch the external system's current state for reconciliation.
  pull(filter: PullFilter, config: TConfig): Promise<ExternalEvent[]>

  // Health: lightweight ping (used by circuit breaker half-open probe).
  ping(config: TConfig): Promise<'ok' | 'degraded' | 'down'>
}
```

Every adapter implements this interface. The outbox worker does not know about
SportsEngine or Arbiter — it knows about `IntegrationAdapter`. Adding a new
integration means implementing the interface and registering the adapter; the
retry, circuit-breaker, dead-letter, and reconciliation infrastructure work
for free.

### 4c. Contract tests

Each adapter ships a `contract.test.ts` that runs against a mock (WireMock or
nock) approximating the real vendor API. The test suite covers:

1. **Happy path**: push an event, assert the mock received the correct HTTP
   request shape.
2. **Idempotency**: push the same event twice with the same `idempotencyKey`,
   assert the mock was called twice but the external state is unchanged on the
   second call (or that we detect and handle the 409/duplicate response
   correctly).
3. **Auth failure**: mock returns 401, assert the adapter raises
   `AuthenticationError` (circuit breaker does not trip on auth failures —
   they are configuration errors, not transient failures).
4. **Rate limit / 429**: mock returns 429 with `Retry-After`, assert the
   adapter respects the header.
5. **Timeout**: mock delays beyond the adapter's timeout, assert the adapter
   raises `TimeoutError` and the circuit-breaker increments its failure count.

These tests run in CI. A vendor API change that breaks the adapter is caught
before deploy — not discovered when PPHL captains call to say the schedule
is wrong.

### 4d. Independent deployability

Each adapter is a stateless module. The outbox worker (`outbox-worker.ts`) is
a separate BullMQ queue processor that can be deployed as its own Vercel Cron
or as a long-running process in `superadmin-api`. Scaling the SportsEngine
adapter independently of the Arbiter adapter (e.g., because SE pushes are
bursty around season-start) is a configuration change, not a code change.

---

## 5. Pain-by-pain fit

| Pain | Category | Approach |
|---|---|---|
| **#1 Publish drift** | Reliability | Transactional outbox + `published_at` state transition + `revalidatePath` inside the same transaction boundary. No second copy, no manual re-publish step. |
| **#2 Notification chain broke** | Reliability | Per-integration circuit breakers + outbox retry + dead-letter in Process inbox + delivery-receipt reconciliation. The 3-vendor relay is replaced by a single direct adapter per rink that owns its own retry budget. |
| **#3 Playoff scheduling** | Solver / state machine | CP-SAT generates playoff brackets from standings. Z3 verifies seed assignments satisfy all constraints (no team plays home twice in a row, no venue double-booking) before the bracket is committed. |
| **#4 Dynamic tournament tier reassignment** | Solver | CP-SAT regenerates round-N+1 fixtures within the new tier assignments. Z3 push/pop validates that existing locked games in the new tier are compatible with the new team additions. |
| **#5 N-way tiebreaker** | Prover | Z3 formally verifies that the configured tiebreaker ruleset produces a unique ranking for every possible score combination — offline, before the ruleset is deployed. UNSAT core explains any ambiguous case. |
| **#6 Parity window regen** | Solver + prover | CP-SAT regenerates orphaned fixtures for the moved team. Z3 push/pop confirms all `locked_at` games remain satisfiable with the new assignment before mutation commits. |
| **#7 Locked-fixture import** | Prover | Z3 asserts uploaded manual fixtures as hard constraints and immediately checks whether the remaining schedule space is satisfiable. UNSAT core identifies exactly which uploaded fixtures are blocking feasibility. |
| **#8 Time-slot bias** | Optimizer + prover | CP-SAT balances slot distribution during generation. Z3 UNSAT core explains exactly which team/slot combination exceeds the configured tolerance — surfaces in the analyze-audit engine as a `TimeSlotImbalance` rule with `actual_value` and `target_value`. |
| **#9 Excel round-trip conflicts** | Prover + UX | `ConflictResolver.proposeOptions()` uses Z3 push/pop to validate each candidate move before presenting it to the admin. Each option is a push/check/pop cycle — free to roll back. Only verified clean moves reach the UI. |

---

## 6. The hill I will die on

Everyone in this debate is fighting over the solver. Karpathy says keep it
simple. Google says CP-SAT is the answer. OpenAI says put an LLM in the loop
for ambiguous constraints. Anthropic says enforce correctness at every layer.
They are all arguing about the algorithm. **The algorithm is not why PPHL is
in pain.**

PPHL is in pain because a schedule change does not appear on the public
website until someone manually re-runs publish. PPHL is in pain because
referees showed up to the wrong rink at the wrong time because a 3-vendor API
chain silently dropped the notification and nobody knew until the rink called.
Neither of those failures has anything to do with the quality of the
constraint solver. Avario's scheduler is, by the evidence in `07-analyze-audit.md`,
genuinely sophisticated — 9 constraint categories, 8,000 issues surfaced per
season. The scheduler worked. The plumbing around it did not.

SportsPulse wins this migration by shipping the parts the competitor treated as
implementation details: the transactional outbox that makes publish
atomically consistent, the circuit-breaker per integration that isolates
rink failures, the dead-letter inbox that makes every failed notification
visible and recoverable, and the reconciliation module that proves the
external systems actually received what was sent. And for the solver layer, Z3
adds one capability that CP-SAT cannot match and that the admin will feel
immediately: when the schedule is infeasible or unfair, the system tells you
**exactly why** — not "optimization failed" but "Team A cannot have fewer than
35% late games because the rink inventory at Bavis Arena only offers 2 late
slots per week and Team A's division plays 3 games per week there." That is an
UNSAT core. It takes one afternoon to wire up. It is the explainability that
the CP-SAT camp concedes as a weakness and that the LLM camp tries to
approximate with natural language. We have it for free, provably correct,
in a 4 MB WASM binary. Ship the plumbing. Prove the constraints. Win the
migration.
