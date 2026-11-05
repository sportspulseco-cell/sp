import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { createDb, schema, type Database } from "@sportspulse/db";
import { CancelGameHandler, PostponeGameHandler, RescheduleGameHandler, FinalizeGameHandler } from "./handlers";
import { rowToGame } from "../../infrastructure/repositories/drizzle-game.repository";
import { notifyAutomaticSuspensions } from "../suspensions/auto-notices";

test("reschedule, postpone, cancel and finalization commit with notices or roll back together", {
  skip: process.env.PPHL_STAGING_DB_TEST !== "1", timeout: 120_000,
}, async () => {
  process.loadEnvFile(".env.local"); const ref = process.env.STAGING_SUPABASE_REF;
  assert.ok(ref && ref !== "nmiiqyfwvbcvtwumtwil");
  const { ids } = JSON.parse(readFileSync("test-results-season/latest.json", "utf8"));
  const db = createDb({ url: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`, max: 1, idleTimeout: 1 });
  const rollback = new Error("transition notice fixtures rolled back");
  await assert.rejects(db.transaction(async tx => {
    for (const [index, kind] of ["reschedule", "postpone", "cancel", "finalize"].entries()) {
      const id = randomUUID(), initialStatus = kind === "finalize" ? "in_play" : "scheduled";
      const initialTime = `2097-01-${String(index + 1).padStart(2, "0")}T20:00:00Z`;
      await tx.execute(sql`insert into games select (jsonb_populate_record(null::games,to_jsonb(g)||jsonb_build_object(
        'id',${id}::text,'slot_id',null,'surface_id',null,'schedule_run_id',null,'source','manual',
        'locked_at',null,'published_at',now(),'finalized_at',null,'status',${initialStatus}::text,
        'home_score',0,'away_score',0,'metadata','{}'::jsonb,'scheduled_start_ts_utc',${initialTime}::text,'tz','UTC','duration_min',60
      ))).* from games g where season_id=${ids.seasonId}::uuid limit 1`);
      let fail = true;
      const notify = { queue: async (args: { idempotencyKey: string; recipientPersonId: string; templateCode: string }, noticeTx: typeof tx) => {
        assert.ok(noticeTx, "No game notice may dispatch outside the transaction");
        const [row] = await noticeTx.insert(schema.notifications).values({ idempotencyKey: args.idempotencyKey,
          recipientPersonId: args.recipientPersonId, templateCode: args.templateCode, channel: "in_app",
          body: "QA transactional notice", payload: { gameId: id } }).onConflictDoNothing().returning();
        if (fail) throw new Error("injected transition notification failure");
        return row;
      } };
      const repo = { findById: async () => { const [row] = await tx.select().from(schema.games).where(eq(schema.games.id, id)); return row ? rowToGame(row) : null; } };
      const database = tx as unknown as Database, actor = process.env.STAGING_SUPERADMIN_ID!;
      const execute = () => kind === "reschedule" ? new RescheduleGameHandler(repo as never, database, notify as never).execute({ id, userId: actor, startLocal: "2097-01-06T21:00" }) :
        kind === "postpone" ? new PostponeGameHandler(repo as never, database, notify as never).execute({ id }) :
        kind === "cancel" ? new CancelGameHandler(repo as never, database, notify as never).execute({ id }) :
        new FinalizeGameHandler(repo as never, database, notify as never).execute({ id, userId: actor, endedIn: "regulation" });
      await assert.rejects(execute(), /injected transition notification failure/);
      const [unchanged] = await tx.select().from(schema.games).where(eq(schema.games.id, id));
      assert.equal(unchanged!.status, initialStatus); assert.equal(unchanged!.scheduledStartTsUtc.toISOString(), new Date(initialTime).toISOString());
      assert.equal(unchanged!.finalizedAt, null);
      assert.equal((await tx.execute(sql`select id from notifications where payload->>'gameId'=${id}`)).length, 0);
      fail = false; await execute();
      const [after] = await tx.select().from(schema.games).where(eq(schema.games.id, id));
      assert.equal(after!.status, kind === "reschedule" ? "scheduled" : kind === "postpone" ? "postponed" : kind === "cancel" ? "cancelled" : "completed");
      const beforeReplay = (await tx.execute(sql`select id from notifications where payload->>'gameId'=${id}`)).length;
      assert.ok(beforeReplay > 0);
      await assert.rejects(execute());
      assert.equal((await tx.execute(sql`select id from notifications where payload->>'gameId'=${id}`)).length, beforeReplay);
    }
    const suspensionId = randomUUID();
    let failAdmin = true;
    const disciplineNotify = { queue: async (args: { idempotencyKey: string; recipientPersonId: string; templateCode: string }, noticeTx: typeof tx) => {
      assert.ok(noticeTx, "Discipline audience notices must share finalization's transaction");
      const [row] = await noticeTx.insert(schema.notifications).values({ idempotencyKey: args.idempotencyKey,
        recipientPersonId: args.recipientPersonId, templateCode: args.templateCode, channel: "in_app",
        body: "QA discipline notice", payload: { suspensionId } }).onConflictDoNothing().returning();
      if (failAdmin && args.templateCode === "suspension.issued.admin") throw new Error("injected admin audience failure");
      return row;
    } };
    const issued = [{ id: suspensionId, personId: ids.players["Team Alpha"].find((p: { rostered: boolean }) => p.rostered).personId,
      teamId: ids.teams["Team Alpha"].id, kind: "n_games" as const, nGames: 1, reason: "QA transactional notice rehearsal" }];
    const scope = { orgId: ids.orgId, leagueId: ids.leagueId, seasonId: ids.seasonId };
    await assert.rejects(tx.transaction(nested => notifyAutomaticSuspensions(nested as unknown as Database, disciplineNotify as never, issued, scope, nested)), /injected admin audience failure/);
    assert.equal((await tx.execute(sql`select id from notifications where payload->>'suspensionId'=${suspensionId}`)).length, 0);
    failAdmin = false;
    assert.ok(await notifyAutomaticSuspensions(tx as unknown as Database, disciplineNotify as never, issued, scope, tx) >= 3);
    throw rollback;
  }), error => error === rollback);
});
