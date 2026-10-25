import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { sortSeasonsByCurrency } from "@sportspulse/kernel";

/**
 * Seasons a team is live in (entry applied / accepted / confirmed), most
 * current first per `sortSeasonsByCurrency` in @sportspulse/kernel: in
 * progress today, else registration open now, else newest. One rule for
 * the captain roster (CAP-8), the coach roster and the player's team page
 * (CAP-19), so they never show different seasons.
 */
export async function teamLiveSeasons(db: Database, teamId: string) {
  const rows = await db
    .selectDistinctOn([schema.seasons.id], {
      seasonId: schema.seasons.id,
      season: schema.seasons
    })
    .from(schema.divisionTeamEntries)
    .innerJoin(schema.divisions, eq(schema.divisions.id, schema.divisionTeamEntries.divisionId))
    .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
    .where(
      and(
        eq(schema.divisionTeamEntries.teamId, teamId),
        inArray(schema.divisionTeamEntries.entryStatus, ["applied", "accepted", "confirmed"])
      )
    )
    .orderBy(schema.seasons.id, desc(schema.seasons.startDate));
  return sortSeasonsByCurrency(rows.map((r) => r.season));
}
