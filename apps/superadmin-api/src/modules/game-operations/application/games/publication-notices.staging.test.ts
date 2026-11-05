import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { createDb, schema, type Database } from "@sportspulse/db";
import { PublishGameHandler } from "./handlers";
import { rowToGame } from "../../infrastructure/repositories/drizzle-game.repository";

test("publication and durable notices roll back together and replay without duplicate notices", {
  skip: process.env.PPHL_STAGING_DB_TEST !== "1",
}, async () => {
  process.loadEnvFile(".env.local");
  const ref = process.env.STAGING_SUPABASE_REF;
  assert.ok(ref && ref !== "nmiiqyfwvbcvtwumtwil");
  const db = createDb({ url: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`, max: 1, idleTimeout: 1 });
  const rollback = new Error("publication notice fixtures rolled back");
  await assert.rejects(db.transaction(async tx => {
    const id = randomUUID();
    await tx.execute(sql`insert into games select (jsonb_populate_record(null::games,to_jsonb(g) || jsonb_build_object(
      'id',${id}::text,'slot_id',null,'surface_id',null,'schedule_run_id',null,'source','manual',
      'locked_at',null,'published_at',null,'finalized_at',null,'status','scheduled',
      'scheduled_start_ts_utc','2097-01-01T20:00:00Z','duration_min',60
    ))).* from games g join leagues l on l.id=g.league_id
      where l.org_id=${process.env.STAGING_ORG_ENTITY_ID}::uuid and exists(
        select 1 from team_memberships m where m.team_id in(g.home_team_id,g.away_team_id)
          and m.season_id=g.season_id and m.current_status='active') limit 1`);
    assert.equal((await tx.execute(sql`select id from games where id=${id}::uuid`)).length, 1, "Rostered game required");
    let fail = true;
    const notify = { queue: async (args: { idempotencyKey: string; recipientPersonId: string; templateCode: string }, noticeTx: typeof tx) => {
      assert.ok(noticeTx, "A durable notice must use the publication transaction");
      const [row] = await noticeTx.insert(schema.notifications).values({
        idempotencyKey: args.idempotencyKey, recipientPersonId: args.recipientPersonId,
        templateCode: args.templateCode, channel: "in_app", body: "QA publication notice", payload: { gameId: id },
      }).onConflictDoNothing().returning();
      if (fail) throw new Error("injected notification failure");
      return row;
    } };
    const repo = { findById: async () => {
      const [row] = await tx.select().from(schema.games).where(eq(schema.games.id, id));
      return row ? rowToGame(row) : null;
    } };
    const handler = new PublishGameHandler(repo as never, tx as unknown as Database, notify as never);
    await assert.rejects(handler.execute({ id }), /injected notification failure/);
    const [unpublished] = await tx.select().from(schema.games).where(eq(schema.games.id, id));
    assert.equal(unpublished?.publishedAt, null);
    assert.equal((await tx.execute(sql`select id from notifications where payload->>'gameId'=${id}`)).length, 0);
    fail = false;
    const accepted = await handler.execute({ id });
    assert.ok(accepted.notificationsQueued > 0);
    const replay = await handler.execute({ id });
    assert.equal(replay.notificationsQueued, 0);
    const [count] = await tx.execute(sql`select count(*)::int n from notifications where payload->>'gameId'=${id}`);
    assert.equal(count?.n, accepted.notificationsQueued);
    throw rollback;
  }), e => e === rollback);
});
