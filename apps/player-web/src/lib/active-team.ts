import { cookies } from "next/headers";

const COOKIE_NAME = "sp_active_team";

/**
 * The team the console works on. A captain can hold several teams (a
 * captain registers more than one team in a season; PPHL does this),
 * and every captain page used to read `scope.teamIds[0]`, so the second
 * team could not be reached. The choice lives in a cookie, as the org
 * console's active organization does; a value outside the user's teams
 * is ignored and the first team wins.
 */
export async function getActiveTeamId(
  scope: { teamIds: string[] } | null | undefined
): Promise<string | null> {
  if (!scope || scope.teamIds.length === 0) return null;
  const store = await cookies();
  const fromCookie = store.get(COOKIE_NAME)?.value;
  if (fromCookie && scope.teamIds.includes(fromCookie)) return fromCookie;
  return scope.teamIds[0] ?? null;
}

export const ACTIVE_TEAM_COOKIE = COOKIE_NAME;
