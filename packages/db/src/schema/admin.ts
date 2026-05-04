import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  jsonb,
  boolean,
  timestamp,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";

// =====================================================================
// SYSTEM_SETTINGS — platform-wide key/value store
// Categories let the UI group related settings (general / email / billing).
// =====================================================================
export const systemSettings = pgTable(
  "system_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable lookup key — e.g. `support.email`, `branding.primary_color`. */
    key: text("key").notNull(),
    category: text("category").notNull().default("general"),
    /** Value is a JSON value of any shape (string, number, bool, object). */
    value: jsonb("value").notNull(),
    description: text("description"),
    /** When false, value is read-only via API even for super_admin. */
    isEditable: boolean("is_editable").notNull().default(true),
    updatedByUserId: uuid("updated_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    keyUniq: uniqueIndex("system_setting_key_uniq").on(t.key),
    categoryIdx: index("system_setting_category_idx").on(t.category)
  })
);

// =====================================================================
// FEATURE_FLAGS — boolean / variant gates with optional rollout %
// =====================================================================
export const featureFlags = pgTable(
  "feature_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    description: text("description"),
    /** Master switch — when false the flag is universally off. */
    isEnabled: boolean("is_enabled").notNull().default(false),
    /** 0-100, evaluated against a stable hash of the actor (org_id / user_id). */
    rolloutPct: text("rollout_pct").notNull().default("0"),
    /** Optional org allowlist — empty = all orgs. */
    orgAllowlist: jsonb("org_allowlist").notNull().default(sql`'[]'::jsonb`),
    /** Optional variant payload for non-boolean flags. */
    variants: jsonb("variants").notNull().default(sql`'[]'::jsonb`),
    updatedByUserId: uuid("updated_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    keyUniq: uniqueIndex("feature_flag_key_uniq").on(t.key)
  })
);
