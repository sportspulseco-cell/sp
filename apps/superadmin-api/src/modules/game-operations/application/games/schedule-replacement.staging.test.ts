import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { createDb } from "@sportspulse/db";

test("draft replacement rolls back on provenance failure and rejects stale snapshots", {
  skip: process.env.PPHL_STAGING_DB_TEST !== "1",
}, async () => {
  process.loadEnvFile(".env.local");
  const ref = process.env.STAGING_SUPABASE_REF;
  assert.ok(ref && ref !== "nmiiqyfwvbcvtwumtwil");
  const db = createDb({ url: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`, max: 1, idleTimeout: 1 });
  const rollback = new Error("schedule fixtures rolled back");
  await assert.rejects(db.transaction(async tx => {
    await tx.execute(sql.raw(readFileSync("packages/db/migrations/0097_atomic_schedule_draft_replacement.sql", "utf8")));
    const season = randomUUID(), division = randomUUID(), oldId = randomUUID(), newId = randomUUID(), run = randomUUID();
    await tx.execute(sql`insert into seasons select (jsonb_populate_record(null::seasons,to_jsonb(s) || jsonb_build_object('id',${season}::text,'name',${`QA atomic ${season}`}::text))).* from seasons s where id=${process.env.STAGING_SEASON_ID}::uuid`);
    await tx.execute(sql`insert into divisions select (jsonb_populate_record(null::divisions,to_jsonb(d) || jsonb_build_object('id',${division}::text,'season_id',${season}::text))).* from divisions d where season_id=${process.env.STAGING_SEASON_ID}::uuid and deleted_at is null limit 1`);
    await tx.execute(sql`insert into schedule_runs(id,season_id,division_id,seed,input_hash,status) values(${run}::uuid,${season}::uuid,${division}::uuid,'QA','QA','running')`);
    await tx.execute(sql`insert into games select (jsonb_populate_record(null::games,to_jsonb(g) || jsonb_build_object(
      'id',${oldId}::text,'season_id',${season}::text,'division_id',${division}::text,'slot_id',null,'surface_id',null,
      'schedule_run_id',${run}::text,'source','generated','game_type','regular','status','scheduled',
      'locked_at',null,'published_at',null,'finalized_at',null,'home_score',0,'away_score',0
    ))).* from games g join leagues l on l.id=g.league_id where l.org_id=${process.env.STAGING_ORG_ENTITY_ID}::uuid limit 1`);
    const [old] = await tx.execute(sql`select to_jsonb(g) body from games g where id=${oldId}::uuid`);
    assert.ok(old, "Representative staging game required");
    const game = { ...(old.body as Record<string, unknown>), id: newId };
    const [snapshotRow] = await tx.execute(sql`select jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at)) snapshot from games where season_id=${season}::uuid and division_id=${division}::uuid`);
    const snapshot = JSON.stringify(snapshotRow!.snapshot);
    const payload = JSON.stringify([game]);
    const provenance = JSON.stringify([{ game_id: newId, schedule_run_id: run, constraint_ids: ["qa"] }]);
    // Missing provenance fails AFTER the old draft is deleted and its replacement inserted.
    await assert.rejects(tx.transaction(async savepoint => {
      await savepoint.execute(sql`select sp_replace_schedule_drafts(${run}::uuid,${snapshot}::jsonb,ARRAY[${oldId}::uuid],${payload}::jsonb,'[]'::jsonb)`);
    }), /schedule_provenance_incomplete/);
    assert.equal((await tx.execute(sql`select id from games where id=${oldId}::uuid`)).length, 1);
    assert.equal((await tx.execute(sql`select id from games where id=${newId}::uuid`)).length, 0);
    await tx.execute(sql`update games set updated_at=updated_at+interval '1 second' where id=${oldId}::uuid`);
    await assert.rejects(tx.transaction(async savepoint => {
      await savepoint.execute(sql`select sp_replace_schedule_drafts(${run}::uuid,${snapshot}::jsonb,ARRAY[${oldId}::uuid],${payload}::jsonb,${provenance}::jsonb)`);
    }), /schedule_changed_during_generation/);
    const [fresh] = await tx.execute(sql`select jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at)) snapshot from games where season_id=${season}::uuid and division_id=${division}::uuid`);
    const result = await tx.execute(sql`select sp_replace_schedule_drafts(${run}::uuid,${JSON.stringify(fresh!.snapshot)}::jsonb,ARRAY[${oldId}::uuid],${payload}::jsonb,${provenance}::jsonb) n`);
    assert.equal(result[0]?.n, 1);
    assert.equal((await tx.execute(sql`select id from games where id=${oldId}::uuid`)).length, 0);
    assert.equal((await tx.execute(sql`select id from game_provenance where game_id=${newId}::uuid`)).length, 1);
    const [permissions] = await tx.execute(sql`select has_function_privilege('anon','public.sp_replace_schedule_drafts(uuid,jsonb,uuid[],jsonb,jsonb)','execute') anon,
      has_function_privilege('authenticated','public.sp_replace_schedule_drafts(uuid,jsonb,uuid[],jsonb,jsonb)','execute') signed_in`);
    assert.equal(permissions?.anon, false); assert.equal(permissions?.signed_in, false);
    throw rollback;
  }), error => error === rollback);
});
