import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../database/database.tokens";
import { ROLES_METADATA } from "../decorators/roles.decorator";
import {
  SCOPE_METADATA,
  type ScopeMeta
} from "../decorators/scope.decorator";

/**
 * Hierarchy: any of these roles satisfies a check for any role at-or-below
 * its level. super_admin always wins. Mirrors the locked top-down hierarchy:
 * super_admin → org_admin → league_admin → season_admin → division_admin →
 * team_admin → coach → registrar → referee → scorekeeper → player → parent →
 * spectator.
 */
const HIERARCHY: string[] = [
  "super_admin",
  "org_admin",
  "league_admin",
  "season_admin",
  "division_admin",
  "team_admin",
  "coach",
  "registrar",
  "referee",
  "scorekeeper",
  "player",
  "parent",
  "spectator"
];
const HIERARCHY_RANK = new Map(HIERARCHY.map((c, i) => [c, i]));

function dominates(have: string, need: string): boolean {
  const h = HIERARCHY_RANK.get(have);
  const n = HIERARCHY_RANK.get(need);
  if (h === undefined || n === undefined) return have === need;
  // lower rank == higher authority
  return h <= n;
}

/**
 * RolesGuard — composes with JwtAuthGuard. Checks @Roles() metadata and,
 * if present, an optional @Scope() that binds the role assignment to a
 * URL param (e.g. `:leagueId`). super_admin bypasses every check.
 *
 * Example:
 *   @Roles("league_admin")
 *   @Scope("league", "leagueId")
 *   @Get("leagues/:leagueId/teams")
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly reflector: Reflector
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(
      ROLES_METADATA,
      [ctx.getHandler(), ctx.getClass()]
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const principal = req.principal;
    if (!principal?.userId) throw new ForbiddenException("No principal");

    // 1. Super admin shortcut (also exposed via profiles.is_super_admin).
    const [profile] = await this.db
      .select({ isSuperAdmin: schema.profiles.isSuperAdmin })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, principal.userId))
      .limit(1);
    if (profile?.isSuperAdmin) return true;

    // 2. Resolve required scope (if any) from the URL param.
    const scopeMeta = this.reflector.getAllAndOverride<ScopeMeta | undefined>(
      SCOPE_METADATA,
      [ctx.getHandler(), ctx.getClass()]
    );
    let scopeType: string | null = scopeMeta?.scopeType ?? null;
    let scopeId: string | null = null;
    if (scopeMeta) {
      const paramName =
        scopeMeta.paramName ?? `${scopeMeta.scopeType}Id`;
      scopeId = req.params?.[paramName] ?? null;
      if (!scopeId && scopeMeta.scopeType !== "platform") {
        throw new ForbiddenException(
          `Missing scope param :${paramName} for ${scopeMeta.scopeType}-scoped check`
        );
      }
    }

    // 3. Pull every active assignment for this user.
    const assignments = await this.db
      .select({
        scopeType: schema.userRoleAssignments.scopeType,
        scopeId: schema.userRoleAssignments.scopeId,
        roleCode: schema.roles.code
      })
      .from(schema.userRoleAssignments)
      .innerJoin(
        schema.roles,
        eq(schema.userRoleAssignments.roleId, schema.roles.id)
      )
      .where(
        and(
          eq(schema.userRoleAssignments.userId, principal.userId),
          isNull(schema.userRoleAssignments.revokedAt)
        )
      );

    // 4. Check: at least one assignment must dominate one of the required
    // roles, AND the scope (if specified) must match.
    const ok = assignments.some((a) => {
      const scopeOk =
        !scopeType ||
        scopeType === "platform" ||
        (a.scopeType === scopeType && a.scopeId === scopeId);
      if (!scopeOk) return false;
      return requiredRoles.some((need) => dominates(a.roleCode, need));
    });

    if (!ok) {
      throw new ForbiddenException(
        `Requires one of: ${requiredRoles.join(", ")}${
          scopeType && scopeType !== "platform"
            ? ` at ${scopeType} ${scopeId}`
            : ""
        }`
      );
    }
    return true;
  }
}
