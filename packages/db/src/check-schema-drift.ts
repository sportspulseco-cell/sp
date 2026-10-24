/**
 * Proves the live database matches the Drizzle schema (src/schema), the
 * source of truth. Exits 1 when a Drizzle table, column, nullability or
 * column type is missing or different in the database. Database-only
 * tables and columns are listed for information (Supabase-managed
 * objects and hand-written SQL extras), not failures.
 *
 * Usage (from packages/db):
 *   MIGRATE_TARGET=staging    tsx src/check-schema-drift.ts
 *   MIGRATE_TARGET=production tsx src/check-schema-drift.ts --confirm-production
 */
import "dotenv/config";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { connect, readTarget } from "./db-target";

/** Map Drizzle's SQL type to information_schema's udt_name. */
function udt(sqlType: string): string {
  const t = sqlType.toLowerCase().replace(/\(.*\)/, "").trim();
  const map: Record<string, string> = {
    uuid: "uuid",
    text: "text",
    integer: "int4",
    smallint: "int2",
    bigint: "int8",
    boolean: "bool",
    jsonb: "jsonb",
    json: "json",
    date: "date",
    "timestamp with time zone": "timestamptz",
    timestamp: "timestamp",
    "timestamp without time zone": "timestamp",
    numeric: "numeric",
    "double precision": "float8",
    real: "float4",
    char: "bpchar",
    varchar: "varchar",
    citext: "citext",
    inet: "inet",
    "time with time zone": "timetz",
    time: "time",
    interval: "interval"
  };
  if (t.endsWith("[]")) return `_${udt(t.slice(0, -2))}`;
  return map[t] ?? t;
}

async function main() {
  const argv = process.argv.slice(2);
  const target = readTarget();
  const { run, close } = await connect(target, argv);
  try {
    const rows = await run(`
      SELECT c.table_name, c.column_name, c.udt_name, c.is_nullable
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    `);
    const live = new Map<string, Map<string, { udt: string; nullable: boolean }>>();
    for (const r of rows) {
      const tn = String(r.table_name);
      if (!live.has(tn)) live.set(tn, new Map());
      live.get(tn)!.set(String(r.column_name), {
        udt: String(r.udt_name),
        nullable: r.is_nullable === "YES"
      });
    }

    const problems: string[] = [];
    const declared = new Set<string>();
    let tables = 0;
    let columns = 0;
    for (const v of Object.values(schema)) {
      if (!is(v as never, PgTable)) continue;
      const cfg = getTableConfig(v as PgTable);
      if ((cfg.schema ?? "public") !== "public") continue;
      tables++;
      declared.add(cfg.name);
      const cols = live.get(cfg.name);
      if (!cols) {
        problems.push(`missing table ${cfg.name}`);
        continue;
      }
      for (const col of cfg.columns) {
        columns++;
        const c = cols.get(col.name);
        if (!c) {
          problems.push(`missing column ${cfg.name}.${col.name}`);
          continue;
        }
        const want = udt(col.getSQLType());
        if (want !== c.udt) problems.push(`type ${cfg.name}.${col.name}: drizzle ${want}, db ${c.udt}`);
        if (col.notNull && c.nullable) problems.push(`nullability ${cfg.name}.${col.name}: drizzle NOT NULL, db nullable`);
        if (!col.notNull && !c.nullable) problems.push(`nullability ${cfg.name}.${col.name}: drizzle nullable, db NOT NULL`);
      }
    }

    const extraTables = [...live.keys()].filter((t) => !declared.has(t)).sort();
    console.log(`[${target}] drizzle tables ${tables}, columns ${columns}; db tables ${live.size}`);
    if (extraTables.length) console.log(`[${target}] db-only tables (info): ${extraTables.join(", ")}`);
    if (problems.length) {
      console.log(`[${target}] DRIFT (${problems.length}):`);
      for (const p of problems) console.log(`  - ${p}`);
      process.exitCode = 1;
    } else {
      console.log(`[${target}] no drift: every Drizzle table and column exists with the same type and nullability`);
    }
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
