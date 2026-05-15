import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";
import { teams } from "./league";

// =====================================================================
// TEAM_STORE_PRODUCTS — captain-curated merch catalog per team.
// Browse on player-web `/store`; CRUD via the captain console.
// Purchase flow is deferred until P4-1 (real Stripe) lands.
// Backlog #11.
// =====================================================================
export const teamStoreProducts = pgTable(
  "team_store_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Hosted image URL — we don't manage uploads; admin pastes one. */
    imageUrl: text("image_url"),
    priceCents: integer("price_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    /** Free-text for now (e.g. "Adult M", "Youth XL"). */
    variantLabel: text("variant_label"),
    /** Null = unlimited. */
    stockQty: integer("stock_qty"),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdByUserId: uuid("created_by_user_id").references(
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
    teamIdx: index("team_store_product_team_idx").on(t.teamId),
    activeIdx: index("team_store_product_active_idx").on(t.isActive),
    currencyCheck: check(
      "team_store_product_currency_check",
      sql`${t.currency} ~ '^[A-Z]{3}$'`
    ),
    priceCheck: check(
      "team_store_product_price_check",
      sql`${t.priceCents} >= 0`
    )
  })
);
