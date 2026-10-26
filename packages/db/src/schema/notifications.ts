import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  jsonb,
  boolean,
  timestamp,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { orgs, persons } from "./iam";
import { authUsers } from "./auth";

// =====================================================================
// NOTIFICATION_TEMPLATES — versioned, addressable by stable code
// One row per (orgId, code, locale, channel). orgId NULL = platform default.
// =====================================================================
export const notificationTemplates = pgTable(
  "notification_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }),
    /** Stable identifier — `registration.approved`, `game.scheduled`, etc. */
    code: text("code").notNull(),
    channel: text("channel").notNull(), // email | sms | in_app
    locale: text("locale").notNull().default("en"),
    subject: text("subject"),
    bodyTemplate: text("body_template").notNull(),
    /** Variables the template expects — used for validation + UI hints. */
    variables: jsonb("variables").notNull().default(sql`'[]'::jsonb`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    uniq: uniqueIndex("notif_template_uniq").on(
      t.orgId,
      t.code,
      t.channel,
      t.locale
    ),
    codeIdx: index("notif_template_code_idx").on(t.code)
  })
);

// =====================================================================
// NOTIFICATIONS — outbox. One row per recipient × send.
// Idempotent on `idempotency_key` — handlers that produce the same
// (event, recipient, version) tuple will not duplicate sends.
// =====================================================================
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "set null" }),
    /** Application-defined key — e.g. `reg-approved:<registration_id>:email` */
    idempotencyKey: text("idempotency_key").notNull(),
    templateCode: text("template_code").notNull(),
    channel: text("channel").notNull(),
    /** Final rendered fields. Stored so re-rendering is unnecessary on retry. */
    subject: text("subject"),
    body: text("body").notNull(),
    /** Person addressed (optional — for raw email-only sends). */
    recipientPersonId: uuid("recipient_person_id").references(
      () => persons.id,
      { onDelete: "set null" }
    ),
    recipientEmail: text("recipient_email"),
    /** Original payload used to render — kept for audit + debugging. */
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    /** queued | sending | sent | failed | suppressed */
    status: text("status").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /**
     * When the recipient (player / captain / admin) marked this read in
     * their app. NULL = unread. Used by the in-app notification list to
     * render the unread blue dot + the topbar's bell badge count.
     */
    readAt: timestamp("read_at", { withTimezone: true }),
    /** Cause / source — `registration.approved`, `manual`, etc. */
    sourceEvent: text("source_event"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    idempotencyUniq: uniqueIndex("notif_idem_uniq").on(t.idempotencyKey),
    statusCreatedIdx: index("notif_status_created_idx").on(
      t.status,
      t.createdAt
    ),
    recipientIdx: index("notif_recipient_idx").on(t.recipientPersonId),
    orgStatusIdx: index("notif_org_status_idx").on(t.orgId, t.status)
  })
);

// =====================================================================
// NOTIFICATION_PREFERENCES — per-recipient opt-out grid
// One row per (user, templateCode, channel). Absent row = opted in
// (default-on). enabled=false means suppress this notification class
// for this recipient. Plan P4-2 / audit §7 follow-on.
// =====================================================================
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    /** Catalog code: `registration.approved`, `invoice.overdue.r1`, etc. */
    templateCode: text("template_code").notNull(),
    /** email | in_app | sms */
    channel: text("channel").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    uniq: uniqueIndex("notif_prefs_user_template_channel_uniq").on(
      t.userId,
      t.templateCode,
      t.channel
    ),
    userIdx: index("notif_prefs_user_idx").on(t.userId),
    channelCheck: check(
      "notif_prefs_channel_check",
      sql`${t.channel} IN ('email','in_app','sms','push')`
    )
  })
);

// =====================================================================
// NOTIFICATION_DELIVERY_LOGS — append-only attempt log
// =====================================================================
export const notificationDeliveryLogs = pgTable(
  "notification_delivery_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("console"),
    providerMessageId: text("provider_message_id"),
    status: text("status").notNull(), // sent | failed | bounced | suppressed
    statusCode: integer("status_code"),
    response: jsonb("response").notNull().default(sql`'{}'::jsonb`),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    notifIdx: index("notif_dlog_notif_idx").on(t.notificationId),
    attemptedIdx: index("notif_dlog_attempted_idx").on(t.attemptedAt)
  })
);

