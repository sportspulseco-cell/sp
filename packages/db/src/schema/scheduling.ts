import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  smallint,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";
import { orgs } from "./iam";
import { seasons, divisions } from "./league";
import { games } from "./game";

// =====================================================================
// SCHEDULING — venue/slot inventory + scheduler provenance.
//
// This is the data foundation the constraint engine (greedy v1 →
// CP-SAT) solves against, and the provenance store that makes every
// placement defensible (see doc/avario-reverse-engineering/
// scheduler-debate/00-synthesis-and-final-plan.md, layers 3 & 5).
//
// Model: a VENUE (facility) has one or more SURFACES (sheets/rinks).
// An ICE_SLOT is a bookable (surface × start × duration) unit of
// inventory. The scheduler assigns fixtures (team pairings) to slots;
// a `games` row points at the slot it occupies. One game per slot is a
// hard DB invariant (the no-double-booking guarantee — pain log #9).
// =====================================================================

// ---------------------------------------------------------------------
// VENUES — a facility (e.g. "Bog Ice Arena"). Org-scoped.
// ---------------------------------------------------------------------
export const venues = pgTable(
  "venues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** { line1, line2?, city, region, postalCode, countryCode, lat?, lng? } */
    address: jsonb("address").notNull().default(sql`'{}'::jsonb`),
    timezone: text("timezone").notNull().default("UTC"),
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
    orgIdx: index("venue_org_idx").on(t.orgId)
  })
);

// ---------------------------------------------------------------------
// SURFACES — a sheet/rink within a venue (e.g. "Rink 1", "Blue Sheet").
// Avario surfaces present as "Bog Ice Arena - Rink 1".
// ---------------------------------------------------------------------
export const surfaces = pgTable(
  "surfaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
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
    venueIdx: index("surface_venue_idx").on(t.venueId),
    uniqVenueLabel: uniqueIndex("surface_venue_label_uniq").on(
      t.venueId,
      t.label
    )
  })
);

// ---------------------------------------------------------------------
// ICE_SLOTS — bookable inventory: one (surface × start × duration).
//
// `band` is denormalised from the season's time_slot_bands config so
// the fairness pass (pain #8) can group by band without recomputing.
// `isPlayoffReservation` blocks the slot from regular-season generation
// (pain #3 — playoff ice reserved up front). `hourlyCostCents` is
// per-slot so peak/off-peak pricing is representable (Avario Payment).
// ---------------------------------------------------------------------
export const iceSlots = pgTable(
  "ice_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surfaceId: uuid("surface_id")
      .notNull()
      .references(() => surfaces.id, { onDelete: "cascade" }),
    /** NULL = unallocated inventory not yet tied to a season. */
    seasonId: uuid("season_id").references(() => seasons.id, {
      onDelete: "set null"
    }),
    startTsUtc: timestamp("start_ts_utc", { withTimezone: true }).notNull(),
    durationMin: smallint("duration_min").notNull().default(60),
    tz: text("tz").notNull().default("UTC"),
    /** early | mid | late — derived from season time_slot_bands; nullable. */
    band: text("band"),
    hourlyCostCents: integer("hourly_cost_cents").notNull().default(0),
    isPlayoffReservation: boolean("is_playoff_reservation")
      .notNull()
      .default(false),
    status: text("status").notNull().default("available"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    statusCheck: check(
      "ice_slot_status_check",
      sql`${t.status} IN ('available','assigned','blocked','returned')`
    ),
    bandCheck: check(
      "ice_slot_band_check",
      sql`${t.band} IS NULL OR ${t.band} IN ('early','mid','late')`
    ),
    surfaceIdx: index("ice_slot_surface_idx").on(t.surfaceId, t.startTsUtc),
    seasonIdx: index("ice_slot_season_idx").on(t.seasonId),
    statusIdx: index("ice_slot_status_idx").on(t.status),
    // No two slots may start at the same instant on one surface — the
    // inventory-level half of the no-double-booking guarantee. True
    // interval overlap is enforced by the engine + Z3 audit layer.
    uniqSurfaceStart: uniqueIndex("ice_slot_surface_start_uniq").on(
      t.surfaceId,
      t.startTsUtc
    )
  })
);

