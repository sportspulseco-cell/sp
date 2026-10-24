import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { DRIZZLE } from "../../database/database.tokens";
import { ALLOW_SCOPED_WRITE_KEY } from "../decorators/allow-scoped-write.decorator";
import { loadUserScope } from "../scope";

/**
 * Tiered authorization:
 *   - super_admin â†’ all methods allowed
 *   - any active user_role_assignment â†’ GET / read-only methods allowed
 *   - else â†’ 403
 *
 * This is the transitional guard that unblocks role-scoped clients (the
 * league-admin app) until each controller migrates to the explicit
 * `@Roles()` + `@Scope()` system.
 */
@Injectable()
export class AuthorizedAccessGuard implements CanActivate {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly reflector: Reflector
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const principal = req.principal;
    if (!principal?.userId) throw new ForbiddenException("No principal");

    const scope = await loadUserScope(this.db, principal.userId);
    req.userScope = scope;

    if (scope.isSuperAdmin) return true;

    const method = (req.method ?? "").toUpperCase();
    const isRead = method === "GET" || method === "HEAD" || method === "OPTIONS";
    const allowScopedWrite = this.reflector.getAllAndOverride<boolean>(
      ALLOW_SCOPED_WRITE_KEY,
      [ctx.getHandler(), ctx.getClass()]
    );
    if (!isRead && !allowScopedWrite) {
      // Plain words for the screen (SCH-12 showed the old internal text).
      // A handler opts scoped admins in with @AllowScopedWrite() and then
      // does its own row-level check.
      throw new ForbiddenException(
        "Only a platform admin can make this change."
      );
    }

    // Reads require an active assignment. `null` = unrestricted (platform); a
    // non-null but empty array on ALL three dimensions means no active
    // assignment. Team scope counts here so captain / coach / player
    // sessions on the role-targeted apps clear the gate.
    const noLeagueAccess = scope.leagueIds !== null && scope.leagueIds.length === 0;
    const noOrgAccess = scope.orgIds !== null && scope.orgIds.length === 0;
    const noTeamAccess = scope.teamIds !== null && scope.teamIds.length === 0;
    if (noLeagueAccess && noOrgAccess && noTeamAccess) {
      // Season- and game-scoped assignments (a scorekeeper for one season
      // or one game, SCH-12) do not project into the three lists above but
      // are still an active assignment. Handlers keep filtering rows: an
      // empty list still means "nothing" to every scope-filtered query.
      // Only the game-operations roles get this pass. A season-scoped
      // captain (3 such users on production, 25 Oct 2026) stays blocked
      // here exactly as before; captains read through their team scope.
      const [anyAssignment] = await this.db
        .select({ id: schema.userRoleAssignments.id })
        .from(schema.userRoleAssignments)
        .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoleAssignments.roleId))
        .where(
          and(
            eq(schema.userRoleAssignments.userId, principal.userId),
            isNull(schema.userRoleAssignments.revokedAt),
            inArray(schema.userRoleAssignments.scopeType, ["season", "game"]),
            inArray(schema.roles.code, ["season_admin", "scorekeeper", "referee"])
          )
        )
        .limit(1);
      if (!anyAssignment) {
        throw new ForbiddenException("No active role assignment");
      }
    }
    return true;
  }
}
