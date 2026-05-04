import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  check
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";
import { orgs, persons } from "./iam";
import { divisions, leagues, seasons } from "./league";
import { registrations } from "./registration";

// =====================================================================
// FEE_SCHEDULES — reusable price templates per (org, scope)
// scope_type lets the same schedule attach at different levels.
// =====================================================================
export const feeSchedules = pgTable(
  "fee_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** registration | division | tournament | sponsorship | other */
    kind: text("kind").notNull().default("registration"),
    /** Stable code for programmatic lookup, e.g. "spring-2027-player". */
    code: text("code"),
    currency: text("currency").notNull().default("USD"),
    /** Base price in minor units (cents). */
    baseAmountCents: integer("base_amount_cents").notNull().default(0),
    /** How many days after issue the invoice is due. */
    dueOffsetDays: integer("due_offset_days").notNull().default(14),
    lateFeeCents: integer("late_fee_cents").notNull().default(0),
    seasonId: uuid("season_id").references(() => seasons.id, {
      onDelete: "set null"
    }),
    leagueId: uuid("league_id").references(() => leagues.id, {
      onDelete: "set null"
    }),
    divisionId: uuid("division_id").references(() => divisions.id, {
      onDelete: "set null"
    }),
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
    orgIdx: index("fee_schedule_org_idx").on(t.orgId),
    codeUniq: uniqueIndex("fee_schedule_code_uniq").on(t.orgId, t.code)
  })
);

// =====================================================================
// INVOICES — per (recipient, due event)
// `registration_id` ties an invoice to its source if any. status is the
// authoritative read state; payments can change it (paid / partial).
// =====================================================================
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    /** Human-readable invoice number, e.g. "INV-2026-001". */
    invoiceNumber: text("invoice_number").notNull(),
    registrationId: uuid("registration_id").references(() => registrations.id, {
      onDelete: "set null"
    }),
    recipientPersonId: uuid("recipient_person_id").references(
      () => persons.id,
      { onDelete: "set null" }
    ),
    recipientEmail: text("recipient_email"),
    currency: text("currency").notNull().default("USD"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    paidCents: integer("paid_cents").notNull().default(0),
    /** draft | sent | paid | partial | overdue | void */
    status: text("status").notNull().default("draft"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    notes: text("notes"),
    /** Idempotency for system-generated invoices (e.g. registration→invoice). */
    idempotencyKey: text("idempotency_key"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    invoiceNumUniq: uniqueIndex("invoice_number_uniq").on(
      t.orgId,
      t.invoiceNumber
    ),
    idemUniq: uniqueIndex("invoice_idempotency_uniq").on(t.idempotencyKey),
    orgStatusIdx: index("invoice_org_status_idx").on(t.orgId, t.status),
    recipientIdx: index("invoice_recipient_idx").on(t.recipientPersonId),
    statusCheck: check(
      "invoice_status_check",
      sql`${t.status} IN ('draft','sent','paid','partial','overdue','void')`
    )
  })
);

// =====================================================================
// INVOICE_ITEMS — line items
// =====================================================================
export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    /** registration_fee | jersey | equipment | late_fee | discount | other */
    kind: text("kind").notNull().default("registration_fee"),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitAmountCents: integer("unit_amount_cents").notNull(),
    amountCents: integer("amount_cents").notNull(),
    feeScheduleId: uuid("fee_schedule_id").references(() => feeSchedules.id, {
      onDelete: "set null"
    }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    invoiceIdx: index("invoice_item_invoice_idx").on(t.invoiceId)
  })
);

// =====================================================================
// PAYMENTS — append-mostly. Receipts. Multiple payments per invoice ok.
// =====================================================================
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    /** cash | check | credit_card | etransfer | bank_transfer | manual | refund */
    method: text("method").notNull().default("manual"),
    /** pending | succeeded | failed | refunded */
    status: text("status").notNull().default("succeeded"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** External provider id (Stripe charge_id, etc.) */
    externalProviderId: text("external_provider_id"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    notes: text("notes"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    invoiceIdx: index("payment_invoice_idx").on(t.invoiceId),
    orgIdx: index("payment_org_received_idx").on(t.orgId, t.receivedAt),
    extProviderIdx: uniqueIndex("payment_ext_provider_uniq").on(
      t.externalProviderId
    ),
    statusCheck: check(
      "payment_status_check",
      sql`${t.status} IN ('pending','succeeded','failed','refunded')`
    )
  })
);
