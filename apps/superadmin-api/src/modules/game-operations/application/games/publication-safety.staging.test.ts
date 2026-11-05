import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb } from "@sportspulse/db";
import { assertSchedulePublishable, lockSchedulePublication } from "./publication-safety";

test("staging PostgreSQL: clashes block publication, adjacent/cancelled bookings do not", {
  skip: process.env.PPHL_STAGING_DB_TEST !== "1"
}, async () => {
  process.loadEnvFile(".env.local");
  const ref = process.env.STAGING_SUPABASE_REF;
  assert.ok(ref && ref !== "nmiiqyfwvbcvtwumtwil", "Staging project required");
  const db = createDb({url: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`, max:1,idleTimeout:1});
  const first = randomUUID(), second = randomUUID();
  const rollback = new Error("test fixtures rolled back");
  await assert.rejects(db.transaction(async tx => {
    await tx.execute(sql`insert into games select (jsonb_populate_record(null::games, to_jsonb(g) || jsonb_build_object(
      'id', ${first}::text, 'slot_id', null, 'schedule_run_id', null, 'locked_at', null, 'published_at', null,
      'scheduled_start_ts_utc', '2098-01-01T20:00:00Z', 'duration_min', 60, 'status', 'scheduled', 'source', 'manual'
    ))).* from games g join leagues l on l.id = g.league_id where l.org_id = ${process.env.STAGING_ORG_ENTITY_ID}::uuid limit 1`);
    const made = await tx.execute(sql`select id from games where id = ${first}::uuid`);
    assert.equal(made.length,1,"A real staging game fixture is required");
    await tx.execute(sql`insert into games select (jsonb_populate_record(null::games, to_jsonb(g) || jsonb_build_object(
      'id', ${second}::text, 'scheduled_start_ts_utc', '2098-01-01T20:30:00Z'
    ))).* from games g where id = ${first}::uuid`);
    await lockSchedulePublication(tx);
    await assert.rejects(assertSchedulePublishable(tx,sql`g.id = ${first}::uuid`),/Resolve overlapping/);
    await tx.execute(sql`update games set scheduled_start_ts_utc = '2098-01-01T21:00:00Z' where id = ${second}::uuid`);
    await assertSchedulePublishable(tx,sql`g.id = ${first}::uuid`);
    await tx.execute(sql`update games set scheduled_start_ts_utc = '2098-01-01T20:30:00Z', status = 'cancelled' where id = ${second}::uuid`);
    await assertSchedulePublishable(tx,sql`g.id = ${first}::uuid`);
    throw rollback;
  }), error => error === rollback);
  const left = await db.execute(sql`select id from games where id in (${first}::uuid, ${second}::uuid)`);
  assert.equal(left.length,0,"No fixtures persist after this test");
});
