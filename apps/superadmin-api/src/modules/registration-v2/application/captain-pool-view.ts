/** Recruiting is mediated by offers. Never expose contact data or arbitrary
 * profile metadata/free text to a captain just because they can browse a pool. */
import {freeAgentAvailableDays} from "@sportspulse/kernel";
const RECRUITING_FIELDS=["id","playerPersonId","seasonId","seasonName","positions","levelPrimary","levelFlexibility","noShowRate","status","placedTeamId","placedAt","createdAt","updatedAt","playerName"] as const;
export function captainPoolView<T extends {
  playerEmail: string | null; playerDob: string | null;
  metadata: Record<string, unknown>; note: string | null;
  availability:Record<string,unknown>;
}>(entry: T) {
  // An allowlist also protects future internal fields added to the source row.
  const fields=Object.fromEntries(RECRUITING_FIELDS.map(key=>[key,(entry as Record<string,unknown>)[key]])) as Pick<T,Extract<keyof T,typeof RECRUITING_FIELDS[number]>>;
  return { ...fields, availability:Object.fromEntries(freeAgentAvailableDays(entry.availability).map(day=>[day,true])),playerEmail: null, playerDob: null, metadata: {}, note: null };
}
