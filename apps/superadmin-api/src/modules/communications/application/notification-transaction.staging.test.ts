import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { createDb, type Database } from "@sportspulse/db";
import { NotificationService } from "./notification.service";

test("transactional notification recipient and email-template reads stay on the held connection", {
  skip: process.env.PPHL_STAGING_DB_TEST !== "1", timeout: 30_000,
}, async () => {
  process.loadEnvFile(".env.local"); const ref = process.env.STAGING_SUPABASE_REF;
  assert.ok(ref && ref !== "nmiiqyfwvbcvtwumtwil");
  const { ids } = JSON.parse(readFileSync("test-results-season/latest.json", "utf8"));
  const personId = ids.players["Team Alpha"].find((p: { rostered: boolean }) => p.rostered).personId;
  const db = createDb({ url: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`, max: 1, idleTimeout: 1 });
  const rollback = new Error("notification fixture rolled back"), key = `qa-notice-tx-${randomUUID()}`;
  await assert.rejects(db.transaction(async tx => {
    let outsideAccess = false;
    const poison = new Proxy({}, { get() { outsideAccess = true; throw new Error("Unexpected pool access outside held transaction"); } });
    const service = new NotificationService(poison as never, poison as never, poison as never, poison as never, poison as Database);
    const result = await service.queue({ templateCode: "registration.approved", channel: "email", idempotencyKey: key,
      orgId: ids.orgId, recipientPersonId: personId, payload: { seasonId: ids.seasonId, playerName: "QA player" } }, tx);
    assert.ok(result?.id); assert.equal(result.status, "queued"); assert.ok(result.recipientEmail);
    assert.equal(outsideAccess, false);
    throw rollback;
  }), error => error === rollback);
  assert.equal((await db.execute(sql`select id from notifications where idempotency_key=${key}`)).length, 0);
});
