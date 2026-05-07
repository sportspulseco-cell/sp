import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  char,
  integer,
  smallint,
  date,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";
import { countries, sports } from "./reference";
import { orgs } from "./iam";

// =====================================================================
// GOVERNING BODIES — recursive, sport-scoped (USA Hockey, FIFA, BCCI…)
// =====================================================================
export const governingBodies = pgTable(
  "governing_bodies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    nameTranslations: jsonb("name_translations")
      .notNull()
      .default(sql`'{}'::jsonb`),
    sportCode: text("sport_code")
      .notNull()
      .references(() => sports.code),
    countryCode: char("country_code", { length: 2 }).references(
      () => countries.code
    ),
    scope: text("scope").notNull(),
    parentId: uuid("parent_id"),
    rulesUrl: text("rules_url"),
    contactEmail: text("contact_email"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    scopeCheck: check(
      "gb_scope_check",
      sql`${t.scope} IN ('international','national','regional','state','local')`
    ),
    sportIdx: index("gb_sport_idx").on(t.sportCode),
    parentIdx: index("gb_parent_idx").on(t.parentId)
  })
);

// =====================================================================
// AGE GROUPS — owned by a governing body, define eligibility windows
// =====================================================================
export const ageGroups = pgTable(
  "age_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    governingBodyId: uuid("governing_body_id")
      .notNull()
      .references(() => governingBodies.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    label: text("label").notNull(),
    birthYearMin: integer("birth_year_min"),
    birthYearMax: integer("birth_year_max"),
    genderEligibility: text("gender_eligibility").notNull(),
    playUpPolicy: jsonb("play_up_policy")
      .notNull()
      .default(sql`'{"allowed":false}'::jsonb`),
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    genderCheck: check(
      "age_group_gender_check",
      sql`${t.genderEligibility} IN ('male','female','mixed','open')`
    ),
    uniqGbCode: uniqueIndex("age_group_gb_code_uniq").on(
      t.governingBodyId,
      t.code
    ),
    gbIdx: index("age_group_gb_idx").on(t.governingBodyId)
  })
);

// =====================================================================
// RULE SETS — versioned rule packs (per sport, optionally GB-owned)
// =====================================================================
export const ruleSets = pgTable(
  "rule_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sportCode: text("sport_code")
      .notNull()
      .references(() => sports.code),
    governingBodyId: uuid("governing_body_id").references(
      () => governingBodies.id,
      { onDelete: "set null" }
    ),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }), // NULL = platform/global
    name: text("name").notNull(),
    versionNumber: integer("version_number").notNull().default(1),
    definition: jsonb("definition").notNull().default(sql`'{}'::jsonb`),
    isLocked: timestamp("is_locked", { withTimezone: true }), // once first league uses it
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    sportIdx: index("rule_set_sport_idx").on(t.sportCode),
    gbIdx: index("rule_set_gb_idx").on(t.governingBodyId),
    orgIdx: index("rule_set_org_idx").on(t.orgId)
  })
);

// =====================================================================
// LEAGUES — persistent competition container under an org.
//
// Hierarchy (post 2026-05-09 flip):  Org → League → Season → Division
// Old hierarchy was Org → Season → League → Division. League used to
// be a child of season; that was inverted. PPHL ("Power Play Hockey
// League") is the long-running thing; "PPHL Spring 2026" is a season
// of it.
// =====================================================================
export const leagues = pgTable(
  "leagues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    sportCode: text("sport_code")
      .notNull()
      .references(() => sports.code),
    governingBodyId: uuid("governing_body_id").references(
      () => governingBodies.id,
      { onDelete: "set null" }
    ),
    ruleSetId: uuid("rule_set_id").references(() => ruleSets.id, {
      onDelete: "set null"
    }),
    name: text("name").notNull(),
    nameTranslations: jsonb("name_translations")
      .notNull()
      .default(sql`'{}'::jsonb`),
    format: text("format").notNull().default("regular"),
    status: text("status").notNull().default("active"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    formatCheck: check(
      "league_format_check",
      sql`${t.format} IN ('regular','tournament','pickup','friendly')`
    ),
    statusCheck: check(
      "league_status_check",
      sql`${t.status} IN ('draft','active','archived')`
    ),
    orgIdx: index("league_org_idx").on(t.orgId),
    sportIdx: index("league_sport_idx").on(t.sportCode),
    statusIdx: index("league_status_idx").on(t.status)
  })
);

