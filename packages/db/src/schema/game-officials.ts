import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
  check
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";
import { persons } from "./iam";
import { games } from "./game";

// =====================================================================
// GAME_OFFICIALS — assignment of refs / scorekeepers / linesmen to a game
// One row per (gameId, role, personId) — re-assigning the same role to
// a different person creates a new row and supersedes the prior via
// `revokedAt`.
// =====================================================================
export const gameOfficials = pgTable(
  "game_officials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    /**
     * referee | linesman | scorekeeper | timekeeper | video_review |
     * commissioner | other
     */
    role: text("role").notNull(),
    /** crew slot, e.g. "head", "linesman_1", "linesman_2" — optional. */
    slot: text("slot"),
    /** confirmed | tentative | declined */
    status: text("status").notNull().default("confirmed"),
    assignedByUserId: uuid("assigned_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    notes: text("notes"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    statusCheck: check(
      "game_official_status_check",
      sql`${t.status} IN ('confirmed','tentative','declined')`
    ),
    gameIdx: index("game_official_game_idx").on(t.gameId),
    personIdx: index("game_official_person_idx").on(t.personId),
    activeUniq: uniqueIndex("game_official_active_uniq")
      .on(t.gameId, t.role, t.slot, t.personId)
      .where(sql`${t.revokedAt} IS NULL`)
  })
);
