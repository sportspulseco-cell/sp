import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { and, eq, inArray, isNull } from "drizzle-orm";

/**
 * Resolved access scope for the current principal.
 *
 * `null` for either field means *unrestricted* (super_admin or platform-scoped):
 * handlers should apply no filter. A non-null array is a hard whitelist; an
 * empty array means the principal has zero visibility for that dimension.
 *
 * `leagueIds` and `orgIds` are projected: a league-scoped role contributes
 * its league directly *and* the org owning that league; an org-scoped role
 * contributes the org directly *and* every league owned by the org.
 *
 * Updated post 2026-05-09 hierarchy flip — leagues now live directly under
 * orgs (no season hop in between).
 */
export interface UserScope {
  isSuperAdmin: boolean;
  leagueIds: string[] | null;
  orgIds: string[] | null;
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
    return { isSuperAdmin: true, leagueIds: null, orgIds: null };
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
    return { isSuperAdmin: false, leagueIds: null, orgIds: null };
  }

  const directOrgIds = rows
    .filter((r) => r.scopeType === "org" && r.scopeId)
    .map((r) => r.scopeId as string);
  const directLeagueIds = rows
    .filter((r) => r.scopeType === "league" && r.scopeId)
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
  let projectedOrgIds: string[] = [];
  if (directLeagueIds.length > 0) {
    const os = await db
      .selectDistinct({ orgId: schema.leagues.orgId })
      .from(schema.leagues)
      .where(inArray(schema.leagues.id, directLeagueIds));
    projectedOrgIds = os.map((r) => r.orgId);
  }

  const leagueIds = Array.from(
    new Set([...directLeagueIds, ...projectedLeagueIds])
  );
  const orgIds = Array.from(new Set([...directOrgIds, ...projectedOrgIds]));

  return {
    isSuperAdmin: false,
    leagueIds,
    orgIds
  };
}
