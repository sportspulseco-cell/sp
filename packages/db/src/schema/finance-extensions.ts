/**
 * Finance module — extension tables for the Payment & Invoicing UI.
 *
 * Net-new and additive only. Sit alongside the existing finance.ts
 * tables (invoices / invoice_items / payments / fee_schedules) without
 * altering them. The 6-tab Payment & Invoicing surface in
 * apps/superadmin-web/(admin)/payments wires its data to these tables:
 *
 *   - team_invoice_splits      → "Dues split" tab (per-player share of a team invoice)
 *   - refunds                  → "Refund / credit" tab
 *   - wallet_accounts          → "Wallet" balance card
 *   - wallet_ledger            → "Wallet" entries list
 *   - invoice_escalations      → "Overdue" queue row state
 *   - overdue_reminder_log     → "Overdue" reminder counts + history
 *   - quickbooks_sync_logs     → "QuickBooks sync status" footer
 *
 * Spec mapping: each mockup field carries a schema-tag in the UI that
 * traces back to one of these columns. Designed to be extended (not
 * replaced) by a future cron job + worker that issues automated
 * reminders / runs Stripe auto-charges / pushes to QuickBooks.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  boolean,
  smallint,
  timestamp,
  index,
  uniqueIndex,
  check
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";
import { orgs, persons } from "./iam";
import { seasons, teams } from "./league";
import { rosterMoves } from "./roster";
import { invoices, payments } from "./finance";

// =====================================================================
// TEAM_INVOICE_SPLITS — per-player share of a team-level invoice.
// Rendered by the Dues split tab. allocatedCents/collectedCents drive
// the per-player progress bar + status pill (paid/partial/pending/overdue).
// =====================================================================
export const teamInvoiceSplits = pgTable(
  "team_invoice_splits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    playerPersonId: uuid("player_person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    /** Amount this player owes (cents). */
    allocatedCents: integer("allocated_cents").notNull(),
    /** Cumulative amount collected from this player (cents). */
    collectedCents: integer("collected_cents").notNull().default(0),
    /** pending | partial | paid | overdue */
    status: text("status").notNull().default("pending"),
    /** Last reminder sent for THIS split (separate from invoice escalation). */
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    invoicePlayerUniq: uniqueIndex("team_split_invoice_player_uniq").on(
      t.invoiceId,
      t.playerPersonId
    ),
    invoiceIdx: index("team_split_invoice_idx").on(t.invoiceId),
    teamIdx: index("team_split_team_idx").on(t.teamId),
    playerIdx: index("team_split_player_idx").on(t.playerPersonId),
    statusCheck: check(
      "team_split_status_check",
      sql`${t.status} IN ('pending','partial','paid','overdue')`
    ),
    allocCheck: check(
      "team_split_alloc_check",
      sql`${t.allocatedCents} >= 0`
    ),
    collectedCheck: check(
      "team_split_collected_check",
      sql`${t.collectedCents} >= 0 AND ${t.collectedCents} <= ${t.allocatedCents}`
    )
  })
);

// =====================================================================
// REFUNDS — issued against an invoice, optionally tied to a payment.
// One row per refund event. Stripe processor IDs live alongside.
// =====================================================================
export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    /** Optional — null when the refund is an adjustment (no original payment). */
    paymentId: uuid("payment_id").references(() => payments.id, {
      onDelete: "set null"
    }),
    /** full_original | partial_original | wallet_credit | adjustment */
    refundType: text("refund_type").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    /** Min 10 chars — enforced at API layer; stored verbatim for audit. */
    reason: text("reason").notNull(),
    issuedByUserId: uuid("issued_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    /** Stripe refund id once the gateway returns one. */
    processorRefundId: text("processor_refund_id"),
    /** pending | succeeded | failed | cancelled */
    status: text("status").notNull().default("pending"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    /** Last gateway error message — surfaced to admins on retry. */
    lastErrorMessage: text("last_error_message"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    invoiceIdx: index("refund_invoice_idx").on(t.invoiceId),
    paymentIdx: index("refund_payment_idx").on(t.paymentId),
    orgStatusIdx: index("refund_org_status_idx").on(t.orgId, t.status),
    processorUniq: uniqueIndex("refund_processor_uniq").on(t.processorRefundId),
    typeCheck: check(
      "refund_type_check",
      sql`${t.refundType} IN ('full_original','partial_original','wallet_credit','adjustment')`
    ),
    statusCheck: check(
      "refund_status_check",
      sql`${t.status} IN ('pending','succeeded','failed','cancelled')`
    ),
    amountCheck: check("refund_amount_check", sql`${t.amountCents} > 0`)
  })
);

