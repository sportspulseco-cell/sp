import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";

export const DELIVERY_RANK: Record<string, number> = { accepted: 0, delayed: 1, delivered: 2, suppressed: 3, failed: 3, bounced: 4, complained: 5 };
const STATES: Record<string, string> = { "email.sent": "accepted", "email.delivery_delayed": "delayed", "email.delivered": "delivered",
  "email.suppressed": "suppressed", "email.failed": "failed", "email.bounced": "bounced", "email.complained": "complained" };
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function deliveryReceipt(input: unknown, environment: string) {
  if (!input || typeof input !== "object") throw new Error("Invalid delivery event");
  const event = input as { type?: string; created_at?: string; data?: { email_id?: string; tags?: Record<string, string> } };
  const status = event.type ? STATES[event.type] : undefined;
  if (!status || event.data?.tags?.sportspulse_environment !== environment) return null;
  const notificationId = event.data.tags.sportspulse_notification_id, providerId = event.data.email_id;
  if (!notificationId || !UUID.test(notificationId) || !providerId || !UUID.test(providerId) ||
    typeof event.created_at !== "string" || !Number.isFinite(Date.parse(event.created_at))) throw new Error("Invalid delivery event identity");
  return { notificationId, providerId, status, type: event.type!, occurredAt: new Date(event.created_at).toISOString() };
}

@Injectable()
export class DeliveryReceiptsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}
  async record(eventId: string, receipt: NonNullable<ReturnType<typeof deliveryReceipt>>) {
    return this.db.transaction(async tx => {
      // Lock the known outbox row. A callback may arrive before the send
      // acknowledgment; its signed tags bind it without keeping email PII.
      const [row] = await tx.execute(sql`SELECT id,provider_message_id,delivery_status,delivery_updated_at FROM notifications
        WHERE id=${receipt.notificationId}::uuid AND channel='email' FOR UPDATE`);
      if (!row || (row.provider_message_id && row.provider_message_id !== receipt.providerId)) return { ignored: true };
      const inserted = await tx.execute(sql`INSERT INTO notification_delivery_receipts
        (event_id,notification_id,provider_message_id,event_type,delivery_status,occurred_at)
        VALUES (${eventId},${receipt.notificationId}::uuid,${receipt.providerId},${receipt.type},${receipt.status},${receipt.occurredAt}::timestamptz)
        ON CONFLICT DO NOTHING RETURNING event_id`);
      if (!inserted.length) return { replayed: true };
      const currentRank = DELIVERY_RANK[String(row.delivery_status)] ?? -1;
      const nextRank = DELIVERY_RANK[receipt.status]!;
      if (nextRank > currentRank || (nextRank === currentRank && Date.parse(receipt.occurredAt) >= new Date(row.delivery_updated_at as string).getTime())) {
        await tx.execute(sql`UPDATE notifications SET provider_message_id=${receipt.providerId},delivery_status=${receipt.status},
          delivery_updated_at=${receipt.occurredAt}::timestamptz WHERE id=${receipt.notificationId}::uuid`);
      }
      return { recorded: true };
    });
  }
}
