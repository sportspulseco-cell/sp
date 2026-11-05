import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb, type Database } from "@sportspulse/db";
import { DrizzleGameRepository } from "./drizzle-game.repository";

test("schedule filters and global order apply before paging past 100 historic games", {
  skip: process.env.PPHL_STAGING_DB_TEST !== "1",
}, async () => {
  process.loadEnvFile(".env.local");
  const ref = process.env.STAGING_SUPABASE_REF;
  assert.ok(ref && ref !== "nmiiqyfwvbcvtwumtwil");
  const db = createDb({ url: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`, max: 1, idleTimeout: 1 });
  const rollback = new Error("schedule pagination fixtures rolled back");
  await assert.rejects(db.transaction(async tx => {
    const season = randomUUID(), division = randomUUID();
    const [source] = await tx.execute(sql`select g.id,g.season_id,g.division_id from games g join leagues l on l.id=g.league_id
      join divisions d on d.id=g.division_id where l.org_id=${process.env.STAGING_ORG_ENTITY_ID}::uuid and g.season_id is not null limit 1`);
    assert.ok(source);
    await tx.execute(sql`insert into seasons select (jsonb_populate_record(null::seasons,to_jsonb(s) || jsonb_build_object('id',${season}::text,'name',${`QA pages ${season}`}::text))).* from seasons s where id=${source.season_id}::uuid`);
    await tx.execute(sql`insert into divisions select (jsonb_populate_record(null::divisions,to_jsonb(d) || jsonb_build_object('id',${division}::text,'season_id',${season}::text))).* from divisions d where id=${source.division_id}::uuid`);
    await tx.execute(sql`insert into games select (jsonb_populate_record(null::games,to_jsonb(g) || jsonb_build_object(
      'id',gen_random_uuid()::text,'season_id',${season}::text,'division_id',${division}::text,'slot_id',null,'surface_id',null,'schedule_run_id',null,
      'source','manual','locked_at',null,'published_at',now(),'finalized_at',null,
      'status',case when i<130 then 'completed' when i=133 then 'in_play' else 'scheduled' end,
      'scheduled_start_ts_utc',case when i<130 or i=133 then '2020-01-01'::timestamptz+i*interval '1 day' else '2090-01-01'::timestamptz+i*interval '1 day' end
    ))).* from games g cross join generate_series(0,133) i where g.id=${source.id}::uuid`);
    const repo = new DrizzleGameRepository(tx as unknown as Database);
    const upcoming = await repo.list({ seasonId: season, scheduleFilter: "upcoming", limit: 2 });
    assert.equal(upcoming.items.length, 2); assert.equal(upcoming.items[0]?.status, "in_play"); assert.ok(upcoming.nextCursor);
    const rest = await repo.list({ seasonId: season, scheduleFilter: "upcoming", limit: 2, cursor: upcoming.nextCursor });
    assert.equal(rest.items.length, 2); assert.equal(rest.nextCursor, null);
    assert.equal(new Set([...upcoming.items, ...rest.items].map(g => g.id.value)).size, 4);
    await assert.rejects(repo.list({ seasonId: season, scheduleFilter: "completed", limit: 2, cursor: upcoming.nextCursor }), /first page/);
    const completed = await repo.list({ seasonId: season, scheduleFilter: "completed", limit: 100 });
    const older = await repo.list({ seasonId: season, scheduleFilter: "completed", limit: 100, cursor: completed.nextCursor! });
    assert.equal(completed.items.length, 100); assert.equal(older.items.length, 30);
    assert.ok(completed.items[99]!.scheduledStartTsUtc >= older.items[0]!.scheduledStartTsUtc);
    const all = []; let cursor;
    do {
      const page = await repo.list({ seasonId: season, scheduleFilter: "all", limit: 50, cursor });
      all.push(...page.items); cursor = page.nextCursor ?? undefined;
    } while (cursor);
    assert.equal(all.length, 134); assert.equal(new Set(all.map(g => g.id.value)).size, 134);
    assert.ok(all.slice(0, 4).every(g => g.status !== "completed"));
    assert.ok(all.slice(4).every((g, i, rows) => !i || rows[i-1]!.scheduledStartTsUtc >= g.scheduledStartTsUtc));
    throw rollback;
  }), e => e === rollback);
});
