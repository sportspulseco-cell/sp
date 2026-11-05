import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  smallint,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";
import { persons, orgs } from "./iam";
import { seasons, teams, regions } from "./league";
import { gameAttendance, games } from "./game";

// =====================================================================
// SUBSTITUTE_REQUESTS — UC-31 / FR-3.3.1: a captain asks one player to
// sub for one game; the player accepts or declines. On accept the player
// is added to the game as a guest (game_attendance is_guest) and the row
// points at that attendance. A league admin may assign a sub directly
// (roster_override = true). Rules: packages/kernel/src/substitutes.ts.
// =====================================================================
export const substituteRequests = pgTable(
  "substitute_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    /** The team the sub plays for. */
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    substitutePersonId: uuid("substitute_person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    /** requested | accepted | declined | cancelled | expired */
    status: text("status").notNull().default("requested"),
    /** free_agent | league_player: why the player was eligible. */
    source: text("source"),
    /** True when a league admin assigned the sub directly (UC-31 alt flow). */
    rosterOverride: boolean("roster_override").notNull().default(false),
    note: text("note"),
    /** Why the system or captain cancelled it (kernel SUB_CANCEL_REASONS key). */
    cancelReason: text("cancel_reason"),
    requestedByUserId: uuid("requested_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    decidedByUserId: uuid("decided_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** The guest row written on accept or assign. */
    attendanceId: uuid("attendance_id").references(() => gameAttendance.id, {
      onDelete: "set null"
    }),
    /** Append-only confirmation log: [{ at, status, byUserId, note }]. */
    log: jsonb("log").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    statusCheck: check(
      "substitute_request_status_check",
      sql`${t.status} IN ('requested','accepted','declined','cancelled','expired')`
    ),
    sourceCheck: check(
      "substitute_request_source_check",
      sql`${t.source} IS NULL OR ${t.source} IN ('free_agent','league_player')`
    ),
    // One open request per player per game: a double click, or both
    // teams asking the same player, cannot open two.
    openUniq: uniqueIndex("substitute_request_open_uniq")
      .on(t.gameId, t.substitutePersonId)
      .where(sql`${t.status} = 'requested'`),
    gameIdx: index("substitute_request_game_idx").on(t.gameId, t.teamId),
    personIdx: index("substitute_request_person_idx").on(t.substitutePersonId, t.status)
  })
);

export const substituteSubscriptions = pgTable("substitute_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  regionId: uuid("region_id").notNull().references(() => regions.id, { onDelete: "cascade" }),
  positions: text("positions").array().notNull(), enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({ unique: uniqueIndex("substitute_subscriptions_person_id_region_id_key").on(t.personId, t.regionId),
  match: index("substitute_subscription_match_idx").on(t.orgId, t.regionId).where(sql`${t.enabled}`),
  positions: check("substitute_subscriptions_positions_check", sql`cardinality(${t.positions}) BETWEEN 1 AND 5 AND ${t.positions} <@ ARRAY['C','LW','RW','D','G']::text[]`),
}));

export const substituteBroadcasts = pgTable("substitute_broadcasts", {
  id: uuid("id").primaryKey().defaultRandom(), requestKey: uuid("request_key").notNull().unique("substitute_broadcasts_request_key_key"),
  gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  seasonId: uuid("season_id").notNull().references(() => seasons.id, { onDelete: "cascade" }),
  regionId: uuid("region_id").notNull().references(() => regions.id, { onDelete: "restrict" }),
  position: text("position").notNull(), needed: smallint("needed").notNull(), filled: smallint("filled").notNull().default(0),
  note: text("note").notNull().default(""), status: text("status").notNull().default("pending_review"),
  requestedByUserId: uuid("requested_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }), reviewNote: text("review_note"),
  reviewSequence: integer("review_sequence").notNull().default(0), closedReason: text("closed_reason"),
  closedAt: timestamp("closed_at", { withTimezone: true }), log: jsonb("log").notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({ open: uniqueIndex("substitute_broadcast_open_idx").on(t.gameId, t.teamId).where(sql`${t.status} IN ('pending_review','approved')`),
  season: index("substitute_broadcast_season_idx").on(t.seasonId, t.status),
  position: check("substitute_broadcasts_position_check", sql`${t.position} IN ('goalie','skater','any')`),
  needed: check("substitute_broadcasts_needed_check", sql`${t.needed} BETWEEN 1 AND 10`),
  filled: check("substitute_broadcasts_filled_check", sql`${t.filled} >= 0 AND ${t.filled} <= ${t.needed}`),
  note: check("substitute_broadcasts_note_check", sql`length(${t.note})<=500`),
  reviewNote: check("substitute_broadcasts_review_note_check", sql`${t.reviewNote} IS NULL OR length(${t.reviewNote})<=500`),
  reviewSequence: check("substitute_broadcasts_review_sequence_check", sql`${t.reviewSequence}>=0`),
  log: check("substitute_broadcasts_log_check", sql`jsonb_typeof(${t.log})='array'`),
  status: check("substitute_broadcasts_status_check", sql`${t.status} IN ('pending_review','approved','rejected','cancelled','filled')`),
}));

export const substituteBroadcastRecipients = pgTable("substitute_broadcast_recipients", {
  id: uuid("id").primaryKey().defaultRandom(),
  broadcastId: uuid("broadcast_id").notNull().references(() => substituteBroadcasts.id, { onDelete: "cascade" }),
  personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("invited"),
  attendanceId: uuid("attendance_id").references(() => gameAttendance.id, { onDelete: "set null" }),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
}, t => ({ unique: uniqueIndex("substitute_broadcast_recipients_broadcast_id_person_id_key").on(t.broadcastId, t.personId),
  person: index("substitute_broadcast_person_idx").on(t.personId, t.status),
  status: check("substitute_broadcast_recipients_status_check", sql`${t.status} IN ('invited','accepted','declined','closed','withdrawn')`),
}));
