import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  smallint,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { sports } from "./reference";
import { persons } from "./iam";
import { divisions, leagues, seasons, teams } from "./league";
import { games } from "./game";

// =====================================================================
// STAT_LINES — per (game, person) projection of game_events
// Sport-agnostic header + JSONB body (core + extended).
// =====================================================================
export const statLines = pgTable(
  "stat_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    sportCode: text("sport_code")
      .notNull()
      .references(() => sports.code),
    seasonId: uuid("season_id").references(() => seasons.id, {
      onDelete: "set null"
    }),
    leagueId: uuid("league_id").references(() => leagues.id, {
      onDelete: "set null"
    }),
    divisionId: uuid("division_id").references(() => divisions.id, {
      onDelete: "set null"
    }),
    gpIncrement: smallint("gp_increment").notNull().default(1),
    minutesPlayed: integer("minutes_played"),
    /** Canonical per-sport stats — { goals, assists, points, pim, ... } */
    core: jsonb("core").notNull().default(sql`'{}'::jsonb`),
    /** Sport-specific extras — { sv_pct, gaa, xG, ... } */
    extended: jsonb("extended").notNull().default(sql`'{}'::jsonb`),
    derivedAt: timestamp("derived_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    uniqGamePerson: uniqueIndex("stat_line_game_person_uniq").on(
      t.gameId,
      t.personId
    ),
    personIdx: index("stat_line_person_idx").on(t.personId),
    leagueIdx: index("stat_line_league_idx").on(t.leagueId),
    seasonIdx: index("stat_line_season_idx").on(t.seasonId)
  })
);

// =====================================================================
// STANDINGS — per (league, division, team)
// =====================================================================
export const standings = pgTable(
  "standings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    divisionId: uuid("division_id").references(() => divisions.id, {
      onDelete: "cascade"
    }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    gp: smallint("gp").notNull().default(0),
    w: smallint("w").notNull().default(0),
    l: smallint("l").notNull().default(0),
    t: smallint("t").notNull().default(0),
    otl: smallint("otl").notNull().default(0),
    points: smallint("points").notNull().default(0),
    gf: smallint("gf").notNull().default(0),
    ga: smallint("ga").notNull().default(0),
    gd: smallint("gd").notNull().default(0),
    rank: smallint("rank"),
    tiebreakers: jsonb("tiebreakers").notNull().default(sql`'{}'::jsonb`),
    derivedAt: timestamp("derived_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    uniqLeagueDivisionTeam: uniqueIndex("standings_uniq").on(
      t.leagueId,
      t.divisionId,
      t.teamId
    ),
    leagueIdx: index("standings_league_idx").on(t.leagueId),
    divisionRankIdx: index("standings_division_rank_idx").on(
      t.divisionId,
      t.rank
    )
  })
);

// =====================================================================
// LEADERBOARDS — top-N projections for a metric within a scope
// =====================================================================
export const leaderboards = pgTable(
  "leaderboards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeType: text("scope_type").notNull(),
    scopeId: uuid("scope_id"),
    metric: text("metric").notNull(),
    windowKind: text("window_kind").notNull().default("season"),
    sportCode: text("sport_code")
      .notNull()
      .references(() => sports.code),
    entries: jsonb("entries").notNull().default(sql`'[]'::jsonb`),
    rankedAt: timestamp("ranked_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    uniqScopeMetric: uniqueIndex("leaderboard_uniq").on(
      t.scopeType,
      t.scopeId,
      t.metric,
      t.windowKind
    ),
    scopeIdx: index("leaderboard_scope_idx").on(t.scopeType, t.scopeId)
  })
);
