import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gt, inArray, isNull, not, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import type {
  ListNotificationsQuery,
  NotificationChannel,
  NotificationRepository,
  NotificationRow,
  NotificationStatus,
  QueueNotificationInput
} from "../../domain/repositories/notification.repository";
import { afterCursor, encodeCursor, keysetOrder } from "../../../../shared/pagination/keyset";

@Injectable()
export class DrizzleNotificationRepository
  implements NotificationRepository
{
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async enqueue(input: QueueNotificationInput): Promise<NotificationRow> {
    // Idempotent insert — onConflictDoNothing on idempotency_key, then read back.
    await this.db
      .insert(schema.notifications)
      .values({
        orgId: input.orgId ?? null,
        idempotencyKey: input.idempotencyKey,
        templateCode: input.templateCode,
        channel: input.channel,
        subject: input.subject ?? null,
        body: input.body,
        recipientPersonId: input.recipientPersonId ?? null,
        recipientEmail: input.recipientEmail ?? null,
        payload: input.payload ?? {},
        sourceEvent: input.sourceEvent ?? null,
        status: "queued"
      })
      .onConflictDoNothing({ target: schema.notifications.idempotencyKey });

    const found = await this.findByIdempotencyKey(input.idempotencyKey);
    if (!found) throw new Error("notification enqueue failed");
    return found;
  }

  async list(q: ListNotificationsQuery): Promise<Page<NotificationRow>> {
    const cs = [];
    if (q.orgId) cs.push(eq(schema.notifications.orgId, q.orgId));
    if (q.status) cs.push(eq(schema.notifications.status, q.status));
    if (q.recipientPersonId)
      cs.push(eq(schema.notifications.recipientPersonId, q.recipientPersonId));
    if (q.templateCode)
      cs.push(eq(schema.notifications.templateCode, q.templateCode));
    if (q.excludeTemplateCodes?.length)
      cs.push(not(inArray(schema.notifications.templateCode, q.excludeTemplateCodes)));
    if (q.channel) cs.push(eq(schema.notifications.channel, q.channel));
    if (q.inbox) cs.push(notInboxDuplicate());
    if (q.cursor)
      cs.push(afterCursor(schema.notifications.createdAt, schema.notifications.id, q.cursor, "desc"));

    const rows = await this.db
      .select()
      .from(schema.notifications)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(...keysetOrder(schema.notifications.createdAt, schema.notifications.id, "desc"))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toRow(r)
    );
    const last = rows[q.limit - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
    return { items, nextCursor };
  }

  async findById(id: string): Promise<NotificationRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, id));
    return row ? this.toRow(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<NotificationRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.idempotencyKey, key));
    return row ? this.toRow(row) : null;
  }

  async markStatus(
    id: string,
    status: NotificationStatus,
    fields?: { lastError?: string | null; sentAt?: Date | null }
  ): Promise<NotificationRow> {
    const [row] = await this.db
      .update(schema.notifications)
      .set({
        status,
        lastError: fields?.lastError ?? null,
        sentAt: fields?.sentAt ?? null,
        updatedAt: sql`NOW()`
      })
      .where(eq(schema.notifications.id, id))
      .returning();
    if (!row) throw new Error("notification not found");
    return this.toRow(row);
  }

  async incrementAttempt(id: string): Promise<void> {
    await this.db
      .update(schema.notifications)
      .set({
        attemptCount: sql`${schema.notifications.attemptCount} + 1`,
        updatedAt: sql`NOW()`
      })
      .where(eq(schema.notifications.id, id));
  }

  async recentForPerson(
    personId: string,
    limit = 20
  ): Promise<NotificationRow[]> {
    const rows = await this.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.recipientPersonId, personId))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit);
    return rows.map((r) => this.toRow(r));
  }

  async markRead(id: string, personId: string): Promise<NotificationRow | null> {
    // Idempotent — only sets read_at if recipient matches AND it's not
    // already read. Returns null when the notification doesn't exist
    // or doesn't belong to this person (caller decides whether to 404).
    const [row] = await this.db
      .update(schema.notifications)
      .set({ readAt: sql`COALESCE(read_at, NOW())`, updatedAt: sql`NOW()` })
      .where(
        and(
          eq(schema.notifications.id, id),
          eq(schema.notifications.recipientPersonId, personId)
        )
      )
      .returning();
    return row ? this.toRow(row) : null;
  }

  async markAllReadForPerson(
    personId: string
  ): Promise<{ updated: number }> {
    const rows = await this.db
      .update(schema.notifications)
      .set({ readAt: sql`NOW()`, updatedAt: sql`NOW()` })
      .where(
        and(
          eq(schema.notifications.recipientPersonId, personId),
          isNull(schema.notifications.readAt)
        )
      )
      .returning({ id: schema.notifications.id });
    return { updated: rows.length };
  }

  private toRow(r: typeof schema.notifications.$inferSelect): NotificationRow {
    return {
      id: r.id,
      orgId: r.orgId,
      idempotencyKey: r.idempotencyKey,
      templateCode: r.templateCode,
      channel: r.channel as NotificationChannel,
      subject: r.subject,
      body: r.body,
      recipientPersonId: r.recipientPersonId,
      recipientEmail: r.recipientEmail,
      payload: (r.payload ?? {}) as Record<string, unknown>,
      status: r.status as NotificationStatus,
      attemptCount: r.attemptCount,
      lastError: r.lastError,
      sentAt: r.sentAt,
      readAt: r.readAt,
      sourceEvent: r.sourceEvent,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  }
}

/**
 * One message, one inbox row (FR-3.17.2). A message sent on several
 * channels is stored once per channel, keyed `...-<channel>` (broadcasts,
 * the overdue sweep). The inbox keeps the in-app row and drops its email,
 * SMS and push copies; a message sent by email only still shows.
 */
export function notInboxDuplicate() {
  return sql`NOT (
    ${schema.notifications.channel} <> 'in_app'
    AND ${schema.notifications.idempotencyKey} ~ '-(email|sms|push)$'
    AND EXISTS (
      SELECT 1 FROM notifications twin
       WHERE twin.recipient_person_id = ${schema.notifications.recipientPersonId}
         AND twin.channel = 'in_app'
         AND twin.idempotency_key = regexp_replace(${schema.notifications.idempotencyKey}, '-(email|sms|push)$', '-in_app')
    )
  )`;
}
