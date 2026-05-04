import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  smallint,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";
import { persons } from "./iam";
import { seasons, teams } from "./league";

// =====================================================================
// ROSTER MOVES — append-only event log (the source of truth)
// =====================================================================
export const rosterMoves = pgTable(
  "roster_moves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    moveType: text("move_type").notNull(),
    membershipType: text("membership_type").notNull().default("primary"),
    effectiveAt: timestamp("effective_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    jerseyNumber: smallint("jersey_number"),
    positionCode: text("position_code"),
    reason: text("reason"),
    sourceEventId: text("source_event_id"), // idempotency key
    createdByUserId: uuid("created_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    moveTypeCheck: check(
      "roster_move_type_check",
      sql`${t.moveType} IN ('add','drop','trade_in','trade_out','call_up','send_down','release','reinstate')`
    ),
    membershipTypeCheck: check(
      "roster_membership_type_check",
      sql`${t.membershipType} IN ('primary','play_up','affiliate','call_up')`
    ),
    teamSeasonIdx: index("roster_move_team_season_idx").on(
      t.teamId,
      t.seasonId,
      t.effectiveAt
    ),
    personSeasonIdx: index("roster_move_person_season_idx").on(
      t.personId,
      t.seasonId,
      t.effectiveAt
    ),
    sourceEventIdx: uniqueIndex("roster_move_source_event_uniq")
      .on(t.sourceEventId)
      .where(sql`${t.sourceEventId} IS NOT NULL`)
  })
);

// =====================================================================
// TEAM MEMBERSHIPS — projection of roster_moves (current/effective state)
// Rebuildable from rosterMoves; we keep it materialized for query speed.
// =====================================================================
export const teamMemberships = pgTable(
  "team_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    membershipType: text("membership_type").notNull().default("primary"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    jerseyNumber: smallint("jersey_number"),
    positionCode: text("position_code"),
    currentStatus: text("current_status").notNull().default("active"),
    lastMoveId: uuid("last_move_id").references(() => rosterMoves.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    statusCheck: check(
      "team_membership_status_check",
      sql`${t.currentStatus} IN ('active','released','suspended','ineligible')`
    ),
    membershipTypeCheck: check(
      "team_membership_type_check",
      sql`${t.membershipType} IN ('primary','play_up','affiliate','call_up')`
    ),
    // Allow multiple memberships per (team, person, season) when historical;
    // current-active membership uniqueness enforced by partial index.
    uniqActive: uniqueIndex("team_membership_active_uniq")
      .on(t.teamId, t.personId, t.seasonId)
      .where(sql`${t.effectiveTo} IS NULL`),
    teamSeasonIdx: index("team_membership_team_season_idx").on(
      t.teamId,
      t.seasonId
    ),
    personSeasonIdx: index("team_membership_person_season_idx").on(
      t.personId,
      t.seasonId
    ),
    // Jersey number uniqueness within an active roster
    uniqJerseyActive: uniqueIndex("team_membership_jersey_uniq")
      .on(t.teamId, t.seasonId, t.jerseyNumber)
      .where(sql`${t.effectiveTo} IS NULL AND ${t.jerseyNumber} IS NOT NULL`)
  })
);
