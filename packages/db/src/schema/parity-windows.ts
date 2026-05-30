import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  date,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";
import { seasons } from "./league";
import { scheduleRuns } from "./scheduling";

// =====================================================================
// PARITY WINDOWS — 2-week parity review cadence (pain #6).
//
// PPHL runs a 2-week parity window: teams play for 2 weeks, then
// admins decide whether each team should move up / stay / down based
// on performance. Avario doesn't model this; mid-season moves create
// orphaned fixtures. SportsPulse:
//   1. Auto-opens windows every N weeks (cron).
//   2. Computes per-team recommendations from standings.
//   3. Admin reviews + confirms moves.
//   4. Apply: swap division entries, delete affected unlocked-future
//      games (preserves locked + already-played), trigger regen.
// =====================================================================

export const parityWindows = pgTable(
  "parity_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    /** 1-based; first window of season = 1. */
    windowIndex: integer("window_index").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    /** When admin review should be done by — drives reminders. */
    reviewDueDate: date("review_due_date"),
    /** pending | review_open | applied | skipped | archived */
    state: text("state").notNull().default("pending"),
    /** Computed recommendations:
     *  [{teamId, teamName, currentDivisionId, currentDivisionName,
     *    currentTier, recommendation, reasoning, targetDivisionId?}]
     */
    recommendations: jsonb("recommendations")
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Admin's confirmed decisions:
     *  [{teamId, targetDivisionId, decidedAt, decidedByUserId}]
     */
    decisions: jsonb("decisions").notNull().default(sql`'[]'::jsonb`),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    appliedByUserId: uuid("applied_by_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    scheduleRunId: uuid("schedule_run_id").references(() => scheduleRuns.id, {
      onDelete: "set null"
    }),
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
      "parity_window_state_check",
      sql`${t.state} IN ('pending','review_open','applied','skipped','archived')`
    ),
    datesCheck: check(
      "parity_window_dates_check",
      sql`${t.endDate} >= ${t.startDate}`
    ),
    seasonIndexUniq: uniqueIndex("parity_window_season_index_uniq").on(
      t.seasonId,
      t.windowIndex
    ),
    stateIdx: index("parity_window_state_idx").on(t.state)
  })
);
