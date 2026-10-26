import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";
import { persons } from "./iam";
import { seasons, teams } from "./league";
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
