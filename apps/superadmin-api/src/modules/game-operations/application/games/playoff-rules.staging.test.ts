import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { createDb, schema, type Database } from "@sportspulse/db";
import { FinalizeGameHandler } from "./handlers";
import { rowToGame } from "../../infrastructure/repositories/drizzle-game.repository";

test("playoff finalization uses its overtime override, refuses ties and can inherit regular-season rules", {
  skip: process.env.PPHL_STAGING_DB_TEST !== "1", timeout: 90_000,
}, async () => {
  process.loadEnvFile(".env.local"); const ref = process.env.STAGING_SUPABASE_REF;
  assert.ok(ref && ref !== "nmiiqyfwvbcvtwumtwil");
  const { ids } = JSON.parse(readFileSync("test-results-season/latest.json", "utf8"));
  const db = createDb({ url: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`, max: 1, idleTimeout: 1 });
  const rollback = new Error("playoff fixtures rolled back");
  await assert.rejects(db.transaction(async tx => {
    const id = randomUUID();
    await tx.execute(sql`insert into games select (jsonb_populate_record(null::games,to_jsonb(g)||jsonb_build_object(
      'id',${id}::text,'slot_id',null,'surface_id',null,'schedule_run_id',null,'source','manual',
      'published_at',now(),'finalized_at',null,'status','in_play','game_type','playoff',
      'home_score',0,'away_score',0,'metadata','{}'::jsonb,'scheduled_start_ts_utc','2097-02-01T20:00:00Z'
    ))).* from games g where season_id=${ids.seasonId}::uuid limit 1`);
    const [game] = await tx.select().from(schema.games).where(eq(schema.games.id, id)); assert.ok(game?.divisionId);
    await tx.execute(sql`update divisions set rule_set_overrides=jsonb_set(rule_set_overrides,'{gameRules}',coalesce(rule_set_overrides->'gameRules','{}'::jsonb)||'{"overtimeRule":"none"}'::jsonb),
      playoff_config=playoff_config||'{"overtimeRule":"sudden_death"}'::jsonb where id=${game.divisionId}::uuid`);
    const repo = { findById: async () => { const [row] = await tx.select().from(schema.games).where(eq(schema.games.id, id)); return row ? rowToGame(row) : null; } };
    const notify = { queue: async (_args: unknown, noticeTx: unknown) => { assert.ok(noticeTx); return {}; } };
    const handler = new FinalizeGameHandler(repo as never, tx as unknown as Database, notify as never);
    const input = { id, userId: process.env.STAGING_SUPERADMIN_ID! };
    await assert.rejects(handler.execute({ ...input, endedIn: "regulation" }), /needs a winner/);
    await tx.update(schema.games).set({ homeScore: 1 }).where(eq(schema.games.id, id));
    await assert.rejects(handler.execute({ ...input, endedIn: "shootout" }), /do not allow a shootout/);
    await tx.execute(sql`update divisions set playoff_config=playoff_config||'{"overtimeRule":null}'::jsonb where id=${game.divisionId}::uuid`);
    await assert.rejects(handler.execute({ ...input, endedIn: "overtime" }), /do not allow an overtime period/);
    await tx.execute(sql`update divisions set playoff_config=playoff_config||'{"overtimeRule":"sudden_death"}'::jsonb where id=${game.divisionId}::uuid`);
    const final = await handler.execute({ ...input, endedIn: "overtime" });
    assert.equal(final.status, "completed"); assert.equal(final.finalizeSummary.endedIn, "overtime");
    throw rollback;
  }), error => error === rollback);
});
