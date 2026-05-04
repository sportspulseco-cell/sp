import { sql } from "drizzle-orm";
import {
  pgTable,
  char,
  text,
  smallint,
  boolean,
  jsonb,
  timestamp,
  check
} from "drizzle-orm/pg-core";

// Currencies (ISO-4217)
export const currencies = pgTable("currencies", {
  code: char("code", { length: 3 }).primaryKey(),
  symbol: text("symbol").notNull(),
  decimals: smallint("decimals").notNull().default(2),
  name: text("name").notNull()
});

// Locales (BCP-47)
export const locales = pgTable("locales", {
  code: text("code").primaryKey(),
  rtl: boolean("rtl").notNull().default(false),
  name: text("name").notNull()
});

// Countries (ISO-3166-1 alpha-2)
export const countries = pgTable("countries", {
  code: char("code", { length: 2 }).primaryKey(),
  name: text("name").notNull(),
  defaultCurrency: char("default_currency", { length: 3 })
    .notNull()
    .references(() => currencies.code),
  defaultLocale: text("default_locale")
    .notNull()
    .references(() => locales.code),
  phonePrefix: text("phone_prefix")
});

// Sports (catalog — drives sport-specific stats projections)
export const sports = pgTable(
  "sports",
  {
    code: text("code").primaryKey(),
    name: text("name").notNull(),
    nameTranslations: jsonb("name_translations")
      .notNull()
      .default(sql`'{}'::jsonb`),
    teamSizeDefault: smallint("team_size_default"),
    periodModel: text("period_model").notNull(),
    scoringModel: jsonb("scoring_model")
      .notNull()
      .default(sql`'{}'::jsonb`),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    periodModelCheck: check(
      "sports_period_model_check",
      sql`${t.periodModel} IN ('period','half','quarter','inning','set','frame','none')`
    )
  })
);
