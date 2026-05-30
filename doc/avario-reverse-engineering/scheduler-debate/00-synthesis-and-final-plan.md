# The scheduler debate — synthesis & crystallized plan

Five lenses researched the SportsPulse scheduler independently
(`01`–`05` in this folder), then argued. This doc is the orchestrator's
verdict: where they agreed, the three real fights and how they resolve,
and the single layered architecture that survives all five critiques.

The honest headline: **no single lens is the answer, and the loudest
fight (greedy vs CP-SAT) is not the one that decides the migration.**

---

## The debate on one screen

| Lens | Core proposal | Hill they died on |
|---|---|---|
| **Karpathy** (`01`) | Greedy construction (hardest-first) + hill-climbing fairness pass + bounded local-search conflict resolver. All polynomial, sub-second, debuggable. No solver. | `locked_at` enforced at the **DB layer** (SELECT FOR UPDATE) before any algorithm is written. Accidental lock-violation is an unrecoverable trust breach. |
| **OpenAI** (`02`) | Deterministic core + a **read-only LLM narration layer** that turns engine output into plain English. Rigorous property-based + golden-set eval harness. | The LLM is a *rendering* concern, never a *correctness* concern. It builds the admin's trust to click "confirm" instead of rebuilding the schedule in Excel. Never near the games table. |
| **Anthropic** (`03`) | Provenance is the **primary deliverable**: every game carries why-it-was-placed; tiebreakers carry the full hierarchy walk; infeasibility produces an actionable report, never silent failure. Seeded + reproducible. | A schedule you cannot explain is one you cannot defend. Determinism + provenance is non-negotiable; no black-box or non-deterministic component near the correctness core. |
| **Google** (`04`) | Model it formally as CP-SAT (multi-division round-robin timetabling, ITC2021 family). Fairness becomes a **minimize-max-deviation objective**, not a post-pass. Python solver microservice, warm-start re-solves. | Hand-rolled heuristics plateau — constraint interactions grow quadratically (that's *why* Avario has 8,000 violations). CP-SAT solves PPHL-size in seconds; the objective breakdown + infeasibility core **is** the explanation. |
| **Microsoft** (`05`) | Two-part: **Z3 as verifier** (UNSAT cores, push/pop, prove tiebreakers) + a **reliability layer** (transactional outbox, circuit breakers, dead-letter inbox, delivery reconciliation). | The pain isn't the algorithm. PPHL's trust-destroying failures (#1 publish drift, #2 the notification chain that broke across 3 vendors) are **distributed-systems** problems. The competitor's solver worked; its plumbing didn't. Win on plumbing. |

---

## Where all five agreed (consensus — bank this)

1. **The LLM never writes the schedule.** Even OpenAI argues this
   forcefully. The generative layer is read-only narration with a
   template fallback. Settled.
2. **`locked_at` is sacred and must be structurally enforced**, not an
   application flag. Karpathy (DB-level SELECT FOR UPDATE), Anthropic
   (`WHERE locked_at IS NULL` on every engine write + provenance proof),
   Google (hard equality constraint), Microsoft (Z3 push validates
   locked set survives) all converge here independently.
3. **Determinism + reproducibility.** Seeded runs, same input → same
   output. Required for debugging and for defending decisions. (Flagged
   as a real constraint on CP-SAT — see Fight #3.)
4. **Infeasibility is information, never silent failure.** When the
   schedule can't satisfy constraints, surface *exactly which* and *by
   how much* with remediation options. This is literally the text of
   pains #8 and #9. All five back it.
5. **Pains #1 and #2 are architecture/reliability, not algorithm.**
   Every lens that addressed them said the same: one source of truth
   (`published_at` filtered view, revalidate on mutation) and direct
   adapters, no vendor relay.
6. **One engine, behind one interface, feeding one audit/provenance
   store** — nobody wants parallel schedulers (also the CLAUDE.md
   cardinal rule).

---

## The three real fights — and the rulings

### Fight 1 — Greedy (Karpathy) vs CP-SAT (Google) as the generator

**The clash.** Karpathy: 160 teams / 506 events is trivially bounded;
greedy + local search ships next week and you can debug it by hand.
Google: it's not 506 events in a vacuum — it's 15+ divisions × 26
venues × 9 intersecting constraint classes, and *that interaction
surface* is why heuristics accumulate the exact 8,000-violation debt
Avario shipped.

**Both are partly right, and they're talking about different time
horizons.** Greedy is correct for v1 *per division* (each division is
~16 teams — genuinely small). CP-SAT is correct once cross-division
venue contention and a quantified fairness objective dominate, which is
precisely where greedy's bespoke-pass-per-constraint model rots.

**Ruling: abstract the engine behind a `SchedulerEngine` interface.
Ship greedy+local-search as v1. Architect so a CP-SAT microservice
drops in behind the same interface with zero rewrite above it.** This
is not a fudge — it's the only choice that lets us ship in weeks
(Karpathy's real point) without painting ourselves into the
heuristic-debt corner (Google's real point). The migration trigger is
explicit and measurable: **when the greedy generator's post-balance
residual fairness deviation or unresolved-fixture count on PPHL's real
data exceeds tolerance on a normal season, the CP-SAT backend earns its
place.** Until then it's premature.

Corollary on fairness (pain #8): start it as Karpathy's **post-pass**
(simple, shippable). Promote it to Google's **objective term** when (and
only when) the post-pass demonstrably plateaus. Same interface, the
fairness logic moves from a pass to a constraint.

### Fight 2 — Is the solver self-explaining (Google/Microsoft) or does explainability need its own layer (Anthropic)?

**The clash.** Google: CP-SAT's objective breakdown + infeasibility core
*is* the explanation. Microsoft: Z3 UNSAT cores give you the "exactly
why" for free. Anthropic: a solver core tells you *that* constraints
conflict, not *why this game is in this slot rather than the two
alternatives the engine considered* — and it says nothing when an admin
manually overrides at 9pm on a Wednesday.

**Ruling: Anthropic wins the principle; Google/Microsoft win the
mechanism.** Explainability is **engine-agnostic and lives in its own
provenance store** (`game_provenance`, `schedule_runs`,
`tiebreaker_trace`, `TimeSlotFairnessReport`) — because the audit trail
must cover greedy placements, CP-SAT placements, *and* human overrides
uniformly. The solver's infeasibility/UNSAT core is not a replacement
for provenance; it is a **high-value input that feeds the infeasibility
report**. So: build the provenance layer regardless of engine, and pipe
the solver's core diagnostics into it. Both, not either.

### Fight 3 — Z3 vs CP-SAT (Microsoft vs Google), and determinism

**The clash.** Google: CP-SAT is the better *optimizer*. Microsoft: Z3
is the better *prover* (UNSAT cores, push/pop, certify tiebreaker
rulesets) and concedes CP-SAT optimizes better.

**This one barely needs a referee — Microsoft's own memo proposes the
resolution.** Different tools, different jobs:
- **Generator/optimizer**: greedy (v1) → CP-SAT (when triggered). Never
  Z3 — it's not built to minimize an objective over this space.
- **Verifier/explainer**: Z3, lightweight, in-process (4 MB WASM npm
  binding, no microservice). Prove tiebreaker rulesets unambiguous
  offline (pain #5), produce UNSAT cores for infeasibility reports
  (pains #7, #8, #9 diagnosis), validate locked-set survival on parity
  regen (pain #6).

**Determinism caveat (flag for the build):** CP-SAT with
`num_search_workers > 1` is **not** bit-reproducible. To honor the
consensus on reproducibility, either pin a single worker + fixed seed
for production runs, or — better — **store the solution itself** (plus
seed + input hash) in `schedule_runs` so re-explanation reads the stored
result rather than re-solving. Anthropic's `schedule_runs.input_hash`
already implies this. Greedy v1 is trivially deterministic.

---

## The crystallized architecture

Six layers. Each lens owns the layer it was right about. No layer is
load-bearing on a component that can't justify being there.

```
┌──────────────────────────────────────────────────────────────────┐
│ 6. NARRATION  (OpenAI)            read-only · template fallback     │
│    parity rationale · conflict-option labels · tiebreaker prose ·   │
│    "why is this game here?" · violation explanations                │
│    INVARIANT: never writes DB, never calls the scheduler            │
├──────────────────────────────────────────────────────────────────┤
│ 5. VERIFY / EXPLAIN  (Microsoft Z3 + Anthropic)                    │
│    Z3: prove tiebreaker rulesets · UNSAT cores · push/pop checks    │
│    Provenance store: game_provenance · schedule_runs ·              │
│    tiebreaker_trace · TimeSlotFairnessReport · infeasibility report │
├──────────────────────────────────────────────────────────────────┤
│ 4. SCHEDULER ENGINE  (Karpathy now → Google later)                 │
│    interface SchedulerEngine { generate · rebalance · resolve }     │
│    v1: greedy(hardest-first) + hill-climb fairness + local-search   │
│        conflict resolver  ── deterministic, seeded                  │
│    v2 (when triggered): CP-SAT microservice, fairness as objective, │
│        warm-start re-solves  ── same interface                      │
├──────────────────────────────────────────────────────────────────┤
│ 3. INVARIANTS  (Karpathy + Anthropic)                              │
│    DB-enforced: venue/team no-double-book (unique partial idx) ·    │
│    locked_at untouched (WHERE locked_at IS NULL + SELECT FOR UPDATE)│
│    every published game has provenance (FK NOT NULL, same txn)      │
├──────────────────────────────────────────────────────────────────┤
│ 2. RELIABILITY  (Microsoft)        ← the actual migration-blocker   │
│    transactional outbox · idempotency keys · per-integration        │
│    circuit breakers · dead-letter in Process inbox · delivery       │
│    reconciliation. One source of truth: published_at filtered view, │
│    revalidatePath inside the same txn.                              │
├──────────────────────────────────────────────────────────────────┤
│ 1. EVAL HARNESS  (OpenAI + Anthropic)   cross-cuts everything       │
│    property-based invariants (INV-01..10) · golden sets GS-01..07 · │
│    narration faithfulness (every number traces to source) ·         │
│    10k random schedules, zero invariant failures before ship        │
└──────────────────────────────────────────────────────────────────┘
```

Read it bottom-up as build order of *foundations*: you cannot test
without the harness, cannot trust without the invariants, cannot ship
pains #1/#2 without reliability — and only then does the engine's
sophistication matter.

---

## Pain-by-pain ownership (who solves what, with which layer)

| Pain | Owning layer(s) | Mechanism |
|---|---|---|
| **#1** publish drift | Reliability | `published_at` filtered view; revalidate inside the publish txn; no second copy |
| **#2** notify chain broke | Reliability | transactional outbox + circuit breaker per rink + dead-letter inbox + delivery reconcile |
| **#3** playoff seed/advance | Engine + Verify | deterministic `BracketGenerator.fromStandings()`; reserved slots = hard constraint; Z3 verifies seeds; auto-advance trigger on result |
| **#4** dynamic tier reassign | Engine + Verify | warm-start re-solve within new tiers; Z3 push/pop validates locked games survive; narration explains tier moves |
| **#5** N-way tiebreaker | Verify (+ Narration) | deterministic `StandingsResolver`; **Z3 proves the ruleset is unambiguous offline**; full `tiebreaker_trace` stored; LLM narrates it |
| **#6** parity window regen | Engine + Invariants + Verify | `locked_at` proof of non-touch; partial regen of orphans only; Z3 confirms locked-set feasibility; infeasibility report if slots short |
| **#7** locked manual import | Invariants + Verify | import → `locked=true, source='manual_import'`; preview validates inline; Z3 UNSAT core names blocking fixtures |
| **#8** time-slot bias | Engine + Verify | post-pass v1 → objective term v2; `TimeSlotFairnessReport` per team; UNSAT core when tolerance unachievable |
| **#9** inline conflict resolve | Engine + Verify + Narration | local-search (or forbid-and-re-solve) yields ≤3 pre-validated deltas; Z3 push/pop certifies each clean; LLM writes the option labels |

Note the pattern: **the engine places, the verify layer proves &
explains, narration renders.** Every pain routes through that spine.

---

## Build sequence (reconciles the painpoint-doc order with the layers)

The painpoint doc (`00-pphl-painpoints.md`) already ordered the 9 by
business priority. The debate refines *how* to sequence the
foundations underneath them:

1. **Reliability foundation + one-source-of-truth publish** (Pain #1,
   then #2). Migration-blocker, pure systems work, unblocks trust.
   *(Microsoft layer 2.)*
2. **Invariants + provenance schema** — `locked_at` DB enforcement,
   `game_provenance`, `schedule_runs`, the eval harness skeleton.
   Nothing else is safe to build until this exists. *(Karpathy +
   Anthropic layers 1 & 3.)*
3. **Greedy engine v1 behind `SchedulerEngine`** + inline conflict
   resolver (Pain #9 — biggest day-to-day workflow win) + locked-import
   (Pain #7). *(Karpathy layer 4.)*
4. **Z3 verifier wired in** — tiebreaker proof (Pain #5), UNSAT-core
   infeasibility reports feeding #7/#8/#9. *(Microsoft/Anthropic layer
   5.)*
5. **Time-slot fairness post-pass** (Pain #8) + per-team fairness
   report.
6. **Parity window engine** (Pain #6) — partial regen on the proven
   locked-set guarantee.
7. **Playoff brackets + auto-advance** (Pain #3); **dynamic tournament
   tiers** (Pain #4).
8. **Narration layer** (OpenAI layer 6) — added once there's real
   engine output worth narrating; pure UX upgrade, never blocking.
9. **CP-SAT backend** — *only when* step 3's greedy plateaus on PPHL's
   real data against the metrics in Fight #1.

---

## Decisions (locked by repo owner — 2026-05-27)

1. **CP-SAT microservice: NOW.** Build the Python/FastAPI CP-SAT service
   from the start, not interface-only. *(Owner overrode the
   interface-only recommendation — we stand up the solver service now.
   The `SchedulerEngine` interface still wraps it so a greedy fallback
   and local dev path remain possible, but CP-SAT is the primary
   backend from day one.)*
2. **Z3: in-process WASM, adopt early.** `z3-solver` npm dep in the API
   process. Tiebreaker-ruleset proof (Pain #5) + UNSAT-core
   explainability (Pains #7/#8/#9) from the start.
3. **Narration LLM: AFTER the engine is solid.** Template strings cover
   v1; the LLM layer lands once the deterministic engine + provenance
   are proven. Layer 6 is explicitly deferred.
4. **Determinism: store the solution in `schedule_runs`.** Persist the
   full CP-SAT solution + seed + input hash; re-explanation reads the
   stored result rather than re-solving. No reliance on single-worker
   reproducibility — CP-SAT may run multi-worker for speed.

### Hosting topology (also locked 2026-05-27)

Constraint: free-tier-only, no card on file.

| Layer | Where it runs | Why |
|---|---|---|
| DB schema + provenance store | Supabase Postgres (existing project) | Source of truth; migration 0044 lands here. |
| Shared domain (`packages/scheduler-core`) | Built into every consumer | Pure TS — contracts, constraint catalogue, fairness, N-way tiebreaker. |
| Orchestrator (validate → call solver → Z3 verify → write provenance → publish state) | **Supabase Edge Functions** (Deno) | Same Postgres, same auth, free tier comfortably covers admin usage. Z3 WASM runs natively in Deno. |
| CP-SAT solver (`apps/scheduler-solver`) | **Hugging Face Spaces** (Docker · Python 3.12 + ortools + FastAPI) | Only truly card-free host with enough resources (16 GB RAM, 2 vCPU). Public endpoint protected with API-key check in the FastAPI handler. |
| Narration LLM (later) | Claude API from the orchestrator | Read-only, template fallback. |
| UI | `superadmin-web` (existing), role-filtered into other consoles | God-app rule preserved — no new console. |

Escape hatches if a free tier moves on us:
- Solver — same `Dockerfile` redeploys to Cloud Run / Fly / Oracle Free Ampere with no app-code change; orchestrator only knows the URL.
- Orchestrator — Edge Function modules are plain TS; they re-host as a NestJS module inside `superadmin-api` (or a separate Vercel Node function) with adapter-only changes.

---

## Bottom line

The five lenses converge on a system that is: **deterministic and
provenance-first at the core** (Anthropic), **simple enough to ship now
but abstracted to grow** (Karpathy → Google), **provable and
explainable via Z3 without a black box** (Microsoft), **rendered into
plain English by a strictly read-only LLM** (OpenAI), and — the point
everyone fighting over the solver nearly missed — **wrapped in a
reliability layer that fixes the publish/notify failures which are the
actual reason PPHL is in pain** (Microsoft).

Beating Avario is not about having a smarter solver than theirs. It's
about a schedule that publishes atomically, notifies reliably, explains
every decision it makes, and never silently destroys a human's locked
work. Build that, and the migration is won.
