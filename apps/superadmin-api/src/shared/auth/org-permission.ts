import { inArray } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { permissionGranted } from "@sportspulse/kernel";
import {
  isSuperAdmin,
  loadActiveAssignments,
  rolePermissions,
  type ActiveAssignment
} from "./game-access";

/**
 * True when the caller may take `permission` on a record owned by an
 * organisation (for example a rink): super admin, or an active role
 * assignment inside that organisation (platform, the org itself, one of
 * its leagues, seasons or divisions) whose role grants the permission
 * (kernel catalogue for system roles, stored permissions for custom
 * roles).
 *
 * `loadUserScope().orgIds` is not enough for writes: it also holds orgs
 * reached through team roles and memberships, so a captain or a player
 * would pass, and every platform role (parent, spectator) reads as
 * unrestricted.
 */
export async function canInOrg(
  db: Database,
  userId: string,
  orgId: string,
  permission: string
): Promise<boolean> {
  if (await isSuperAdmin(db, userId)) return true;
  const assignments = (await loadActiveAssignments(db, userId)).filter((a) =>
    permissionGranted(rolePermissions(a), permission)
  );
  if (assignments.length === 0) return false;
  const orgOf = await orgsOfScopes(db, assignments);
  return assignments.some((a) => {
    if (a.scopeType === "platform") return true;
    if (!a.scopeId) return false;
    if (a.scopeType === "org") return a.scopeId === orgId;
    return orgOf.get(`${a.scopeType}:${a.scopeId}`) === orgId;
  });
}

async function orgsOfScopes(
  db: Database,
  assignments: ActiveAssignment[]
): Promise<Map<string, string>> {
  const ids = (type: string) =>
    assignments.filter((a) => a.scopeType === type && a.scopeId).map((a) => a.scopeId as string);
  const leagueIds = ids("league");
  const seasonIds = ids("season");
  const divisionIds = ids("division");
  const out = new Map<string, string>();
  const [leagues, seasons, divisions] = await Promise.all([
    leagueIds.length
      ? db
          .select({ id: schema.leagues.id, orgId: schema.leagues.orgId })
          .from(schema.leagues)
          .where(inArray(schema.leagues.id, leagueIds))
      : [],
    seasonIds.length
      ? db
          .select({ id: schema.seasons.id, orgId: schema.seasons.orgId })
          .from(schema.seasons)
          .where(inArray(schema.seasons.id, seasonIds))
      : [],
    divisionIds.length
      ? db
          .select({ id: schema.divisions.id, seasonId: schema.divisions.seasonId })
          .from(schema.divisions)
          .where(inArray(schema.divisions.id, divisionIds))
      : []
  ]);
  for (const l of leagues) out.set(`league:${l.id}`, l.orgId);
  for (const s of seasons) out.set(`season:${s.id}`, s.orgId);
  if (divisions.length) {
    const parents = await db
      .select({ id: schema.seasons.id, orgId: schema.seasons.orgId })
      .from(schema.seasons)
      .where(inArray(schema.seasons.id, divisions.map((d) => d.seasonId)));
    const orgBySeason = new Map(parents.map((p) => [p.id, p.orgId]));
    for (const d of divisions) {
      const org = orgBySeason.get(d.seasonId);
      if (org) out.set(`division:${d.id}`, org);
    }
  }
  return out;
}
