/**
 * Registration Module v2 — schema additions
 *
 * These tables are net-new and additive only. They sit alongside the
 * existing v1 registration / finance / iam schema without changing any
 * existing tables. Workflow 1 v2 wires them in at the application layer.
 *
 * - pricing_tiers          — per-season tier with payment plan + usage limit
 * - installment_schedules  — per-invoice plan timeline rows
 * - email_templates        — per (season, event_type) message body
 * - team_invites           — captain → player invite tokens (Path 2D)
 * - free_agent_pool_entries — Path 2C marketplace listing
 *
 * Spec: doc/specs/registration-module-v2.md and
 *       doc/specs/workflow-1-player-signup-v2.md
 */

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
import { seasons, divisions, teams } from "./league";
import { invoices } from "./finance";

// =====================================================================
// PRICING_TIERS — per-season tiers with optional payment plan + caps
// Replaces "raw price field" UX. The visual timeline component reads
// deposit_cents + installment_count + interval to render dates.
// =====================================================================
export const pricingTiers = pgTable(
  "pricing_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Stable code for programmatic lookup, e.g. "early-bird". */
    code: text("code"),
    description: text("description"),
    /** Optional division this tier targets — NULL = applies to whole season. */
    divisionId: uuid("division_id").references(() => divisions.id, {
      onDelete: "set null"
    }),
    currency: text("currency").notNull().default("USD"),
    /** Full price (cents) — what a single registrant pays under "full" plan. */
    fullPriceCents: integer("full_price_cents").notNull(),
    /** Marks tier as zero-cost — skip payment step in adaptive form. */
    isFree: boolean("is_free").notNull().default(false),
    /** Whether the registrant may select Option B (split into installments). */
    paymentPlanEnabled: boolean("payment_plan_enabled")
      .notNull()
      .default(false),
    /** Deposit (cents) charged at registration when plan_enabled. */
    depositCents: integer("deposit_cents").notNull().default(0),
    /** Number of installments AFTER the deposit. e.g. 3 = deposit + 3 charges. */
    installmentCount: integer("installment_count").notNull().default(0),
    /** Days between successive installments. */
    installmentIntervalDays: integer("installment_interval_days")
      .notNull()
      .default(30),
    lateFeeCents: integer("late_fee_cents").notNull().default(0),
    /** Cap on usage (across all seats). NULL = unlimited. */
    usageLimit: integer("usage_limit"),
    /** Live counter of paid registrations in this tier (atomic on payment). */
    usageCount: integer("usage_count").notNull().default(0),
    /** Custom URL slug — when set, tier only reachable via /registration/{seasonSlug}/p/{custom_url_slug}. */
    customUrlSlug: text("custom_url_slug"),
    /** True = pricing intended for returning teams (different than new). */
    isReturningTeamPricing: boolean("is_returning_team_pricing")
      .notNull()
      .default(false),
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
    seasonIdx: index("pricing_tier_season_idx").on(t.seasonId),
    divisionIdx: index("pricing_tier_division_idx").on(t.divisionId),
    codeUniq: uniqueIndex("pricing_tier_code_uniq").on(t.seasonId, t.code),
    customUrlUniq: uniqueIndex("pricing_tier_custom_url_uniq").on(
      t.seasonId,
      t.customUrlSlug
    ),
    fullPriceCheck: check(
      "pricing_tier_full_price_check",
      sql`${t.fullPriceCents} >= 0`
    ),
    depositCheck: check(
      "pricing_tier_deposit_check",
      sql`${t.depositCents} >= 0 AND ${t.depositCents} <= ${t.fullPriceCents}`
    ),
    installmentCheck: check(
      "pricing_tier_installment_check",
      sql`${t.installmentCount} >= 0`
    ),
    usageCheck: check(
      "pricing_tier_usage_check",
      sql`${t.usageLimit} IS NULL OR ${t.usageCount} <= ${t.usageLimit}`
    )
  })
);

// =====================================================================
// PRICING_TIER_DIVISIONS — N:M between pricing_tiers and divisions.
// Mockup's "Assign divisions to pricing tier" checkbox grid writes
// here. The legacy 1:1 pricing_tiers.division_id stays for back-compat
// (set to first checked division) but new callers should read this
// table for the full assignment set.
// =====================================================================
export const pricingTierDivisions = pgTable(
  "pricing_tier_divisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pricingTierId: uuid("pricing_tier_id")
      .notNull()
      .references(() => pricingTiers.id, { onDelete: "cascade" }),
    divisionId: uuid("division_id")
      .notNull()
      .references(() => divisions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    uniq: uniqueIndex("ptd_tier_division_uniq").on(t.pricingTierId, t.divisionId),
    tierIdx: index("ptd_tier_idx").on(t.pricingTierId),
    divisionIdx: index("ptd_division_idx").on(t.divisionId)
  })
);

