/**
 * Registration discounts (0080): discount codes a league or org admin
 * makes for a season, one row per use, and the season's family pricing
 * (family maximum and sibling discount). The rules live in
 * @sportspulse/kernel (discounts.ts); the registration pay step prices
 * with them and writes the result as discount lines on the invoice.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  boolean,
  date,
  timestamp,
  index,
  uniqueIndex,
  check
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";
import { orgs, persons } from "./iam";
import { seasons } from "./league";
import { registrations } from "./registration";
import { invoices } from "./finance";

// =====================================================================
// DISCOUNT_CODES — one code for one season. `code` is stored normalised
// (upper case, no spaces), so the unique index makes it case-blind.
// usage_count moves only with discount_code_redemptions, atomically.
// =====================================================================
export const discountCodes = pgTable(
  "discount_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    description: text("description"),
    /** percent | fixed */
    kind: text("kind").notNull(),
    /** percent: basis points, 100 = 1%. */
    percentBasisPoints: integer("percent_basis_points"),
    /** fixed: cents off. */
    amountCents: integer("amount_cents"),
    /** NULL = no limit. */
    usageLimit: integer("usage_limit"),
    usageCount: integer("usage_count").notNull().default(0),
    /** Calendar dates in the season's time zone, inclusive. */
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    /** Empty = every division / every price. */
    divisionIds: uuid("division_ids").array().notNull().default(sql`'{}'::uuid[]`),
    pricingTierIds: uuid("pricing_tier_ids").array().notNull().default(sql`'{}'::uuid[]`),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: uuid("created_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    seasonCodeUniq: uniqueIndex("discount_code_season_code_uniq").on(t.seasonId, t.code),
    orgIdx: index("discount_code_org_idx").on(t.orgId),
    kindCheck: check("discount_code_kind_check", sql`${t.kind} IN ('percent','fixed')`),
    valueCheck: check(
      "discount_code_value_check",
      sql`(${t.kind} = 'percent' AND ${t.percentBasisPoints} BETWEEN 1 AND 10000 AND ${t.amountCents} IS NULL)
        OR (${t.kind} = 'fixed' AND ${t.amountCents} > 0 AND ${t.percentBasisPoints} IS NULL)`
    ),
    usageCheck: check(
      "discount_code_usage_check",
      sql`${t.usageCount} >= 0 AND (${t.usageLimit} IS NULL OR (${t.usageLimit} >= 0 AND ${t.usageCount} <= ${t.usageLimit}))`
    ),
    datesCheck: check(
      "discount_code_dates_check",
      sql`${t.validFrom} IS NULL OR ${t.validTo} IS NULL OR ${t.validFrom} <= ${t.validTo}`
    ),
    codeCheck: check("discount_code_code_check", sql`${t.code} ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'`)
  })
);

// =====================================================================
// DISCOUNT_CODE_REDEMPTIONS — one row per registration that used a code.
// Taken in the pay transaction with the invoice; released (once) when the
// registration is rejected or cancelled. Admins read uses per code here.
// =====================================================================
export const discountCodeRedemptions = pgTable(
  "discount_code_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    discountCodeId: uuid("discount_code_id")
      .notNull()
      .references(() => discountCodes.id, { onDelete: "cascade" }),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => registrations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    personId: uuid("person_id").references(() => persons.id, { onDelete: "set null" }),
    amountCents: integer("amount_cents").notNull(),
    /** active | released */
    status: text("status").notNull().default("active"),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releasedReason: text("released_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    codeRegUniq: uniqueIndex("discount_redemption_code_reg_uniq").on(t.discountCodeId, t.registrationId),
    codeIdx: index("discount_redemption_code_idx").on(t.discountCodeId),
    regIdx: index("discount_redemption_reg_idx").on(t.registrationId),
    statusCheck: check("discount_redemption_status_check", sql`${t.status} IN ('active','released')`),
    amountCheck: check("discount_redemption_amount_check", sql`${t.amountCents} >= 0`)
  })
);

// =====================================================================
// SEASON_FAMILY_PRICING — one row per season. A family is the account
// paying: a guardian for their children and themselves (see the API's
// family key). family_max_cents caps what the family pays for the
// season's registrations; the sibling discount comes off each
// registration from sibling_from_nth on.
// =====================================================================
export const seasonFamilyPricing = pgTable(
  "season_family_pricing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    familyMaxCents: integer("family_max_cents"),
    /** percent | fixed | NULL (no sibling discount) */
    siblingKind: text("sibling_kind"),
    siblingPercentBasisPoints: integer("sibling_percent_basis_points"),
    siblingAmountCents: integer("sibling_amount_cents"),
    siblingFromNth: integer("sibling_from_nth").notNull().default(2),
    isActive: boolean("is_active").notNull().default(true),
    updatedByUserId: uuid("updated_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    seasonUniq: uniqueIndex("season_family_pricing_season_uniq").on(t.seasonId),
    maxCheck: check("season_family_pricing_max_check", sql`${t.familyMaxCents} IS NULL OR ${t.familyMaxCents} >= 0`),
    nthCheck: check("season_family_pricing_nth_check", sql`${t.siblingFromNth} BETWEEN 2 AND 20`),
    siblingCheck: check(
      "season_family_pricing_sibling_check",
      sql`(${t.siblingKind} IS NULL AND ${t.siblingPercentBasisPoints} IS NULL AND ${t.siblingAmountCents} IS NULL)
        OR (${t.siblingKind} = 'percent' AND ${t.siblingPercentBasisPoints} BETWEEN 1 AND 10000 AND ${t.siblingAmountCents} IS NULL)
        OR (${t.siblingKind} = 'fixed' AND ${t.siblingAmountCents} > 0 AND ${t.siblingPercentBasisPoints} IS NULL)`
    )
  })
);