// ---------------------------------------------------------------------
// SCHEDULE_RUNS — one row per generation/regeneration invocation.
//
// Decision (2026-05-27): we STORE THE FULL SOLUTION + seed + inputHash
// here so re-explanation reads the stored result rather than re-solving
// — CP-SAT may run multi-worker (non-reproducible), so determinism is
// achieved by persistence, not by pinning the solver. (synthesis doc,
// Fight #3 + locked decision #4.)
// ---------------------------------------------------------------------
export const scheduleRuns = pgTable(
  "schedule_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    /** NULL = season-wide run; otherwise scoped to one division. */
    divisionId: uuid("division_id").references(() => divisions.id, {
      onDelete: "set null"
    }),
    engine: text("engine").notNull().default("cpsat"),
    seed: text("seed").notNull(),
    /** SHA-256 of the serialised solve input (teams + slots + constraints). */
    inputHash: text("input_hash").notNull(),
    /** Full constraint set at solve time — reproducibility + audit. */
    constraintSnapshot: jsonb("constraint_snapshot")
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** The full solver solution: { assignments: [...], ... }. Decision #4. */
    solution: jsonb("solution").notNull().default(sql`'{}'::jsonb`),
    /** { timeslotFairnessDeviation, homeAwayImbalance, gapImbalance, ... } */
    objectiveBreakdown: jsonb("objective_breakdown")
      .notNull()
      .default(sql`'{}'::jsonb`),
    gamesCreated: integer("games_created").notNull().default(0),
    gamesLockedPreserved: integer("games_locked_preserved")
      .notNull()
      .default(0),
    status: text("status").notNull().default("queued"),
    /** Populated when status is failed|partial — the UNSAT/infeasibility report. */
    infeasibilityReport: jsonb("infeasibility_report"),
    durationMs: integer("duration_ms"),
    ranByUserId: uuid("ran_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    engineCheck: check(
      "schedule_run_engine_check",
      sql`${t.engine} IN ('cpsat','greedy')`
    ),
    statusCheck: check(
      "schedule_run_status_check",
      sql`${t.status} IN ('queued','running','completed','failed','partial')`
    ),
    seasonIdx: index("schedule_run_season_idx").on(t.seasonId),
    divisionIdx: index("schedule_run_division_idx").on(t.divisionId),
    statusIdx: index("schedule_run_status_idx").on(t.status)
  })
);

// ---------------------------------------------------------------------
// GAME_PROVENANCE — per-game placement trail (1:1 with games).
//
// "The schedule's primary output is a defensible justification for
// every cell of it." Every game records which pass placed it, which
// constraints drove the placement, which alternatives were rejected
// and why, and whether a human overrode the engine. (Anthropic memo.)
// ---------------------------------------------------------------------
export const gameProvenance = pgTable(
  "game_provenance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    scheduleRunId: uuid("schedule_run_id").references(() => scheduleRuns.id, {
      onDelete: "set null"
    }),
    placementPass: text("placement_pass").notNull(),
    /** Identifiers of the constraints that drove this placement. */
    constraintIds: jsonb("constraint_ids").notNull().default(sql`'[]'::jsonb`),
    /** Up to N rejected alternative slots, each with a rejection_reason. */
    candidateSlots: jsonb("candidate_slots")
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** If moved by the fairness pass: { teamId, band, beforePct, afterPct }. */
    balancingDelta: jsonb("balancing_delta"),
    humanActorId: uuid("human_actor_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    overrideReason: text("override_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    placementPassCheck: check(
      "game_provenance_pass_check",
      sql`${t.placementPass} IN (
        'initial_assignment','balancing','conflict_resolution',
        'manual_import','manual_override','locked_import','bracket'
      )`
    ),
    uniqGame: uniqueIndex("game_provenance_game_uniq").on(t.gameId),
    runIdx: index("game_provenance_run_idx").on(t.scheduleRunId)
  })
);