// =====================================================================
// WALLET_ACCOUNTS — per (person, org, currency). One balance row.
// Players never have multiple accounts in one currency; the unique
// index enforces that. balance_cents is denormalised for fast read,
// and the ledger below is the source of truth for audit.
// =====================================================================
export const walletAccounts = pgTable(
  "wallet_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    currency: text("currency").notNull().default("USD"),
    /** Denormalised, equals SUM(amount_cents) over wallet_ledger. */
    balanceCents: integer("balance_cents").notNull().default(0),
    /** Optional org-wide expiry policy (per-entry expiry lives on ledger). */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Frozen accounts can't be debited or credited. */
    frozen: boolean("frozen").notNull().default(false),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    personOrgCurrencyUniq: uniqueIndex("wallet_person_org_currency_uniq").on(
      t.personId,
      t.orgId,
      t.currency
    ),
    personIdx: index("wallet_person_idx").on(t.personId),
    orgIdx: index("wallet_org_idx").on(t.orgId),
    balanceCheck: check(
      "wallet_balance_check",
      sql`${t.balanceCents} >= 0`
    )
  })
);

// =====================================================================
// WALLET_LEDGER — append-only entries. Source of truth for audit.
// Positive amount = credit issued; negative = applied/debit.
// Updates to wallet_accounts.balanceCents must happen in the same
// transaction as the ledger insert (handled at API layer).
// =====================================================================
export const walletLedger = pgTable(
  "wallet_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => walletAccounts.id, { onDelete: "cascade" }),
    /** credit_issued | credit_applied | credit_expired | adjustment */
    entryType: text("entry_type").notNull(),
    /** Positive = credit; negative = applied. */
    amountCents: integer("amount_cents").notNull(),
    relatedInvoiceId: uuid("related_invoice_id").references(() => invoices.id, {
      onDelete: "set null"
    }),
    relatedRefundId: uuid("related_refund_id").references(() => refunds.id, {
      onDelete: "set null"
    }),
    /** Free text — required, surfaced in the UI ledger. */
    reason: text("reason").notNull(),
    issuedByUserId: uuid("issued_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    /** Per-entry expiry — unused credit auto-expires on this date. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    walletIdx: index("wallet_ledger_wallet_idx").on(t.walletId),
    walletCreatedIdx: index("wallet_ledger_wallet_created_idx").on(
      t.walletId,
      t.createdAt
    ),
    entryTypeCheck: check(
      "wallet_ledger_type_check",
      sql`${t.entryType} IN ('credit_issued','credit_applied','credit_expired','adjustment')`
    )
  })
);

// =====================================================================
// INVOICE_ESCALATIONS — one row per overdue invoice. Tracks reminder
// cadence + auto-suspension flag + admin extensions. The "Overdue"
// tab reads this table joined to invoices.
// =====================================================================
export const invoiceEscalations = pgTable(
  "invoice_escalations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    /** 1 = gentle, 2 = firm, 3 = legal/collections. */
    level: smallint("level").notNull().default(1),
    remindersSent: integer("reminders_sent").notNull().default(0),
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
    nextReminderAt: timestamp("next_reminder_at", { withTimezone: true }),
    /** When set, auto-suspension is active for the player/team. */
    lockSuspended: boolean("lock_suspended").notNull().default(false),
    flagWaivedAt: timestamp("flag_waived_at", { withTimezone: true }),
    flagWaivedByUserId: uuid("flag_waived_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    /** Admin-granted due-date extension. */
    extendedDueAt: timestamp("extended_due_at", { withTimezone: true }),
    lastActionAt: timestamp("last_action_at", { withTimezone: true }),
    lastActionByUserId: uuid("last_action_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    /** mark_paid | message | extend | suppress | waive_flag — last action label. */
    lastActionKind: text("last_action_kind"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    invoiceUniq: uniqueIndex("invoice_escalation_invoice_uniq").on(t.invoiceId),
    levelCheck: check(
      "invoice_escalation_level_check",
      sql`${t.level} BETWEEN 1 AND 3`
    )
  })
);

// =====================================================================
// OVERDUE_REMINDER_LOG — append-only log of every reminder sent.
// Drives the "Reminder N sent" counter on the Overdue tab. Reminders
// are dispatched by a worker that reads invoice_escalations.nextReminderAt.
// =====================================================================
export const overdueReminderLog = pgTable(
  "overdue_reminder_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    escalationId: uuid("escalation_id")
      .notNull()
      .references(() => invoiceEscalations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    /** email | sms | in_app */
    channel: text("channel").notNull().default("email"),
    templateCode: text("template_code"),
    /** queued | sent | failed */
    status: text("status").notNull().default("sent"),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    invoiceIdx: index("reminder_log_invoice_idx").on(t.invoiceId),
    escalationIdx: index("reminder_log_escalation_idx").on(t.escalationId),
    sentAtIdx: index("reminder_log_sent_at_idx").on(t.sentAt),
    channelCheck: check(
      "reminder_log_channel_check",
      sql`${t.channel} IN ('email','sms','in_app')`
    ),
    statusCheck: check(
      "reminder_log_status_check",
      sql`${t.status} IN ('queued','sent','failed')`
    )
  })
);

