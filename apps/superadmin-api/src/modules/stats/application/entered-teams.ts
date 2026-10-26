import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { SCHEDULABLE_ENTRY_STATUSES, type EnteredTeam } from "@sportspulse/kernel";

type Exec = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Teams entered in a league's divisions (live entry: not left, status
 * applied, accepted or confirmed). Standings list each of them from day
 * one, at zero until they play (F-4). Narrow by league, by divisions, or
 * both.
 */
export async function enteredTeams(
  db: Exec,
  where: { leagueId?: string; divisionIds?: string[] }
): Promise<EnteredTeam[]> {
  if (where.divisionIds && where.divisionIds.length === 0) return [];
  const cs = [
    isNull(schema.divisionTeamEntries.leftAt),
    inArray(schema.divisionTeamEntries.entryStatus, [...SCHEDULABLE_ENTRY_STATUSES]),
    isNull(schema.teams.deletedAt)
  ];
  if (where.leagueId) cs.push(eq(schema.seasons.leagueId, where.leagueId));
  if (where.divisionIds) cs.push(inArray(schema.divisionTeamEntries.divisionId, where.divisionIds));
  return db
    .select({
      divisionId: schema.divisionTeamEntries.divisionId,
      teamId: schema.divisionTeamEntries.teamId,
      teamName: schema.teams.name
    })
    .from(schema.divisionTeamEntries)
    .innerJoin(schema.divisions, eq(schema.divisions.id, schema.divisionTeamEntries.divisionId))
    .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
    .innerJoin(schema.teams, eq(schema.teams.id, schema.divisionTeamEntries.teamId))
    .where(and(...cs));
}
