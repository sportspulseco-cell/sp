import { sql } from "drizzle-orm";
import {
  boolean,
  pgTable,
  uuid,
  text,
  smallint,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check,
  foreignKey
} from "drizzle-orm/pg-core";
import { inet } from "./_helpers";
import { authUsers } from "./auth";
import { sports } from "./reference";
import { persons } from "./iam";
import { divisions, leagues, teams } from "./league";

// =====================================================================
// GAMES — minimal seed; scheduling module will extend with venue/slot
// =====================================================================
export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    divisionId: uuid("division_id").references(() => divisions.id, {
      onDelete: "set null"
    }),
    homeTeamId: uuid("home_team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    awayTeamId: uuid("away_team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    sportCode: text("sport_code")
      .notNull()
      .references(() => sports.code),
    scheduledStartTsUtc: timestamp("scheduled_start_ts_utc", {
      withTimezone: true
    }).notNull(),
    tz: text("tz").notNull().default("UTC"),
    durationMin: smallint("duration_min").notNull().default(60),
    venueName: text("venue_name"),
    surfaceLabel: text("surface_label"),
    status: text("status").notNull().default("scheduled"),
    /** Workflow 7C — regular | playoff | exhibition. Drives the playoff
     *  attendance eligibility guard in §4.1. */
    gameType: text("game_type").notNull().default("regular"),
    homeScore: smallint("home_score").notNull().default(0),
    awayScore: smallint("away_score").notNull().default(0),
    period: smallint("period").notNull().default(0),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    finalizedByUserId: uuid("finalized_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    )
  },
  (t) => ({
    statusCheck: check(
      "game_status_check",
      sql`${t.status} IN ('scheduled','in_play','completed','postponed','cancelled','forfeited')`
    ),
    gameTypeCheck: check(
      "game_type_check",
      sql`${t.gameType} IN ('regular','playoff','exhibition')`
    ),
    notSelf: check(
      "game_not_self",
      sql`${t.homeTeamId} <> ${t.awayTeamId}`
    ),
    leagueIdx: index("game_league_idx").on(t.leagueId),
    divisionIdx: index("game_division_idx").on(t.divisionId),
    homeIdx: index("game_home_idx").on(t.homeTeamId, t.scheduledStartTsUtc),
    awayIdx: index("game_away_idx").on(t.awayTeamId, t.scheduledStartTsUtc),
    statusIdx: index("game_status_idx").on(t.status),
    scheduleIdx: index("game_schedule_idx").on(t.scheduledStartTsUtc)
  })
);

// =====================================================================
// GAME EVENTS — append-only event log (the source of truth)
// =====================================================================
export const gameEvents = pgTable(
  "game_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    sportCode: text("sport_code")
      .notNull()
      .references(() => sports.code),
    eventType: text("event_type").notNull(),
    tsUtc: timestamp("ts_utc", { withTimezone: true })
      .notNull()
      .defaultNow(),
    period: smallint("period"),
    clockRemainingSec: integer("clock_remaining_sec"),
    teamId: uuid("team_id").references(() => teams.id, {
      onDelete: "set null"
    }),
    primaryPersonId: uuid("primary_person_id").references(() => persons.id, {
      onDelete: "set null"
    }),
    secondaryPersonIds: jsonb("secondary_person_ids")
      .notNull()
      .default(sql`'[]'::jsonb`),
    attributes: jsonb("attributes").notNull().default(sql`'{}'::jsonb`),
    source: text("source").notNull().default("scorekeeper_app"),
    sourceDeviceId: text("source_device_id"),
    idempotencyKey: text("idempotency_key").unique(),
    correctionOfEventId: uuid("correction_of_event_id"),
    loggedByUserId: uuid("logged_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    sourceCheck: check(
      "game_event_source_check",
      sql`${t.source} IN ('scorekeeper_app','ref_amend','video_review','import','system')`
    ),
    correctionFk: foreignKey({
      columns: [t.correctionOfEventId],
      foreignColumns: [t.id],
      name: "game_events_correction_fk"
    }).onDelete("set null"),
    gameIdx: index("game_event_game_idx").on(t.gameId, t.tsUtc),
    typeIdx: index("game_event_type_idx").on(t.eventType),
    personIdx: index("game_event_person_idx").on(t.primaryPersonId)
  })
);

// =====================================================================
// GAME ATTENDANCE — pre-game check-in
// =====================================================================
export const gameAttendance = pgTable(
  "game_attendance",
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
    status: text("status").notNull().default("present"),
    jerseyNumberUsed: smallint("jersey_number_used"),
    positionPlayed: text("position_played"),
    minutesPlayed: integer("minutes_played"),
    /** Workflow 7B · Case 7 — substitute / call-up for one game only. */
    isGuest: boolean("is_guest").notNull().default(false),
    /** When guesting, the player's primary team (for tracking). */
    guestHomeTeamId: uuid("guest_home_team_id").references(() => teams.id, {
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
      "attendance_status_check",
      sql`${t.status} IN ('present','absent','late','sub','scratched')`
    ),
    uniqGamePerson: uniqueIndex("attendance_uniq").on(t.gameId, t.personId),
    gameIdx: index("attendance_game_idx").on(t.gameId)
  })
);

// =====================================================================
// SUSPENSIONS — discipline tracking
// =====================================================================
export const suspensions = pgTable(
  "suspensions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    sourceEventId: uuid("source_event_id").references(() => gameEvents.id, {
      onDelete: "set null"
    }),
    kind: text("kind").notNull(),
    nGames: smallint("n_games"),
    nDays: smallint("n_days"),
    servedCount: smallint("served_count").notNull().default(0),
    status: text("status").notNull().default("active"),
    reason: text("reason"),
    startAt: timestamp("start_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endAt: timestamp("end_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    issuedByUserId: uuid("issued_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    })
  },
  (t) => ({
    kindCheck: check(
      "suspension_kind_check",
      sql`${t.kind} IN ('n_games','n_days','indefinite','time_bounded')`
    ),
    statusCheck: check(
      "suspension_status_check",
      sql`${t.status} IN ('active','served','lifted','appealed')`
    ),
    personIdx: index("suspension_person_idx").on(t.personId, t.status),
    sourceIdx: index("suspension_source_idx").on(t.sourceEventId)
  })
);

// =====================================================================
// SCORESHEET SIGNATURES — ref/coach finalization
// =====================================================================
export const scoresheetSignatures = pgTable(
  "scoresheet_signatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    signerUserId: uuid("signer_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddr: inet("ip_addr"),
    userAgent: text("user_agent"),
    signatureBlobUrl: text("signature_blob_url"),
    digestHash: text("digest_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    roleCheck: check(
      "scoresheet_role_check",
      sql`${t.role} IN ('home_coach','away_coach','head_ref','linesman','scorekeeper','timekeeper')`
    ),
    uniqGameSigner: uniqueIndex("scoresheet_uniq").on(
      t.gameId,
      t.signerUserId,
      t.role
    ),
    gameIdx: index("scoresheet_game_idx").on(t.gameId)
  })
);
