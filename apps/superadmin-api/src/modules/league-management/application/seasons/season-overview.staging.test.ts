import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { createDb, type Database } from "@sportspulse/db";
import { SeasonOverviewService } from "./season-overview.service";

test("season overview counts beyond pagination limits without exposing records or accepting player scope", {
  skip: process.env.PPHL_STAGING_DB_TEST !== "1",
}, async () => {
  process.loadEnvFile(".env.local"); const ref = process.env.STAGING_SUPABASE_REF;
  assert.ok(ref && ref !== "nmiiqyfwvbcvtwumtwil");
  const source = JSON.parse(readFileSync("test-results-season/latest.json", "utf8")).ids.seasonId as string;
  const db = createDb({ url: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`, max: 1, idleTimeout: 1 });
  const rollback = new Error("overview fixtures rolled back");
  await assert.rejects(db.transaction(async tx => {
    const service = new SeasonOverviewService(tx as unknown as Database);
    await assert.rejects(service.execute(source, process.env.STAGING_PLAYER_ID!), /Season/);
    const overview = await service.execute(source, process.env.STAGING_SUPERADMIN_ID!);
    assert.equal(overview.divisions, 3); assert.equal(overview.placedTeams, 12);
    assert.equal(overview.games, 36); assert.equal(overview.finalGames, 6); assert.equal(overview.players, 60); // 48 players + 12 playing captains
    assert.equal(overview.publishedForm, true);
    assert.ok(Buffer.byteLength(JSON.stringify(overview)) < 800, "Only bounded counts and next-game time cross the API");
    const seasonId = randomUUID();
    await tx.execute(sql`insert into seasons select (jsonb_populate_record(null::seasons,to_jsonb(s)||jsonb_build_object('id',${seasonId}::text,'name',${`QA count ${seasonId}`}::text,'metadata','{}'::jsonb))).* from seasons s where id=${source}::uuid`);
    await tx.execute(sql`insert into registrations select (jsonb_populate_record(null::registrations,to_jsonb(r)||jsonb_build_object(
      'id',gen_random_uuid()::text,'idempotency_key',gen_random_uuid()::text,'season_id',${seasonId}::text,'status','cancelled'
    ))).* from (select * from registrations where season_id=${source}::uuid limit 1) r cross join generate_series(1,2107)`);
    const large = await service.execute(seasonId, process.env.STAGING_SUPERADMIN_ID!);
    assert.equal(large.registrations, 2107); assert.equal(large.waitingRegistrations, 0);
    assert.equal(large.games, 0); assert.equal(large.players, 0); assert.equal(large.nextGame, null);
    throw rollback;
  }), e => e === rollback);
});
