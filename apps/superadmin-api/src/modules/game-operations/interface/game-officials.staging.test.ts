import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb, type Database } from "@sportspulse/db";
import { GameOfficialsController } from "./game-officials.controller";
import type { UserScope } from "../../../shared/auth/scope";

test("officials can reply only to their own live invitation and manage only their availability", {
  skip: process.env.PPHL_STAGING_DB_TEST !== "1",
}, async () => {
  process.loadEnvFile(".env.local");
  const ref = process.env.STAGING_SUPABASE_REF;
  assert.ok(ref && ref !== "nmiiqyfwvbcvtwumtwil");
  const db = createDb({ url: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`, max: 1, idleTimeout: 1 });
  const rollback = new Error("official fixtures rolled back");
  await assert.rejects(db.transaction(async tx => {
    const actor = { userId: process.env.STAGING_PLAYER_ID! } as never;
    const [person] = await tx.execute(sql`select id from persons where user_id=${process.env.STAGING_PLAYER_ID}::uuid and deleted_at is null limit 1`);
    assert.ok(person);
    const gameId = randomUUID(), assignmentId = randomUUID();
    await tx.execute(sql`insert into games select (jsonb_populate_record(null::games,to_jsonb(g) || jsonb_build_object(
      'id',${gameId}::text,'slot_id',null,'surface_id',null,'schedule_run_id',null,'source','manual',
      'locked_at',null,'published_at',null,'finalized_at',null,'status','scheduled','scheduled_start_ts_utc','2096-01-01T20:00:00Z'
    ))).* from games g join leagues l on l.id=g.league_id where l.org_id=${process.env.STAGING_ORG_ENTITY_ID}::uuid limit 1`);
    await tx.execute(sql`insert into game_officials(id,game_id,person_id,role,status) values(${assignmentId}::uuid,${gameId}::uuid,${person.id}::uuid,'referee','tentative')`);
    const controller = new GameOfficialsController(...[null, null, null, null, null, { queue: async () => null }, tx as unknown as Database] as ConstructorParameters<typeof GameOfficialsController>);
    const scope: UserScope = { isSuperAdmin: false, orgIds: [], leagueIds: [], teamIds: [], orgWideOrgIds: [] };
    await assert.rejects(controller.status(assignmentId, { status: "confirmed" }, { userId: randomUUID() } as never, scope), /access|permission|not found|allowed/i);
    assert.equal((await controller.status(assignmentId, { status: "confirmed" }, actor, scope)).status, "confirmed");
    assert.equal((await controller.status(assignmentId, { status: "declined" }, actor, scope)).status, "declined");
    await assert.rejects(controller.status(assignmentId, { status: "tentative" }, actor, scope), /Confirm or decline/);
    await tx.execute(sql`update games set status='in_play' where id=${gameId}::uuid`);
    await assert.rejects(controller.status(assignmentId, { status: "confirmed" }, actor, scope), /before the game starts/);
    await tx.execute(sql`update game_officials set revoked_at=now() where id=${assignmentId}::uuid`);
    await assert.rejects(controller.status(assignmentId, { status: "confirmed" }, actor, scope), /not found/);
    const periods = [{ startTsUtc: "2096-01-01T00:00:00.000Z", endTsUtc: "2096-01-02T00:00:00.000Z" }];
    await controller.saveAvailability({ periods }, actor);
    assert.deepEqual((await controller.availability(actor)).periods, periods);
    await assert.rejects(controller.saveAvailability({ periods: [{ startTsUtc: periods[0]!.endTsUtc, endTsUtc: periods[0]!.startTsUtc }] }, actor), /end after start/);
    throw rollback;
  }), e => e === rollback);
});
