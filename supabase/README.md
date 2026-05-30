# SportsPulse — Supabase Edge Functions (scheduler orchestrator)

Deno + TypeScript runtime that orchestrates the scheduler: validates
input, loads data from Postgres, calls the live CP-SAT solver on HF
Spaces, writes provenance, manages publish state.

Topology decision: `doc/avario-reverse-engineering/scheduler-debate/00-synthesis-and-final-plan.md`.

## Layout

```
supabase/
  config.toml                            CLI config — verify_jwt on each fn
  .env.example                           Template; real values in .env.local (gitignored)
  functions/
    _shared/
      env.ts                             Typed env loader
      cors.ts                            CORS preflight + headers
      contracts.ts                       Wire contract (mirrors scheduler-core)
      solver-client.ts                   POST /solve to HF Spaces
      supabase-client.ts                 service-role client
      hash.ts                            sha256 of canonical JSON
    scheduler-generate/index.ts          load → solve → persist
    scheduler-publish/index.ts           atomic published_at flip
```

## Endpoints

### `POST /functions/v1/scheduler-generate`

Body:
```jsonc
{
  "seasonId": "uuid",
  "divisionId": "uuid",
  "gamesPerPair": 1,        // optional, default 1
  "timeLimitSeconds": 60,   // optional, default 60
  "seed": "optional",       // optional; default = randomUUID; stored for replay
  "maxLateFraction": 0.30   // optional cap on late games per team
}
```

Returns:
```jsonc
{
  "runId": "uuid",
  "status": "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "TIMEOUT" | "FAILED",
  "gamesCreated": 28,
  "gamesLockedPreserved": 3,
  "solveTimeMs": 410,
  "infeasibility": { ... }   // only when status is INFEASIBLE/TIMEOUT
}
```

What happens:
1. Loads season, teams in the division, available ice slots, locked
   fixtures (games with `locked_at IS NOT NULL`).
2. Computes `input_hash` (sha256 of canonicalised JSON).
3. Inserts a `schedule_runs` row with `status='running'`.
4. POSTs the `SolveRequest` to the CP-SAT solver.
5. On success: deletes prior `source='generated'` games for this
   scope **where `locked_at IS NULL`** (the invariant — locked rows
   never leave), then batch-inserts new games + `game_provenance`.
6. Closes out the `schedule_runs` row with the full solution (decision
   #4: re-explanation reads stored result, never re-solves).

### `POST /functions/v1/scheduler-publish`

Body:
```jsonc
{
  "seasonId": "uuid",
  "divisionId": "uuid",        // optional — restrict scope
  "scheduleRunId": "uuid"      // optional — only publish a specific run's output
}
```

Atomically flips `published_at` from `NULL → now()` for matching rows.
Idempotent (only touches rows still NULL). This **is** the source of
truth for pain #1 — no separate published snapshot.

## Deploy

### One-time setup

```bash
# 1. Install the Supabase CLI (https://supabase.com/docs/guides/cli)
npm i -g supabase

# 2. Link this repo to your remote Supabase project
supabase link --project-ref <your-project-ref>

# 3. Push the runtime secrets (SOLVER_URL, SOLVER_API_KEY)
supabase secrets set --env-file supabase/.env.local
```

### Per-deploy

```bash
supabase functions deploy scheduler-generate scheduler-publish
```

### Smoke test (after deploy)

```bash
SUPABASE_URL=https://<project>.supabase.co
USER_JWT="$(supabase auth login --print-jwt)"  # or an admin's session JWT

# Generate
curl -X POST "$SUPABASE_URL/functions/v1/scheduler-generate" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"seasonId":"...","divisionId":"...","gamesPerPair":1}'

# Publish
curl -X POST "$SUPABASE_URL/functions/v1/scheduler-publish" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"seasonId":"..."}'
```

## What this build does NOT yet do

These are explicit TODOs for the next iteration — captured here so we
don't lose them:

- **Permission gating** — currently `verify_jwt=true` ensures the
  caller is signed in, but no role check against
  `user_role_assignments`. Add `scheduler.run` / `scheduler.publish`
  permissions to the canonical catalogue and gate at the top of each
  handler.
- **Z3 verifier wiring** — the orchestrator does not yet run the Z3
  UNSAT-core / tiebreaker-proof passes. They live in a future
  `scheduler-verify` function called pre-commit.
- **`scheduler-conflict-resolve`** — the inline conflict resolver
  (pain #9). Needs Z3 push/pop to validate each proposed option
  before surfacing.
- **Fairness post-pass** — pain #8 metric computation + per-team
  band report. The data is captured in `solveResponse.perTeamBandCounts`
  but not yet surfaced.
- **Realtime broadcast** — notify connected clients on publish so
  the public schedule view doesn't poll.
- **Per-game venue/locked-fixture validation** — currently the
  generator's pre-game DELETE preserves `locked_at IS NOT NULL` rows
  but does not check that locked fixtures' slots are still in the
  available pool. Edge case for parity-window regen (pain #6).

## Source-of-truth contracts

The wire contract for the solver lives in three places that MUST stay
in lockstep:

1. `packages/scheduler-core/src/contracts.ts` — canonical TS
2. `apps/scheduler-solver/main.py` — Pydantic models in the solver
3. `supabase/functions/_shared/contracts.ts` — Deno-runtime mirror

Pydantic validation in the solver is the drift detector: if these get
out of sync, the next `POST /solve` fails fast with a 422 and the
mismatched field is in the error body.
