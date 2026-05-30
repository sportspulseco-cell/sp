import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
  check
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";
import { seasons } from "./league";
import { divisions } from "./league";

// =====================================================================
// PLAYOFF BRACKETS — single-elim brackets driven by standings (pain #3).
//
// Avario requires manual workarounds to publish playoffs and offers no
// auto-advancement when a result is entered. SportsPulse:
//   1. Playoff ice is reserved up front via ice_slots.is_playoff_reservation
//   2. One-click bracket generation from standings seeds round 1 into
//      those reserved slots.
//   3. bracket-advance fires when a result is entered and creates the
//      next-round game in the next slot.
//
// `slots` shape (jsonb):
//   [{
//     round: 1, position: 0,
//     iceSlotId: uuid, startTsUtc: iso, surfaceLabel, venueName,
//     gameId: uuid | null,
//     seedA: 1, seedB: 8,
//     teamAId: uuid | null, teamBId: uuid | null,
//     winnerTeamId: uuid | null,
//     nextSlotPosition: 0, nextSlotSide: "A"
//   }, ...]
//
// `seed_map` shape: ordered teamIds for seeds 1..N.
// =====================================================================

export const playoffBrackets = pgTable(
  "playoff_brackets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    divisionId: uuid("division_id").references(() => divisions.id, {
      onDelete: "cascade"
    }),
    /** single_elim | double_elim | round_robin_consolation */
    format: text("format").notNull().default("single_elim"),
    /** pending | active | complete | archived */
    state: text("state").notNull().default("pending"),
    seedMap: jsonb("seed_map").notNull().default(sql`'[]'::jsonb`),
    slots: jsonb("slots").notNull().default(sql`'[]'::jsonb`),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    generatedByUserId: uuid("generated_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    formatCheck: check(
      "playoff_bracket_format_check",
      sql`${t.format} IN ('single_elim','double_elim','round_robin_consolation')`
    ),
    stateCheck: check(
      "playoff_bracket_state_check",
      sql`${t.state} IN ('pending','active','complete','archived')`
    ),
    seasonIdx: index("playoff_bracket_season_idx").on(t.seasonId),
    divisionIdx: index("playoff_bracket_division_idx").on(t.divisionId),
    stateIdx: index("playoff_bracket_state_idx").on(t.state)
  })
);
