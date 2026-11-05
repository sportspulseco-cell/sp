import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb, schema, type Database } from "@sportspulse/db";
import { AddPlayerHandler, TradePlayerHandler } from "./handlers";
import type { RosterUnitOfWork } from "./roster-unit-of-work";
import { DrizzleRosterUnitOfWork } from "../../infrastructure/repositories/drizzle-roster-unit-of-work";

test("roster history and membership are atomic; a failed trade preserves the original roster", {
  skip: process.env.PPHL_STAGING_DB_TEST !== "1",
}, async () => {
  process.loadEnvFile(".env.local");
  const ref = process.env.STAGING_SUPABASE_REF;
  assert.ok(ref && ref !== "nmiiqyfwvbcvtwumtwil");
  const db = createDb({ url: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`, max: 1, idleTimeout: 1 });
  const rollback = new Error("roster atomicity fixtures rolled back");
  await assert.rejects(db.transaction(async tx => {
    const [game] = await tx.execute(sql`select g.home_team_id,g.away_team_id,g.season_id from games g join leagues l on l.id=g.league_id where l.org_id=${process.env.STAGING_ORG_ENTITY_ID}::uuid and g.season_id is not null limit 1`);
    assert.ok(game);
    const personId = randomUUID();
    await tx.insert(schema.persons).values({ id: personId, legalFirstName: "Casey", legalLastName: "Reed" });
    const uow = new DrizzleRosterUnitOfWork(tx as unknown as Database);
    const failedUow: RosterUnitOfWork = { run: (subject, work) => uow.run(subject, repositories => work({
      ...repositories, memberships: new Proxy(repositories.memberships, { get(target, property) {
        if (property === "open") return async () => { throw new Error("injected projection failure"); };
        const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
      } }),
    })) };
    const input = { personId, teamId: String(game.home_team_id), seasonId: String(game.season_id), sourceEventId: randomUUID() };
    await assert.rejects(new AddPlayerHandler(failedUow).execute(input), /injected projection failure/);
    assert.equal((await tx.execute(sql`select id from roster_moves where person_id=${personId}::uuid`)).length, 0);
    assert.equal((await tx.execute(sql`select id from team_memberships where person_id=${personId}::uuid`)).length, 0);
    const add = new AddPlayerHandler(uow);
    const saved = await add.execute(input); assert.equal((await add.execute(input)).id, saved.id);
    await assert.rejects(add.execute({ ...input, personId: randomUUID() }), /different roster move/);
    await add.execute({ ...input, teamId: String(game.away_team_id), sourceEventId: randomUUID() });
    await assert.rejects(new TradePlayerHandler(uow).execute({ personId, seasonId: input.seasonId,
      fromTeamId: input.teamId, toTeamId: String(game.away_team_id), sourceEventId: randomUUID() }), /already has an active membership/);
    const memberships = await tx.execute(sql`select team_id,current_status,effective_to from team_memberships where person_id=${personId}::uuid`);
    assert.equal(memberships.length, 2); assert.ok(memberships.every(m => m.current_status === "active" && m.effective_to === null));
    assert.equal((await tx.execute(sql`select id from roster_moves where person_id=${personId}::uuid`)).length, 2);
    throw rollback;
  }), e => e === rollback);
});
