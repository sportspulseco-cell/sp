import type { Page, PageQuery } from "@sportspulse/kernel";

export type NotificationStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "suppressed";

export type NotificationChannel = "email" | "sms" | "in_app" | "push";

export interface NotificationRow {
  id: string;
  orgId: string | null;
  idempotencyKey: string;
  templateCode: string;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  recipientPersonId: string | null;
  recipientEmail: string | null;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  attemptCount: number;
  lastError: string | null;
  sentAt: Date | null;
  /** When the recipient marked it read in their app. NULL = unread. */
  readAt: Date | null;
  sourceEvent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueueNotificationInput {
  orgId?: string | null;
  idempotencyKey: string;
  templateCode: string;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  recipientPersonId?: string | null;
  recipientEmail?: string | null;
  payload?: Record<string, unknown>;
  sourceEvent?: string | null;
}

export interface ListNotificationsQuery extends PageQuery {
  orgId?: string;
  status?: NotificationStatus;
  recipientPersonId?: string;
  templateCode?: string;
  channel?: NotificationChannel;
}

export interface NotificationRepository {
  /** Idempotent — returns existing row if idempotencyKey already used. */
  enqueue(input: QueueNotificationInput): Promise<NotificationRow>;
  list(q: ListNotificationsQuery): Promise<Page<NotificationRow>>;
  findById(id: string): Promise<NotificationRow | null>;
  findByIdempotencyKey(key: string): Promise<NotificationRow | null>;
  markStatus(
    id: string,
    status: NotificationStatus,
    fields?: { lastError?: string | null; sentAt?: Date | null }
  ): Promise<NotificationRow>;
  incrementAttempt(id: string): Promise<void>;
  recentForPerson(personId: string, limit?: number): Promise<NotificationRow[]>;
  /** Mark a single notification as read for the given person. */
  markRead(id: string, personId: string): Promise<NotificationRow | null>;
  /** Bulk-mark every unread notification for the person as read. */
  markAllReadForPerson(personId: string): Promise<{ updated: number }>;
}

export const NOTIFICATION_REPOSITORY = Symbol("NOTIFICATION_REPOSITORY");
