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

  // These projections depend only on the assignments above, so run them
  // together instead of adding a database round trip for each scope type.
  const [
    projectedLeagueIds,
    projectedOrgIdsFromLeagues,
    projectedOrgIdsFromTeams,
    divisionProjection,
    membershipProjection
  ] = await Promise.all([
    (async () => {
      if (!directOrgIds.length) return [] as string[];
      const rows = await db
        .select({ id: schema.leagues.id })
        .from(schema.leagues)
        .where(inArray(schema.leagues.orgId, directOrgIds));
      return rows.map((r) => r.id);
    })(),
    (async () => {
      if (!directLeagueIds.length) return [] as string[];
      const rows = await db
        .selectDistinct({ orgId: schema.leagues.orgId })
        .from(schema.leagues)
        .where(inArray(schema.leagues.id, directLeagueIds));
      return rows.map((r) => r.orgId);
    })(),
    (async () => {
      if (!directTeamIds.length) return [] as string[];
      const rows = await db
        .selectDistinct({ orgId: schema.teams.orgId })
        .from(schema.teams)
        .where(inArray(schema.teams.id, directTeamIds));
      return rows.map((r) => r.orgId);
    })(),
    (async () => {
      if (!directDivisionIds.length) return { leagueIds: [], orgIds: [] };
      const rows = await db
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
      return {
        leagueIds: rows.map((r) => r.leagueId),
        orgIds: rows.map((r) => r.orgId)
      };
    })(),
    (async () => {
      // Memberships grant player access to a team independently of roles.
      const people = await db
        .select({ id: schema.persons.id })
        .from(schema.persons)
        .where(eq(schema.persons.userId, userId));
      if (!people.length) return { teamIds: [], orgIds: [] };
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
            inArray(schema.teamMemberships.personId, people.map((p) => p.id)),
            eq(schema.teamMemberships.currentStatus, "active")
          )
        );
      return {
        teamIds: memberships.map((m) => m.teamId),
        orgIds: memberships.map((m) => m.orgId)
      };
    })()
  ]);

  const leagueIds = Array.from(
    new Set([
      ...directLeagueIds,
      ...projectedLeagueIds,
      ...divisionProjection.leagueIds
    ])
  );
  const orgIds = Array.from(
    new Set([
      ...directOrgIds,
      ...projectedOrgIdsFromLeagues,
      ...projectedOrgIdsFromTeams,
      ...divisionProjection.orgIds,
      ...membershipProjection.orgIds
    ])
  );
  const teamIds = Array.from(
    new Set([...directTeamIds, ...membershipProjection.teamIds])
  );

  return {
    isSuperAdmin: false,
    leagueIds,
    orgIds,
    teamIds
  };
}