// =====================================================================
// QUICKBOOKS_SYNC_LOGS — every push to QuickBooks Online lands here.
// Drives the "QuickBooks synced · 2 min ago" indicator + "Recent sync
// events" footer on the Overdue tab. Real QB OAuth integration is a
// separate ticket — this table holds the schema so the worker can
// land later without UI churn.
// =====================================================================
export const quickbooksSyncLogs = pgTable(
  "quickbooks_sync_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    /** invoice | payment | refund | credit_memo */
    entityType: text("entity_type").notNull(),
    /** Local UUID of the entity being synced. */
    entityId: uuid("entity_id").notNull(),
    /** QB's id once the sync succeeds. */
    qbId: text("qb_id"),
    /** create | update | delete */
    action: text("action").notNull().default("create"),
    /** queued | syncing | succeeded | failed */
    status: text("status").notNull().default("queued"),
    /** Human-readable summary, e.g. "QB Payment created" or "QB Invoice updated". */
    summary: text("summary"),
    errorMessage: text("error_message"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    orgAttemptedIdx: index("qb_sync_org_attempted_idx").on(
      t.orgId,
      t.attemptedAt
    ),
    entityIdx: index("qb_sync_entity_idx").on(t.entityType, t.entityId),
    entityActionStatusCheck: check(
      "qb_sync_entity_check",
      sql`${t.entityType} IN ('invoice','payment','refund','credit_memo')`
    ),
    actionCheck: check(
      "qb_sync_action_check",
      sql`${t.action} IN ('create','update','delete')`
    ),
    statusCheck: check(
      "qb_sync_status_check",
      sql`${t.status} IN ('queued','syncing','succeeded','failed')`
    )
  })
);

// =====================================================================
// REFUND_ASSESSMENTS — Workflow 7B drop refund review queue.
// When a captain drops a player who has paid, this row is created so
// a league admin reviews the case and decides full / partial / no
// refund. On admin decision a `refunds` row is issued (or status →
// resolved_no_refund). Distinct from `refunds`: that table is the
// processor-side issuance event; this is the human-decision queue.
// =====================================================================
export const refundAssessments = pgTable(
  "refund_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    /** Originating roster_moves row (drop / trade_out / etc). */
    sourceMoveId: uuid("source_move_id").references(() => rosterMoves.id, {
      onDelete: "set null"
    }),
    /** drop | transfer | division_rejected | admin_action */
    sourceEvent: text("source_event").notNull().default("drop"),
    /** The invoice this assessment is against (usually a sub-invoice). */
    invoiceId: uuid("invoice_id").references(() => invoices.id, {
      onDelete: "set null"
    }),
    paidCents: integer("paid_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    /** pending | resolved_refund | resolved_no_refund | void */
    status: text("status").notNull().default("pending"),
    decisionNotes: text("decision_notes"),
    refundAmountCents: integer("refund_amount_cents").notNull().default(0),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    statusCheck: check(
      "refund_assessment_status_check",
      sql`${t.status} IN ('pending','resolved_refund','resolved_no_refund','void')`
    ),
    sourceCheck: check(
      "refund_assessment_source_check",
      sql`${t.sourceEvent} IN ('drop','transfer','division_rejected','admin_action')`
    ),
    statusIdx: index("refund_assessments_status_idx").on(
      t.status,
      t.createdAt
    ),
    teamIdx: index("refund_assessments_team_idx").on(t.teamId, t.seasonId),
    orgIdx: index("refund_assessments_org_idx").on(t.orgId, t.status)
  })
);
