/**
 * The one migration runner for SportsPulse (staging and production).
 *
 * Migrations 0014+ are hand-written, idempotent SQL in ./migrations
 * (`NNNN_name.sql`, with an optional `NNNN_name.rollback.sql` beside it
 * that is never auto-applied). drizzle-kit's own journal stops at 0013,
 * so `drizzle-kit migrate` must not be used; Drizzle stays the schema
 * source of truth (src/schema) and `pnpm --filter @sportspulse/db
 * drift` proves the live databases match it.
 *
 * Each applied file is recorded in public.manual_migrations with its
 * sha256; a recorded file whose content later changes stops the run.
 *
 * Usage (from packages/db):
 *   MIGRATE_TARGET=staging    tsx src/migrate-manual.ts [--status]
 *   MIGRATE_TARGET=production tsx src/migrate-manual.ts [--status] --confirm-production
 *   ... --baseline-through=52 --note="why"   record files as already applied, run nothing
 *
 * Staging connects with DATABASE_URL (direct host or IPv4 session pooler,
 * both must name STAGING_SUPABASE_REF). Production goes through the
 * Supabase Management API with SUPABASE_ACCESS_TOKEN and PROD_SUPABASE_REF.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { connect, readTarget } from "./db-target";

const FIRST_MANUAL = 14;
// Staging configures these HTTP-calling cron jobs only after its API URL
// and secret are verified, so the runner skips them there.
const STAGING_DEFERRED = new Set([
  "0034_cron_jobs.sql",
  "0036_compliance_lock_sweep_cron.sql",
  "0043_season_auto_transition_cron.sql",
  "0093_game_reminders_cron.sql",
  "0087_scheduled_broadcasts_cron.sql",
  "0095_crons_only_when_due.sql"
]);

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const target = readTarget();
const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** The recorded hash matches this body with LF or with CRLF line endings. */
function sameMigration(recorded: string, body: string): boolean {
  const lf = body.replace(/\r\n/g, "\n");
  return recorded === sha256(body) || recorded === sha256(lf) || recorded === sha256(lf.replace(/\n/g, "\r\n"));
}

function files(): Array<{ filename: string; body: string; sha256: string; number: number }> {
  return readdirSync("./migrations")
    .filter((n) => /^\d{4}_.+\.sql$/.test(n) && !n.endsWith(".rollback.sql"))
    .map((filename) => {
      const body = readFileSync(join("./migrations", filename), "utf8");
      return {
        filename,
        body,
        number: Number(filename.slice(0, 4)),
        sha256: sha256(body)
      };
    })
    .filter((f) => f.number >= FIRST_MANUAL)
    .sort((a, b) => a.filename.localeCompare(b.filename));
}

async function main() {
  const { run, close } = await connect(target, args);
  try {
    await run(`
      CREATE TABLE IF NOT EXISTS public.manual_migrations (
        filename text PRIMARY KEY,
        sha256 text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now(),
        note text
      );
      ALTER TABLE public.manual_migrations ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON public.manual_migrations FROM anon, authenticated;
    `);
    // Staging's earlier tracker becomes this one (same columns).
    const [legacy] = await run(
      `SELECT to_regclass('public.staging_manual_migrations') IS NOT NULL AS present`
    );
    if (legacy?.present) {
      await run(`
        INSERT INTO public.manual_migrations (filename, sha256, applied_at, note)
        SELECT filename, sha256, applied_at, 'from staging_manual_migrations'
        FROM public.staging_manual_migrations
        ON CONFLICT (filename) DO NOTHING
      `);
    }

    const recorded = new Map(
      (await run(`SELECT filename, sha256 FROM public.manual_migrations`)).map((r) => [
        String(r.filename),
        String(r.sha256)
      ])
    );
    const all = files();
    for (const f of all) {
      const prev = recorded.get(f.filename);
      // Git on Windows (core.autocrlf) can rewrite a file's line endings
      // after it was applied; that is not a change to the migration.
      if (prev && !sameMigration(prev, f.body)) {
        throw new Error(`${f.filename} changed after it was applied (${target}). Add a new migration instead.`);
      }
    }
    const pending = all.filter(
      (f) => !recorded.has(f.filename) && !(target === "staging" && STAGING_DEFERRED.has(f.filename))
    );

    if (flag("status")) {
      console.log(`[${target}] recorded ${recorded.size}, pending ${pending.length}`);
      for (const f of pending) console.log(`  pending ${f.filename}`);
      return;
    }

    const baseline = option("baseline-through");
    if (baseline !== undefined) {
      const through = Number(baseline);
      const note = option("note");
      if (!Number.isInteger(through) || !note) {
        throw new Error("--baseline-through=N needs an integer and --note=\"how it was verified\"");
      }
      const rows = pending.filter((f) => f.number <= through);
      for (const f of rows) {
        await run(
          `INSERT INTO public.manual_migrations (filename, sha256, note)
           VALUES (${quote(f.filename)}, ${quote(f.sha256)}, ${quote(`baseline: ${note}`)})
           ON CONFLICT (filename) DO NOTHING`
        );
      }
      console.log(`[${target}] baseline recorded ${rows.length} file(s) through ${through}; nothing executed`);
      return;
    }

    if (pending.length === 0) console.log(`[${target}] up to date (${recorded.size} recorded)`);
    for (const f of pending) {
      console.log(`[${target}] applying ${f.filename}`);
      await run(f.body);
      await run(
        `INSERT INTO public.manual_migrations (filename, sha256) VALUES (${quote(f.filename)}, ${quote(f.sha256)})`
      );
    }
    if (pending.length) {
      await run(`SELECT pg_notify('pgrst', 'reload schema')`);
      console.log(`[${target}] applied ${pending.length}`);
    }
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