// =====================================================================
// PUSH_SUBSCRIPTIONS — per-user device / web-push tokens. Backlog #16.
// One row per (userId, endpoint). Endpoint is the unique key — keeps
// the same row alive when a browser refreshes its keys.
// =====================================================================
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    /** web | ios | android. Web-push first, native later. */
    platform: text("platform").notNull().default("web"),
    /** web-push endpoint URL OR an FCM/APNs device token. */
    endpoint: text("endpoint").notNull(),
    /** web-push only: subscription keys for VAPID encryption. */
    p256dhKey: text("p256dh_key"),
    authKey: text("auth_key"),
    userAgent: text("user_agent"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Soft-disable when the provider returns 410-gone. */
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    endpointUniq: uniqueIndex("push_subscriptions_endpoint_uniq").on(
      t.endpoint
    ),
    userIdx: index("push_subscriptions_user_idx").on(t.userId, t.isActive),
    platformCheck: check(
      "push_subscriptions_platform_check",
      sql`${t.platform} IN ('web','ios','android')`
    )
  })
);

// =====================================================================
// SCHEDULED_BROADCASTS — UC-19 "schedule for later". The composed
// announcement waits here until `send_at`; the cron job
// (/org-admin/broadcast/cron/due, pg_cron migration 0087) claims due rows
// (scheduled -> sending), re-checks the sender's reach, resolves the
// audience at send time and queues one notification per person per
// channel, idempotent on `broadcast-<idempotency_key>-...`. Cancellable
// while still `scheduled`. Migration 0086.
// =====================================================================
export const scheduledBroadcasts = pgTable(
  "scheduled_broadcasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    /** The composer's key: also the broadcast id once sent. */
    idempotencyKey: uuid("idempotency_key").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    sendAt: timestamp("send_at", { withTimezone: true }).notNull(),
    /** scheduled | sending | sent | cancelled | failed */
    status: text("status").notNull().default("scheduled"),
    /** { audiences, targetType, targetId, subject, body, channels, attachmentIds } */
    request: jsonb("request").notNull(),
    /** sendAnnouncement result once sent. */
    result: jsonb("result"),
    lastError: text("last_error"),
    attemptCount: integer("attempt_count").notNull().default(0),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledByUserId: uuid("cancelled_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    keyUniq: uniqueIndex("sched_bc_key_uniq").on(t.idempotencyKey),
    dueIdx: index("sched_bc_due_idx").on(t.status, t.sendAt),
    orgIdx: index("sched_bc_org_idx").on(t.orgId, t.sendAt),
    statusCheck: check(
      "sched_bc_status_check",
      sql`${t.status} IN ('scheduled','sending','sent','cancelled','failed')`
    )
  })
);

// =====================================================================
// BROADCAST_ATTACHMENTS — UC-19 files attached to an announcement. The
// file is in the PRIVATE `broadcast-attachments` storage bucket; email and
// in-app bodies link to an API URL signed per recipient, which checks the
// signature and redirects to a 5-minute storage signed URL. `broadcast_key`
// ties the file to the composed announcement once it is sent or
// scheduled; files never attached are removed by their uploader.
// Migration 0086.
// =====================================================================
export const broadcastAttachments = pgTable(
  "broadcast_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    broadcastKey: uuid("broadcast_key"),
    storageBucket: text("storage_bucket").notNull().default("broadcast-attachments"),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    pathUniq: uniqueIndex("bc_att_path_uniq").on(t.storagePath),
    keyIdx: index("bc_att_key_idx").on(t.broadcastKey),
    orgIdx: index("bc_att_org_idx").on(t.orgId),
    contentTypeCheck: check(
      "bc_att_content_type_check",
      sql`${t.contentType} IN ('application/pdf','image/png','image/jpeg','image/webp')`
    ),
    sizeCheck: check("bc_att_size_check", sql`${t.sizeBytes} > 0 AND ${t.sizeBytes} <= 3145728`),
    shaCheck: check("bc_att_sha256_check", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    fileNameCheck: check(
      "bc_att_file_name_check",
      sql`char_length(${t.fileName}) BETWEEN 1 AND 200`
    )
  })
);
