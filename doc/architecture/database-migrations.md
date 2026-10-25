# Database migrations — runbook

One process for staging and production. Set up 24 Oct 2026, after
migrations had been applied four different ways (drizzle-kit, the Supabase
SQL editor, the Supabase MCP tool, and a staging-only script) and
production had no single record of what was applied.

## The pieces

| Piece | Where | Job |
|---|---|---|
| Schema (source of truth) | `packages/db/src/schema/*.ts` | Drizzle tables; the API's queries are typed from it |
| Migration files | `packages/db/migrations/NNNN_name.sql` (+ `NNNN_name.rollback.sql`) | Idempotent SQL; the rollback is never applied automatically |
| Drizzle baseline | `migrations/meta/_journal.json` + latest `NNNN_snapshot.json` | Lets `drizzle-kit generate` draft only real new changes |
| Runner | `packages/db/src/migrate-manual.ts` | Applies pending files 0014+ and records each in `public.manual_migrations` (filename, sha256). A recorded file whose content changes stops the run; a change of line endings only (git core.autocrlf) does not |
| Drift check | `packages/db/src/check-schema-drift.ts` | Fails if a Drizzle table/column is missing or differs (type, nullability) in the live DB |
| Connections | `packages/db/src/db-target.ts` | Staging: `DATABASE_URL` (direct host or IPv4 session pooler, must name `STAGING_SUPABASE_REF`). Production: Supabase Management API with `SUPABASE_ACCESS_TOKEN`, `PROD_SUPABASE_REF`, and `--confirm-production` |

## Making a change

1. Edit `packages/db/src/schema/*.ts`.
2. `pnpm --filter @sportspulse/db generate --name=<what>`. Review the file:
   make it idempotent (`IF NOT EXISTS`, guarded constraints), additive,
   with RLS enabled and `anon` revoked on any new table. Write the
   `.rollback.sql` beside it.
3. `pnpm --filter @sportspulse/db migrate --target=staging`, then
   `pnpm --filter @sportspulse/db drift --target=staging`. Test the flow on staging.
4. With the owner's go-ahead:
   `pnpm --filter @sportspulse/db migrate --target=production --confirm-production`
   and `drift --target=production --confirm-production`.
5. Only then deploy the code that reads the new columns.

`migrate:status` lists pending files without running anything. A file
already recorded whose content changes stops the run: add a new file.

## Never

- `drizzle-kit migrate`: its own table only knows 0000–0013 and would
  replay the hand-written files. (The script was removed.)
- `drizzle-kit push` / `drop`: change the database with no record. (Removed.)
- Pasting schema SQL into the Supabase editor or MCP tool: same problem.
  If it happens anyway, record it: `migrate --target=… --baseline-through=N --note="how verified"`.

## State on 24 Oct 2026

| | Recorded in `manual_migrations` | Drift check |
|---|---|---|
| Staging | 36 (0014–0052 minus the 3 cron files staging defers) | clean: 88 tables, 1,113 columns |
| Production | 39 (0014–0052), recorded as a verified baseline: Supabase history for 0014–0047/0049/0051, objects checked for 0034, 0048, 0050, 0052 | clean: 88 tables, 1,113 columns |

`drizzle-kit generate` against the new baseline: "No schema changes".
`drizzle-kit check`: "Everything's fine".
