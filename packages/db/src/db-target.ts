/**
 * Connection for the ops scripts (migrate-manual, check-schema-drift).
 * Staging: DATABASE_URL (direct host or IPv4 session pooler), which must
 * name STAGING_SUPABASE_REF. Production: Supabase Management API with
 * SUPABASE_ACCESS_TOKEN + PROD_SUPABASE_REF, and only with
 * --confirm-production on the command line.
 */
import postgres from "postgres";

export type Target = "staging" | "production";
export type Run = (query: string) => Promise<Array<Record<string, unknown>>>;

export const PROD_REF = "nmiiqyfwvbcvtwumtwil";

/** --target=staging|production, or MIGRATE_TARGET. No default on purpose. */
export function readTarget(argv: string[] = process.argv.slice(2)): Target {
  const t =
    argv.find((a) => a.startsWith("--target="))?.slice("--target=".length) ??
    process.env.MIGRATE_TARGET;
  if (t !== "staging" && t !== "production") {
    throw new Error("Choose a database: --target=staging or --target=production");
  }
  return t;
}

export async function connect(
  target: Target,
  argv: string[]
): Promise<{ run: Run; close: () => Promise<void> }> {
  if (target === "staging") {
    const url = process.env.DATABASE_URL;
    const ref = process.env.STAGING_SUPABASE_REF;
    const u = url ? new URL(url) : null;
    const isStaging =
      !!u &&
      !!ref &&
      ref !== PROD_REF &&
      (u.hostname === `db.${ref}.supabase.co` ||
        (u.hostname.endsWith(".pooler.supabase.com") &&
          decodeURIComponent(u.username) === `postgres.${ref}`));
    if (!isStaging) {
      throw new Error("DATABASE_URL must point at the staging project (STAGING_SUPABASE_REF)");
    }
    const sql = postgres(url!, { max: 1, ssl: "require", prepare: false });
    return {
      run: async (q) => (await sql.unsafe(q)) as unknown as Array<Record<string, unknown>>,
      close: () => sql.end()
    };
  }

  if (!argv.includes("--confirm-production")) throw new Error("Production needs --confirm-production");
  const ref = process.env.PROD_SUPABASE_REF;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (ref !== PROD_REF) throw new Error(`PROD_SUPABASE_REF must be ${PROD_REF}`);
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN is required for production");
  return {
    run: async (q) => {
      const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: q })
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`Management API ${res.status}: ${text.slice(0, 500)}`);
      return text ? (JSON.parse(text) as Array<Record<string, unknown>>) : [];
    },
    close: async () => undefined
  };
}
