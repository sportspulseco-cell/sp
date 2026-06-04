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
 *   - org-scoped role  â†’ that org + every league owned by it
 *   - league-scoped    â†’ that league + its parent org
 *   - team-scoped      â†’ that team + its parent org (read-only access for the
 *                        captain / coach / player apps)
 *
 * Updated 2026-05-07 â€” added `teamIds` so the team-targeted apps
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
  // Added 2026-05-25 â€” the registration funnel grants `player` role at
  // division scope. Without projecting division â†’ season â†’ league â†’
  // org, the player's scope reads as empty (orgIds=[], leagueIds=[])
  // and surfaces like player-web's "Join free-agent pool" page (which
  // filters seasons by orgId) render an empty state.
  const directDivisionIds = rows
    .filter((r) => r.scopeType === "division" && r.scopeId)
    .map((r) => r.scopeId as string);

  // Project org-scoped assignments â†’ every league owned by the org.
  let projectedLeagueIds: string[] = [];
  if (directOrgIds.length > 0) {
    const ls = await db
      .select({ id: schema.leagues.id })
      .from(schema.leagues)
      .where(inArray(schema.leagues.orgId, directOrgIds));
    projectedLeagueIds = ls.map((r) => r.id);
  }

  // Project league-scoped assignments â†’ the org each league belongs to.
  let projectedOrgIdsFromLeagues: string[] = [];
  if (directLeagueIds.length > 0) {
    const os = await db
      .selectDistinct({ orgId: schema.leagues.orgId })
      .from(schema.leagues)
      .where(inArray(schema.leagues.id, directLeagueIds));
    projectedOrgIdsFromLeagues = os.map((r) => r.orgId);
  }

  // Project team-scoped assignments â†’ the org owning each team. Teams sit
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

  // Project division-scoped assignments â†’ the season's league + the
  // league's org. Used by the free-agent player role granted on
  // registration: scope=division so the player only sees their own
  // division's surfaces, but downstream queries that filter by orgId
  // or leagueId still need those derived values.
  let projectedLeagueIdsFromDivisions: string[] = [];
  let projectedOrgIdsFromDivisions: string[] = [];
  if (directDivisionIds.length > 0) {
    const rows2 = await db
      .selectDistinct({
        leagueId: schema.seasons.leagueId,
        orgId: schema.seasons.orgId
      })
      .from(schema.divisions)
      .innerJoin(
        schema.seasons,
        eq(schema.seasons.id, schema.divisions.seasonId)
      )
      .where(inArray(schema.divisions.id, directDivisionIds));
    projectedLeagueIdsFromDivisions = rows2.map((r) => r.leagueId);
    projectedOrgIdsFromDivisions = rows2.map((r) => r.orgId);
  }

  // Project team_memberships â†’ teamIds. team_memberships is the
  // canonical "is this person on this team" source; role assignments
  // are about permission, not membership. A free-agent who got
  // claimed by a captain has a team_memberships row but no team-scoped
  // role assignment, so without this projection the player-app's
  // /team page would correctly read scope.teamIds = [] and show
  // "Not on a roster yet" while their DB says otherwise.
  // Also project the team's org so scope.orgIds reflects reach.
  let teamIdsFromMemberships: string[] = [];
  let projectedOrgIdsFromMemberships: string[] = [];
  const personRows = await db
    .select({ id: schema.persons.id })
    .from(schema.persons)
    .where(eq(schema.persons.userId, userId));
  if (personRows.length > 0) {
    const personIds = personRows.map((p) => p.id);
    const memberships = await db
      .selectDistinct({
        teamId: schema.teamMemberships.teamId,
        orgId: schema.teams.orgId
      })
      .from(schema.teamMemberships)
      .innerJoin(
        schema.teams,
        eq(schema.teams.id, schema.teamMemberships.teamId)
      )
      .where(
        and(
          inArray(schema.teamMemberships.personId, personIds),
          eq(schema.teamMemberships.currentStatus, "active")
        )
      );
    teamIdsFromMemberships = memberships.map((m) => m.teamId);
    projectedOrgIdsFromMemberships = memberships.map((m) => m.orgId);
  }

  const leagueIds = Array.from(
    new Set([
      ...directLeagueIds,
      ...projectedLeagueIds,
      ...projectedLeagueIdsFromDivisions
    ])
  );
  const orgIds = Array.from(
    new Set([
      ...directOrgIds,
      ...projectedOrgIdsFromLeagues,
      ...projectedOrgIdsFromTeams,
      ...projectedOrgIdsFromDivisions,
      ...projectedOrgIdsFromMemberships
    ])
  );
  const teamIds = Array.from(
    new Set([...directTeamIds, ...teamIdsFromMemberships])
  );

  return {
    isSuperAdmin: false,
    leagueIds,
    orgIds,
    teamIds
  };
}
