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
 *                        captain / coach / player apps)
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
  /**
   * Orgs whose league-owned records (seasons, divisions) are visible
   * org-wide: direct org grants plus team / division / membership
   * projections. Excludes orgs reached ONLY through a league grant, so a
   * league_admin sees their own league's seasons and not sibling
   * leagues' (SETUP-15). Use this, not orgIds, when OR-ing an org branch
   * with leagueIds for league-owned records.
   */
  orgWideOrgIds: string[] | null;
}

/** Role codes that administer records (mirrors PEOPLE_ADMIN_ROLES in org-admin.ts, minus super_admin, which is a profile flag here). */
export const ADMIN_SCOPE_ROLE_CODES = [
  "super_admin",
  "org_admin",
  "league_admin",
  "season_admin",
  "division_admin",
  "registrar"
];

/**
 * The scope an admin decision may use: only assignments of an admin role,
 * no team-scoped roles and no roster-membership projection. Use it for
 * every admin read or write (ScopedAdminGuard, review queues, team moves,
 * personal details). An org-A admin who also plays in org B must not see
 * or change org B's records (found 25 Oct 2026 while building COMP-1).
 */
export function loadAdminScope(db: Database, userId: string): Promise<UserScope> {
  return loadUserScope(db, userId, { adminRolesOnly: true });
}

export async function loadUserScope(
  db: Database,
  userId: string,
  opts: { adminRolesOnly?: boolean } = {}
): Promise<UserScope> {
  const [profile] = await db
    .select({ isSuperAdmin: schema.profiles.isSuperAdmin })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, userId))
    .limit(1);

  if (profile?.isSuperAdmin) {
    return { isSuperAdmin: true, leagueIds: null, orgIds: null, teamIds: null, orgWideOrgIds: null };
  }

  const rows = (
    await db
      .select({
        scopeType: schema.userRoleAssignments.scopeType,
        scopeId: schema.userRoleAssignments.scopeId,
        roleCode: schema.roles.code
      })
      .from(schema.userRoleAssignments)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoleAssignments.roleId))
      .where(
        and(
          eq(schema.userRoleAssignments.userId, userId),
          isNull(schema.userRoleAssignments.revokedAt)
        )
      )
  ).filter(
    (r) =>
      !opts.adminRolesOnly ||
      (ADMIN_SCOPE_ROLE_CODES.includes(r.roleCode) && r.scopeType !== "team")
  );

  // Platform-scoped roles widen visibility beyond per-org/per-league filtering.
  if (rows.some((r) => r.scopeType === "platform")) {
    return { isSuperAdmin: false, leagueIds: null, orgIds: null, teamIds: null, orgWideOrgIds: null };
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
  // Added 2026-05-25 — the registration funnel grants `player` role at
  // division scope. Without projecting division → season → league →
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
      // Memberships grant player access to a team independently of roles;
      // never an admin's reach.
      if (opts.adminRolesOnly) return { teamIds: [] as string[], orgIds: [] as string[] };
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
  const orgWideOrgIds = Array.from(
    new Set([
      ...directOrgIds,
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
    teamIds,
    orgWideOrgIds
  };
}
