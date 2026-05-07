import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { and, eq, inArray, isNull } from "drizzle-orm";

/**
 * Resolved access scope for the current principal.
 *
 * `null` for any field means *unrestricted* (super_admin or platform-scoped):
 * handlers should apply no filter. A non-null array is a hard whitelist; an
 * empty array means the principal has zero visibility for that dimension.
 *
 * Projection rules:
 *   - org-scoped role  → that org + every league owned by it
 *   - league-scoped    → that league + its parent org
 *   - team-scoped      → that team + its parent org (read-only access for the
 *                        team_admin / coach / player apps)
 *
 * Updated 2026-05-07 — added `teamIds` so the team-targeted apps
 * (team-admin-web, player-web) can hit existing scoped endpoints
 * without a full role-and-scope DSL migration.
 */
export interface UserScope {
  isSuperAdmin: boolean;
  leagueIds: string[] | null;
  orgIds: string[] | null;
  teamIds: string[] | null;
}

export async function loadUserScope(
  db: Database,
  userId: string
): Promise<UserScope> {
  const [profile] = await db
    .select({ isSuperAdmin: schema.profiles.isSuperAdmin })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, userId))
    .limit(1);

  if (profile?.isSuperAdmin) {
    return { isSuperAdmin: true, leagueIds: null, orgIds: null, teamIds: null };
  }

  const rows = await db
    .select({
      scopeType: schema.userRoleAssignments.scopeType,
      scopeId: schema.userRoleAssignments.scopeId
    })
    .from(schema.userRoleAssignments)
    .where(
      and(
        eq(schema.userRoleAssignments.userId, userId),
        isNull(schema.userRoleAssignments.revokedAt)
      )
    );

  // Platform-scoped roles widen visibility beyond per-org/per-league filtering.
  if (rows.some((r) => r.scopeType === "platform")) {
    return { isSuperAdmin: false, leagueIds: null, orgIds: null, teamIds: null };
  }

  const directOrgIds = rows
    .filter((r) => r.scopeType === "org" && r.scopeId)
    .map((r) => r.scopeId as string);
  const directLeagueIds = rows
    .filter((r) => r.scopeType === "league" && r.scopeId)
    .map((r) => r.scopeId as string);
  const directTeamIds = rows
    .filter((r) => r.scopeType === "team" && r.scopeId)
    .map((r) => r.scopeId as string);

  // Project org-scoped assignments → every league owned by the org.
  let projectedLeagueIds: string[] = [];
  if (directOrgIds.length > 0) {
    const ls = await db
      .select({ id: schema.leagues.id })
      .from(schema.leagues)
      .where(inArray(schema.leagues.orgId, directOrgIds));
    projectedLeagueIds = ls.map((r) => r.id);
  }

  // Project league-scoped assignments → the org each league belongs to.
  let projectedOrgIdsFromLeagues: string[] = [];
  if (directLeagueIds.length > 0) {
    const os = await db
      .selectDistinct({ orgId: schema.leagues.orgId })
      .from(schema.leagues)
      .where(inArray(schema.leagues.id, directLeagueIds));
    projectedOrgIdsFromLeagues = os.map((r) => r.orgId);
  }

  // Project team-scoped assignments → the org owning each team. Teams sit
  // under orgs directly (per the 2026-05-09 hierarchy flip), so a team
  // scope grants read-only access to that org's data, scope-filtered
  // further by `teamIds` when handlers care about per-team narrowing.
  let projectedOrgIdsFromTeams: string[] = [];
  if (directTeamIds.length > 0) {
    const os = await db
      .selectDistinct({ orgId: schema.teams.orgId })
      .from(schema.teams)
      .where(inArray(schema.teams.id, directTeamIds));
    projectedOrgIdsFromTeams = os.map((r) => r.orgId);
  }

  const leagueIds = Array.from(
    new Set([...directLeagueIds, ...projectedLeagueIds])
  );
  const orgIds = Array.from(
    new Set([
      ...directOrgIds,
      ...projectedOrgIdsFromLeagues,
      ...projectedOrgIdsFromTeams
    ])
  );
  const teamIds = Array.from(new Set(directTeamIds));

  return {
    isSuperAdmin: false,
    leagueIds,
    orgIds,
    teamIds
  };
}
