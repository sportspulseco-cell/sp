import { BadRequestException, ForbiddenException, Logger, NotFoundException } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  SYSTEM_ROLE_BY_CODE,
  holdingManagesRoles,
  roleGrantAllowed
} from "@sportspulse/kernel";
import { isSuperAdmin, loadActiveAssignments, loadGameScopeRef } from "./game-access";

/**
 * Server half of the role-grant rule (kernel role-grants.ts): who may
 * grant, revoke or invite with a role, and where. The kernel decides
 * level and scope type; this checks the target scope sits inside the
 * caller's own org or league (or season / division for those roles,
 * which do not manage roles today). Assignments are read on every call,
 * so a revoked admin is refused on their next request.
 *
 * Contract: a target outside every scope the caller administers is a
 * 404 (never leak that it exists); a target inside their scope with a
 * role they may not grant is a 403 in plain words.
 */

const LIVE_ENTRY_STATUSES = ["applied", "confirmed"];
const log = new Logger("RoleGrantAccess");

interface Ancestry {
  orgId: string;
  leagueIds: Set<string>;
  seasonIds: Set<string>;
  divisionIds: Set<string>;
  teamIds: Set<string>;
}

/** Org, leagues, seasons, divisions and teams a scope sits in. Null when it does not exist. */
async function ancestryOf(db: Database, scopeType: string, scopeId: string): Promise<Ancestry | null> {
  const a = (orgId: string): Ancestry => ({
    orgId,
    leagueIds: new Set(),
    seasonIds: new Set(),
    divisionIds: new Set(),
    teamIds: new Set()
  });
  switch (scopeType) {
    case "org": {
      const [o] = await db.select({ id: schema.orgs.id }).from(schema.orgs).where(eq(schema.orgs.id, scopeId)).limit(1);
      return o ? a(o.id) : null;
    }
    case "league": {
      const [l] = await db
        .select({ orgId: schema.leagues.orgId })
        .from(schema.leagues)
        .where(eq(schema.leagues.id, scopeId))
        .limit(1);
      if (!l) return null;
      const out = a(l.orgId);
      out.leagueIds.add(scopeId);
      return out;
    }
    case "season": {
      const [s] = await db
        .select({ orgId: schema.seasons.orgId, leagueId: schema.seasons.leagueId })
        .from(schema.seasons)
        .where(eq(schema.seasons.id, scopeId))
        .limit(1);
      if (!s) return null;
      const out = a(s.orgId);
      out.leagueIds.add(s.leagueId);
      out.seasonIds.add(scopeId);
      return out;
    }
    case "division": {
      const [d] = await db
        .select({ orgId: schema.seasons.orgId, leagueId: schema.seasons.leagueId, seasonId: schema.seasons.id })
        .from(schema.divisions)
        .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
        .where(eq(schema.divisions.id, scopeId))
        .limit(1);
      if (!d) return null;
      const out = a(d.orgId);
      out.leagueIds.add(d.leagueId);
      out.seasonIds.add(d.seasonId);
      out.divisionIds.add(scopeId);
      return out;
    }
    case "team": {
      const [t] = await db
        .select({ orgId: schema.teams.orgId })
        .from(schema.teams)
        .where(eq(schema.teams.id, scopeId))
        .limit(1);
      if (!t) return null;
      const out = a(t.orgId);
      out.teamIds.add(scopeId);
      // A team sits in a league through its live division entries.
      const rows = await db
        .select({ divisionId: schema.divisions.id, seasonId: schema.seasons.id, leagueId: schema.seasons.leagueId })
        .from(schema.divisionTeamEntries)
        .innerJoin(schema.divisions, eq(schema.divisions.id, schema.divisionTeamEntries.divisionId))
        .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
        .where(
          and(
            eq(schema.divisionTeamEntries.teamId, scopeId),
            inArray(schema.divisionTeamEntries.entryStatus, LIVE_ENTRY_STATUSES)
          )
        );
      for (const r of rows) {
        out.leagueIds.add(r.leagueId);
        out.seasonIds.add(r.seasonId);
        out.divisionIds.add(r.divisionId);
      }
      return out;
    }
    case "game": {
      const g = await loadGameScopeRef(db, scopeId);
      if (!g) return null;
      const out = a(g.orgId);
      out.leagueIds.add(g.leagueId);
      if (g.seasonId) out.seasonIds.add(g.seasonId);
      if (g.divisionId) out.divisionIds.add(g.divisionId);
      out.teamIds.add(g.homeTeamId);
      out.teamIds.add(g.awayTeamId);
      return out;
    }
    default:
      return null;
  }
}