// =====================================================================
// INSTALLMENT_SCHEDULES — per-invoice plan timeline
// Generated when a registrant selects Option B at checkout. Each row is
// scheduled as a Stripe PaymentIntent with future confirmation.
// =====================================================================
export const installmentSchedules = pgTable(
  "installment_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    /** 0 = deposit; 1..N = installments. */
    installmentNumber: integer("installment_number").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    /** scheduled | charging | succeeded | failed | refunded | cancelled */
    status: text("status").notNull().default("scheduled"),
    /** Stripe PaymentIntent id once attempted. */
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    /** Last error message from Stripe (UI shows this on retry). */
    lastErrorMessage: text("last_error_message"),
    attemptCount: integer("attempt_count").notNull().default(0),
    chargedAt: timestamp("charged_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    invoiceIdx: index("installment_invoice_idx").on(t.invoiceId),
    uniqInvoiceN: uniqueIndex("installment_uniq").on(
      t.invoiceId,
      t.installmentNumber
    ),
    statusCheck: check(
      "installment_status_check",
      sql`${t.status} IN ('scheduled','charging','succeeded','failed','refunded','cancelled')`
    )
  })
);

// =====================================================================
// EMAIL_TEMPLATES — one per (season, event_type, registration_type_filter)
// Multi-template system replaces v1's single template. Body is HTML.
// =====================================================================
export const emailTemplates = pgTable(
  "email_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    /** on_payment | on_approved | on_rejected | installment_reminder | season_closing | parental_consent | custom */
    eventType: text("event_type").notNull(),
    /** Filter the template by registration path: all | team | individual */
    registrationTypeFilter: text("registration_type_filter")
      .notNull()
      .default("all"),
    subject: text("subject").notNull(),
    bodyHtml: text("body_html").notNull(),
    /** Optional PDF attachment (e.g. signed waiver bundle). */
    attachmentPath: text("attachment_path"),
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
    seasonIdx: index("email_tpl_season_idx").on(t.seasonId),
    /** Only one active template per (season, event_type, type_filter). */
    uniqActive: uniqueIndex("email_tpl_active_uniq")
      .on(t.seasonId, t.eventType, t.registrationTypeFilter)
      .where(sql`${t.isActive} = true`),
    eventTypeCheck: check(
      "email_tpl_event_check",
      sql`${t.eventType} IN ('on_payment','on_approved','on_rejected','installment_reminder','season_closing','parental_consent','custom')`
    ),
    typeFilterCheck: check(
      "email_tpl_type_filter_check",
      sql`${t.registrationTypeFilter} IN ('all','team','individual')`
    )
  })
);

// =====================================================================
// TEAM_INVITES — captain → player invite tokens (Path 2D)
// Personal email invites expire 7 days; generic team URL until roster_lock.
// =====================================================================
export const teamInvites = pgTable(
  "team_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    /** Captain user who issued the invite. */
    issuedByUserId: uuid("issued_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    /** When invite is generic (team-wide URL), email is NULL. */
    inviteeEmail: text("invitee_email"),
    /** Random URL-safe token: 32 bytes base64url. */
    token: text("token").notNull().unique(),
    /** personal | generic */
    kind: text("kind").notNull().default("personal"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** pending | accepted | declined | expired | revoked */
    status: text("status").notNull().default("pending"),
    acceptedByUserId: uuid("accepted_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Last sent — used to throttle resend. */
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    sendCount: integer("send_count").notNull().default(1),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    teamIdx: index("team_invite_team_idx").on(t.teamId),
    seasonIdx: index("team_invite_season_idx").on(t.seasonId),
    emailIdx: index("team_invite_email_idx").on(t.inviteeEmail),
    kindCheck: check(
      "team_invite_kind_check",
      sql`${t.kind} IN ('personal','generic')`
    ),
    statusCheck: check(
      "team_invite_status_check",
      sql`${t.status} IN ('pending','accepted','declined','expired','revoked')`
    )
  })
);

// =====================================================================
// FREE_AGENT_POOL_ENTRIES — Path 2C marketplace
// Captains in matching divisions browse + filter on this. One entry per
// (player, season). Removed (left_at) when captain places the player.
// =====================================================================
export const freeAgentPoolEntries = pgTable(
  "free_agent_pool_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerPersonId: uuid("player_person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    /** ['F','D','G'] etc. ordered by player preference. */
    positions: text("positions").array().notNull(),
    /** ISO weekday → time-of-day windows (JSONB for flexibility). */
    availability: jsonb("availability").notNull().default(sql`'{}'::jsonb`),
    /** Self-reported skill level: A | B | C | D */
    levelPrimary: text("level_primary").notNull(),
    /** Player flexibility list, e.g. ["B","C"]. */
    levelFlexibility: text("level_flexibility").array(),
    /** Captain-visible note, e.g. "Available May 12 onward". */
    note: text("note"),
    /** Cached no-show rate from previous seasons (0..1). NULL = first season. */
    noShowRate: text("no_show_rate"),
    /** active | placed | withdrawn */
    status: text("status").notNull().default("active"),
    placedTeamId: uuid("placed_team_id").references(() => teams.id, {
      onDelete: "set null"
    }),
    placedAt: timestamp("placed_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    seasonIdx: index("fa_pool_season_idx").on(t.seasonId),
    playerIdx: index("fa_pool_player_idx").on(t.playerPersonId),
    levelIdx: index("fa_pool_level_idx").on(t.levelPrimary),
    uniqPlayerSeason: uniqueIndex("fa_pool_uniq").on(
      t.playerPersonId,
      t.seasonId
    ),
    statusCheck: check(
      "fa_pool_status_check",
      sql`${t.status} IN ('active','placed','withdrawn')`
    ),
    levelCheck: check(
      "fa_pool_level_check",
      sql`${t.levelPrimary} IN ('A','B','C','D')`
    )
  })
);