// =====================================================================
// SEASONS — temporal container; lives under a LEAGUE.
//
// orgId is kept as a denormalised convenience column (matches
// league.orgId) so filters and RLS don't need a join. Migration 0015
// backfills + a trigger in the migration keeps it in sync.
// =====================================================================
export const seasons = pgTable(
  "seasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    /** Denormalised — derivable through league.orgId. Kept for fast filters. */
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameTranslations: jsonb("name_translations")
      .notNull()
      .default(sql`'{}'::jsonb`),
    sportCode: text("sport_code")
      .notNull()
      .references(() => sports.code),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    registrationOpensAt: timestamp("registration_opens_at", {
      withTimezone: true
    }),
    registrationClosesAt: timestamp("registration_closes_at", {
      withTimezone: true
    }),
    rosterLockAt: timestamp("roster_lock_at", { withTimezone: true }),
    timezone: text("timezone").notNull().default("UTC"),
    status: text("status").notNull().default("draft"),
    /**
     * Per-season admin toggles. Source of truth for the schema is
     * `SeasonConfig` in @sportspulse/kernel. Expected keys:
     *   - requireUsaHockeyId       (bool)
     *   - allowFreeAgent           (bool)
     *   - parentalConsentRequired  (bool)
     *   - requireLiabilityWaiver   (bool)
     *   - maxRosterSize            (int)
     *   - rosterLockAt             (ISO timestamp string)
     * Defaults to {} so legacy rows keep their previously hard-coded
     * behaviour until an admin saves the wizard's "Divisions &
     * eligibility" step.
     */
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdByUserId: uuid("created_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    )
  },
  (t) => ({
    statusCheck: check(
      "season_status_check",
      sql`${t.status} IN ('draft','registration_open','in_progress','playoffs','completed','archived')`
    ),
    datesCheck: check(
      "season_dates_check",
      sql`${t.endDate} >= ${t.startDate}`
    ),
    orgIdx: index("season_org_idx").on(t.orgId),
    sportIdx: index("season_sport_idx").on(t.sportCode),
    statusIdx: index("season_status_idx").on(t.status)
  })
);

// =====================================================================
// DIVISIONS — under a SEASON, scoped by age + tier + gender.
// (Was under league; flipped 2026-05-09 — migration 0015.)
// =====================================================================
export const divisions = pgTable(
  "divisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    ageGroupId: uuid("age_group_id").references(() => ageGroups.id, {
      onDelete: "set null"
    }),
    name: text("name").notNull(),
    tier: text("tier"), // A / B / Premier / null
    genderEligibility: text("gender_eligibility").notNull().default("open"),
    ruleSetOverrides: jsonb("rule_set_overrides")
      .notNull()
      .default(sql`'{}'::jsonb`),
    maxTeams: smallint("max_teams"),
    playoffConfig: jsonb("playoff_config")
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("active"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    genderCheck: check(
      "division_gender_check",
      sql`${t.genderEligibility} IN ('male','female','mixed','open')`
    ),
    statusCheck: check(
      "division_status_check",
      sql`${t.status} IN ('active','archived')`
    ),
    seasonIdx: index("division_season_idx").on(t.seasonId),
    ageGroupIdx: index("division_age_group_idx").on(t.ageGroupId)
  })
);

// =====================================================================
// TEAMS — owned by a club (org); enter divisions via DivisionTeamEntry
// =====================================================================
export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    shortName: text("short_name"),
    nameTranslations: jsonb("name_translations")
      .notNull()
      .default(sql`'{}'::jsonb`),
    colors: jsonb("colors").notNull().default(sql`'{}'::jsonb`),
    logoUrl: text("logo_url"),
    sportCode: text("sport_code")
      .notNull()
      .references(() => sports.code),
    externalIds: jsonb("external_ids").notNull().default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("active"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    statusCheck: check(
      "team_status_check",
      sql`${t.status} IN ('active','dissolved')`
    ),
    orgIdx: index("team_org_idx").on(t.orgId),
    sportIdx: index("team_sport_idx").on(t.sportCode)
  })
);

// =====================================================================
// DIVISION_TEAM_ENTRIES — team participation in a division
// =====================================================================
export const divisionTeamEntries = pgTable(
  "division_team_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    divisionId: uuid("division_id")
      .notNull()
      .references(() => divisions.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    entryStatus: text("entry_status").notNull().default("applied"),
    seedHint: integer("seed_hint"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    statusCheck: check(
      "dte_entry_status_check",
      sql`${t.entryStatus} IN ('applied','accepted','withdrawn','disqualified')`
    ),
    uniqDivisionTeam: uniqueIndex("dte_division_team_uniq").on(
      t.divisionId,
      t.teamId
    ),
    divisionIdx: index("dte_division_idx").on(t.divisionId),
    teamIdx: index("dte_team_idx").on(t.teamId)
  })
);