function contains(holdingType: string, holdingId: string | null, anc: Ancestry): boolean {
  if (!holdingId) return false;
  switch (holdingType) {
    case "org":
      return anc.orgId === holdingId;
    case "league":
      return anc.leagueIds.has(holdingId);
    case "season":
      return anc.seasonIds.has(holdingId);
    case "division":
      return anc.divisionIds.has(holdingId);
    case "team":
      return anc.teamIds.has(holdingId);
    default:
      return false;
  }
}

/**
 * Throws unless the caller may grant (or revoke) `roleCode` at the
 * scope. `roleCode` null means a custom role: super admin only.
 */
export async function assertCanManageRole(
  db: Database,
  userId: string,
  target: { roleCode: string | null; scopeType: string; scopeId: string | null },
  action: "grant" | "revoke"
): Promise<void> {
  if (await isSuperAdmin(db, userId)) return;
  const verb = action === "grant" ? "grant" : "remove";
  const holdings = (await loadActiveAssignments(db, userId)).filter(holdingManagesRoles);
  if (holdings.length === 0) {
    throw new ForbiddenException("Your role cannot manage roles. Ask your org admin.");
  }
  if (target.scopeType === "platform" || !target.scopeId) {
    throw new ForbiddenException("Only a platform admin can manage platform-wide roles.");
  }
  const anc = await ancestryOf(db, target.scopeType, target.scopeId);
  if (!anc) throw new NotFoundException("Not found in your organization or league.");
  const inside = holdings.filter((h) => contains(h.scopeType, h.scopeId, anc));
  if (inside.length === 0) {
    // The caller's own org is above their league but visible to them:
    // say why instead of pretending it does not exist.
    if (target.scopeType === "org") {
      for (const h of holdings) {
        if (!h.scopeId) continue;
        const own = await ancestryOf(db, h.scopeType, h.scopeId);
        if (own?.orgId === target.scopeId) {
          throw new ForbiddenException(
            "You manage roles inside your league, not for the whole organization. Ask your org admin."
          );
        }
      }
    }
    log.log(`role ${action} refused (outside scope) user=${userId} role=${target.roleCode} ${target.scopeType}:${target.scopeId}`);
    throw new NotFoundException("Not found in your organization or league.");
  }
  const def = target.roleCode ? SYSTEM_ROLE_BY_CODE[target.roleCode] : undefined;
  if (!def) {
    throw new ForbiddenException("Only a platform admin can manage custom roles.");
  }
  const ok = inside.some((h) => roleGrantAllowed(h, def.code, target.scopeType));
  if (!ok) {
    log.log(`role ${action} refused (level) user=${userId} role=${def.code} ${target.scopeType}:${target.scopeId}`);
    throw new ForbiddenException(
      `Your role cannot ${verb} ${def.name} here. Ask your org admin or a platform admin.`
    );
  }
}

/** Role code of a role id (null for a custom role). 404 when unknown. */
export async function systemRoleCodeOf(db: Database, roleId: string): Promise<string | null> {
  const [r] = await db
    .select({ code: schema.roles.code, isSystem: schema.roles.isSystem })
    .from(schema.roles)
    .where(eq(schema.roles.id, roleId))
    .limit(1);
  if (!r) throw new NotFoundException("Role not found");
  return r.isSystem ? r.code : null;
}

/** The role and scope of one assignment, for the revoke check. */
export async function assignmentTarget(
  db: Database,
  assignmentId: string
): Promise<{ roleCode: string | null; scopeType: string; scopeId: string | null }> {
  const [a] = await db
    .select({
      code: schema.roles.code,
      isSystem: schema.roles.isSystem,
      scopeType: schema.userRoleAssignments.scopeType,
      scopeId: schema.userRoleAssignments.scopeId
    })
    .from(schema.userRoleAssignments)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoleAssignments.roleId))
    .where(eq(schema.userRoleAssignments.id, assignmentId))
    .limit(1);
  if (!a) throw new NotFoundException("Role assignment not found");
  return { roleCode: a.isSystem ? a.code : null, scopeType: a.scopeType, scopeId: a.scopeId };
}

export function requireInviteRole<T>(role: T | undefined, superAdmin: boolean): T | undefined {
  if (!role && !superAdmin) {
    throw new BadRequestException("Pick the role to give with the invite.");
  }
  return role;
}
