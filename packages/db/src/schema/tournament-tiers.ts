import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check
} from "drizzle-orm/pg-core";
import { seasons } from "./league";
import { teams } from "./league";

// =====================================================================
// TOURNAMENT ROUNDS + DYNAMIC TIER ASSIGNMENTS (pain #4 — Johnny's ask).
//
// Tournament mode: each round teams are placed into upper / middle /
// lower tiers. After a round completes, the round-advance action
// evaluates each team's W/L within their tier and promotes/relegates
// them into the next round's tiers. Fixtures for the next round
// generate against the new tier assignments.
//
// Avario has no such concept — Johnny raised this on the discovery
// call as the missing piece.
// =====================================================================

export const tournamentRounds = pgTable(
  "tournament_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    /** 1-based; first round = 1. */
    roundIndex: integer("round_index").notNull(),
    /** Optional admin-friendly label e.g. "Quarter-finals". */
    label: text("label"),
    /** pending | active | complete | archived */
    state: text("state").notNull().default("pending"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    stateCheck: check(
      "tournament_round_state_check",
      sql`${t.state} IN ('pending','active','complete','archived')`
    ),
    seasonIndexUniq: uniqueIndex("tournament_round_uniq").on(
      t.seasonId,
      t.roundIndex
    ),
    stateIdx: index("tournament_round_state_idx").on(t.state)
  })
);

export const tournamentTierAssignments = pgTable(
  "tournament_tier_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => tournamentRounds.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    /** upper | middle | lower */
    tier: text("tier").notNull(),
    /** Human-readable reason — populated by round-advance. */
    reasoning: text("reasoning"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    tierCheck: check(
      "tournament_tier_check",
      sql`${t.tier} IN ('upper','middle','lower')`
    ),
    roundTeamUniq: uniqueIndex("tournament_tier_round_team_uniq").on(
      t.roundId,
      t.teamId
    ),
    teamIdx: index("tournament_tier_team_idx").on(t.teamId)
  })
);
