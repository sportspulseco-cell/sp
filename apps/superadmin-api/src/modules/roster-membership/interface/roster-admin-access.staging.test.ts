import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createDb, type Database } from "@sportspulse/db";
import { sql } from "drizzle-orm";
import { ScopedAdminGuard } from "../../../shared/auth/guards/scoped-admin.guard";
import { RosterMovesController } from "./roster-moves.controller";

test("generic roster commands reject player team scope and permit only scoped admin writes", {
  skip: process.env.PPHL_STAGING_DB_TEST !== "1",
}, async () => {
  process.loadEnvFile(".env.local");
  const ref = process.env.STAGING_SUPABASE_REF;
  assert.ok(ref && ref !== "nmiiqyfwvbcvtwumtwil");
  const db = createDb({ url: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`, max: 1, idleTimeout: 1 });
  const rollback = new Error("roster authorization fixtures rolled back");
  await assert.rejects(db.transaction(async tx => {
    const database = tx as unknown as Database;
    const guard = new ScopedAdminGuard(database, new Reflector());
    const requestFor = (userId: string) => ({ method: "POST", principal: { userId }, userScope: undefined });
    const context = (request: unknown) => ({ switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => RosterMovesController.prototype.add, getClass: () => RosterMovesController }) as unknown as ExecutionContext;
    const player = requestFor(process.env.STAGING_PLAYER_ID!);
    await assert.rejects(guard.canActivate(context(player)), /admin role/);
    const [admin] = await tx.execute(sql`select id from auth.users where email=${process.env.STAGING_ORG_EMAIL}`);
    assert.ok(admin);
    const request = requestFor(String(admin.id)); assert.equal(await guard.canActivate(context(request)), true);
    const [target] = await tx.execute(sql`select t.id team_id,d.season_id from teams t
      join division_team_entries e on e.team_id=t.id join divisions d on d.id=e.division_id
      where t.org_id=${process.env.STAGING_ORG_ENTITY_ID}::uuid and t.deleted_at is null limit 1`);
    assert.ok(target);
    let writes = 0;
    const add = { execute: async () => { writes++; return {}; } };
    const controller = new RosterMovesController(null as never, null as never, add as never,
      null as never, null as never, null as never, null as never, database);
    const body = { teamId: String(target.team_id), seasonId: String(target.season_id), personId: process.env.STAGING_PLAYER_ID! };
    await controller.add(body, { userId: String(admin.id) } as never, request.userScope!);
    assert.equal(writes, 1);
    // A valid-looking projected team scope is insufficient without actual role permissions.
    await assert.rejects(controller.add(body, { userId: process.env.STAGING_PLAYER_ID! } as never,
      { isSuperAdmin: false, teamIds: [body.teamId], orgIds: [process.env.STAGING_ORG_ENTITY_ID!], leagueIds: [], orgWideOrgIds: [] }), /permission/);
    assert.equal(writes, 1);
    throw rollback;
  }), e => e === rollback);
});
