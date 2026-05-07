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
import { orgs, persons } from "./iam";

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
