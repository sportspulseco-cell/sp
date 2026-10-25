import type { Database } from "@sportspulse/db";
import { resolveEntityNames } from "../../../shared/display/entity-names";

/**
 * Transfer rows with the player's and both teams' names, so no list
 * prints raw ids. Shared by the admin queue and the captain lists.
 */
export async function withTransferNames<T extends { personId: string; fromTeamId: string; toTeamId: string }>(
  db: Database,
  items: T[]
): Promise<Array<T & { personName: string | null; fromTeamName: string | null; toTeamName: string | null }>> {
  const names = await resolveEntityNames(db, [
    ...items.map((t) => ({ type: "person", id: t.personId })),
    ...items.map((t) => ({ type: "team", id: t.fromTeamId })),
    ...items.map((t) => ({ type: "team", id: t.toTeamId }))
  ]);
  return items.map((t) => ({
    ...t,
    personName: names.get(`person:${t.personId}`) ?? null,
    fromTeamName: names.get(`team:${t.fromTeamId}`) ?? null,
    toTeamName: names.get(`team:${t.toTeamId}`) ?? null
  }));
}
