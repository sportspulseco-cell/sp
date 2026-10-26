import {
  SYSTEM_ROLE_BY_CODE,
  permissionGranted,
  type ScopeType
} from "./permissions";

/**
 * Who may grant, revoke and invite with which role (FR-3.19.2; PPHL 2.2
 * "Org Admin: role assignment", 7.1 "League Admins can manage all teams
 * within a league"). One rule for the API check and the role pickers.
 *
 * A holder of a role that grants `role.assign` (org_admin, league_admin)
 * may grant a system role when all of these hold:
 *   - it is not above their own level (rank >= their rank), so an org
 *     admin may add another org admin to their own org, a league admin
 *     may add a co-admin to their league, and a league admin can never
 *     make an org admin;
 *   - the target scope is one the role is granted at (ROLE_GRANT_SCOPES);
 *   - the target scope is not above their own scope (depth >= theirs).
 * The server also checks that the target sits inside the holder's own
 * org or league. Only a super admin grants super_admin, platform roles
 * (parent, spectator) and custom roles.
 */
export const ROLE_ASSIGN_PERMISSION = "role.assign";

/** Scope types each system role may be granted at by a scoped admin. */
export const ROLE_GRANT_SCOPES: Readonly<Record<string, readonly ScopeType[]>> = {
  org_admin: ["org"],
  league_admin: ["league"],
  season_admin: ["season"],
  division_admin: ["division"],
  captain: ["team"],
  coach: ["team"],
  // The registration funnel grants player at division scope.
  player: ["team", "division"],
  registrar: ["org", "league", "season"],
  // Officials can be assigned to a league, one season or one game (SCH-12).
  referee: ["league", "season", "game"],
  scorekeeper: ["league", "season", "game"]
};

/** Hierarchy depth: platform 0 ... game 6. */
export const SCOPE_DEPTH: Readonly<Record<ScopeType, number>> = {
  platform: 0,
  org: 1,
  league: 2,
  season: 3,
  division: 4,
  team: 5,
  game: 6
};

export interface RoleHolding {
  roleCode: string;
  scopeType: ScopeType | string;
}

/** True when this holding lets its owner manage roles at all. */
export function holdingManagesRoles(h: RoleHolding): boolean {
  const def = SYSTEM_ROLE_BY_CODE[h.roleCode];
  return !!def && permissionGranted(def.defaultPermissions, ROLE_ASSIGN_PERMISSION);
}

/**
 * Pure part of the grant rule: may the holder of `granter` grant
 * `roleCode` at a scope of type `targetScopeType`? Scope containment
 * (same org / league) is checked by the server.
 */
export function roleGrantAllowed(
  granter: RoleHolding,
  roleCode: string,
  targetScopeType: ScopeType | string
): boolean {
  if (!holdingManagesRoles(granter)) return false;
  const g = SYSTEM_ROLE_BY_CODE[granter.roleCode];
  const r = SYSTEM_ROLE_BY_CODE[roleCode];
  if (!g || !r || r.code === "super_admin") return false;
  if (r.rank < g.rank) return false;
  const scopes = ROLE_GRANT_SCOPES[roleCode] ?? [];
  if (!scopes.includes(targetScopeType as ScopeType)) return false;
  const gd = SCOPE_DEPTH[granter.scopeType as ScopeType];
  const td = SCOPE_DEPTH[targetScopeType as ScopeType];
  if (gd === undefined || td === undefined || gd === 0) return false;
  return td >= gd;
}

/**
 * Role codes the holdings may grant at `targetScopeType` (any one
 * holding is enough), in hierarchy order. Super admins pass
 * `isSuperAdmin` and get every code in `candidates`.
 */
export function grantableRoleCodes(
  holdings: readonly RoleHolding[],
  targetScopeType: ScopeType | string,
  candidates: readonly string[],
  isSuperAdmin = false
): string[] {
  if (isSuperAdmin) return [...candidates];
  return candidates.filter((code) =>
    holdings.some((h) => roleGrantAllowed(h, code, targetScopeType))
  );
}
