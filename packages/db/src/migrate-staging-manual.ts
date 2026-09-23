import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
const ref = process.env.STAGING_SUPABASE_REF;
const through = Number(process.env.STAGING_MIGRATE_THROUGH ?? "15");
// These files schedule HTTP calls through vault. Staging configures its own
// jobs only after its API URL and secret have been verified.
const deferredCronFiles = new Set([
  "0034_cron_jobs.sql",
  "0036_compliance_lock_sweep_cron.sql",
  "0043_season_auto_transition_cron.sql"
]);
if (!url || !ref || new URL(url).hostname !== `db.${ref}.supabase.co`) {
  throw new Error("A direct staging database URL and matching staging ref are required");
}
if (!Number.isInteger(through) || through < 14 || through > 47) {
  throw new Error("STAGING_MIGRATE_THROUGH must be between 14 and 47");
}

async function main() {
  const sql = postgres(url!, { max: 1, ssl: "require", prepare: false });
  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS public.staging_manual_migrations (
        filename text PRIMARY KEY,
        sha256 text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const files = readdirSync("./migrations")
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .filter((name) => Number(name.slice(0, 4)) >= 14 && Number(name.slice(0, 4)) <= through)
      .filter((name) => !deferredCronFiles.has(name))
      .sort();
    for (const filename of files) {
      const body = readFileSync(join("./migrations", filename), "utf8");
      const sha256 = createHash("sha256").update(body).digest("hex");
      const [previous] = await sql`
        SELECT sha256 FROM public.staging_manual_migrations WHERE filename = ${filename}
      `;
      if (previous) {
        if (previous.sha256 !== sha256) throw new Error(`${filename} changed after application`);
        console.log(`Skipped ${filename}`);
        continue;
      }
      console.log(`Applying ${filename}`);
      await sql.unsafe(body);
      await sql`
        INSERT INTO public.staging_manual_migrations (filename, sha256)
        VALUES (${filename}, ${sha256})
      `;
    }
    await sql`SELECT pg_notify('pgrst', 'reload schema')`;
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
