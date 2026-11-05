import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createDb, schema, type Database } from "@sportspulse/db";
import { ConfigService } from "@nestjs/config";
import { eq, inArray, sql } from "drizzle-orm";
import { NotificationService } from "./notification.service";
import { DrizzleNotificationRepository } from "../infrastructure/repositories/drizzle-notification.repository";
import { DeliveryReceiptsService } from "./delivery-receipts";
import { DeliveryWebhookController } from "../interface/delivery-webhook.controller";
import type { EmailDispatcherService } from "../../../shared/notifications/email-dispatcher.service";

test("delivery workers claim once, recover leases, fence old workers and authenticate out-of-order receipts", {
  skip: process.env.PPHL_STAGING_DB_TEST !== "1", timeout: 120_000,
}, async () => {
  process.loadEnvFile(".env.local"); const ref = process.env.STAGING_SUPABASE_REF;
  assert.ok(ref && ref !== "nmiiqyfwvbcvtwumtwil");
  const db = createDb({ url: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`, max: 3, idleTimeout: 1 });
  const repo = new DrizzleNotificationRepository(db), ids: string[] = [];
  const secret = `whsec_${Buffer.from(randomUUID()).toString("base64")}`;
  const webhook = new DeliveryWebhookController(new ConfigService({ RESEND_WEBHOOK_SECRET: secret, NOTIFICATION_ENVIRONMENT: "staging" }), new DeliveryReceiptsService(db));
  const emit = async (notificationId: string, providerId: string, type: string, eventId = `msg_${randomUUID()}`, environment = "staging", invalid = false) => {
    const rawBody = Buffer.from(JSON.stringify({ type, created_at: new Date().toISOString(), data: { email_id: providerId,
      tags: { sportspulse_environment: environment, sportspulse_notification_id: notificationId } } }));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${eventId}.${timestamp}.${rawBody}`).digest("base64");
    return webhook.receive({ rawBody } as never, eventId, timestamp, `v1,${invalid ? "invalid" : signature}`);
  };
  const create = async () => {
    const row = await repo.enqueue({ idempotencyKey: `qa-delivery-${randomUUID()}`, templateCode: "org.broadcast", channel: "email",
      subject: "QA delivery", body: "Synthetic delivery fixture", recipientEmail: "nobody@example.invalid" });
    ids.push(row.id); return row;
  };
  const forbidden = new Proxy({}, { get() { throw new Error("No real SMS or push provider may be reached"); } });
  try {
    const row = await create(), providerId = randomUUID(); let sends = 0;
    const dispatcher = { send: async () => { sends++; await new Promise(resolve => setTimeout(resolve, 100));
      await emit(row.id, providerId, "email.delivered"); return { delivered: true, providerMessageId: providerId }; } };
    const first = new NotificationService(repo, dispatcher as unknown as EmailDispatcherService, forbidden as never, forbidden as never, db);
    const second = new NotificationService(new DrizzleNotificationRepository(db), dispatcher as unknown as EmailDispatcherService, forbidden as never, forbidden as never, db);
    await Promise.all([first.dispatch(row), second.dispatch(row)]);
    let saved = await repo.findById(row.id); assert.equal(sends, 1); assert.equal(saved!.attemptCount, 1); assert.equal(saved!.status, "sent");
    assert.equal(saved!.providerMessageId, providerId); assert.equal(saved!.deliveryStatus, "delivered", "An early webhook must survive the provider acknowledgment");
    await first.dispatch(row); assert.equal(sends, 1, "A stale caller cannot resend a completed row");
    const replayId = `msg_${randomUUID()}`;
    assert.deepEqual(await emit(row.id, providerId, "email.sent", replayId), { recorded: true });
    assert.deepEqual(await emit(row.id, providerId, "email.sent", replayId), { replayed: true });
    await assert.rejects(emit(row.id, providerId, "email.bounced", undefined, "staging", true), /Invalid signed/);
    assert.deepEqual(await emit(row.id, providerId, "email.bounced", undefined, "production"), { ignored: true });
    assert.equal((await repo.findById(row.id))!.deliveryStatus, "delivered");
    await emit(row.id, providerId, "email.bounced"); await emit(row.id, providerId, "email.delivered");
    assert.equal((await repo.findById(row.id))!.deliveryStatus, "bounced", "A late positive callback must not erase a bounce");
    assert.deepEqual(await emit(row.id, randomUUID(), "email.complained"), { ignored: true });

    const fenced = await create(), a = await repo.claimForDelivery(fenced.id); assert.ok(a?.deliveryClaimId);
    await db.execute(sql`update notifications set delivery_claim_expires_at=now()-interval '1 second' where id=${fenced.id}::uuid`);
    const b = await repo.claimForDelivery(fenced.id); assert.ok(b?.deliveryClaimId); assert.notEqual(a.deliveryClaimId, b.deliveryClaimId);
    assert.equal(await repo.finishDelivery(fenced.id, a.deliveryClaimId, "sent"), null);
    assert.ok(await repo.finishDelivery(fenced.id, b.deliveryClaimId, "sent", { sentAt: new Date() }));

    const transient = await create(); let retries = 0;
    const retryService = new NotificationService(repo, { send: async () => ++retries === 1 ?
      { delivered: false, providerMessageId: null, failure: "transient", reason: "QA provider unavailable" } :
      { delivered: true, providerMessageId: randomUUID() } } as unknown as EmailDispatcherService, forbidden as never, forbidden as never, db);
    await retryService.dispatch(transient); assert.equal((await repo.findById(transient.id))!.status, "failed");
    await retryService.dispatch(transient); saved = await repo.findById(transient.id); assert.equal(saved!.status, "sent"); assert.equal(saved!.attemptCount, 2);
    const permanent = await create(); let refusals = 0;
    const rejectService = new NotificationService(repo, { send: async () => { refusals++; return {
      delivered: false, providerMessageId: null, failure: "permanent", reason: "QA invalid address" }; } } as unknown as EmailDispatcherService, forbidden as never, forbidden as never, db);
    await rejectService.dispatch(permanent); await rejectService.dispatch(permanent);
    assert.equal(refusals, 1); assert.equal((await repo.findById(permanent.id))!.attemptCount, 3);
    const [future] = await db.execute(sql`select id,scheduled_start_ts_utc from games where published_at is not null
      and status='scheduled' and scheduled_start_ts_utc>now() order by scheduled_start_ts_utc limit 1`);
    assert.ok(future, "The staging rehearsal has a published upcoming game");
    let reminders = 0;
    const reminderService = new NotificationService(repo, { send: async () => { reminders++; return {
      delivered: true, providerMessageId: randomUUID() }; } } as unknown as EmailDispatcherService, forbidden as never, forbidden as never, db);
    for (const [gameId, start, expected] of [[future.id, new Date(future.scheduled_start_ts_utc as string).toISOString(), "sent"],
      [future.id, new Date(Date.now()+12345).toISOString(), "suppressed"], [randomUUID(), new Date().toISOString(), "suppressed"]] as const) {
      const reminder = await repo.enqueue({ idempotencyKey: `qa-reminder-${randomUUID()}`, sourceEvent: "game.reminder",
        templateCode: "game.reminder", channel: "email", subject: "QA reminder", body: "Synthetic fixture", recipientEmail: "nobody@example.invalid",
        payload: { gameId, scheduledStartTsUtc: start } }); ids.push(reminder.id);
      await reminderService.dispatch(reminder); assert.equal((await repo.findById(reminder.id))!.status, expected);
    }
    assert.equal(reminders, 1, "Moved or removed games never reach the transport as old reminders");
    const [privacy] = await db.execute(sql`select relrowsecurity rls,has_table_privilege('authenticated','notification_delivery_receipts','select') access
      from pg_class where oid='notification_delivery_receipts'::regclass`);
    assert.equal(privacy!.rls, true); assert.equal(privacy!.access, false);
  } finally { if (ids.length) await db.delete(schema.notifications).where(inArray(schema.notifications.id, ids)); }
});
