import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Database } from "@sportspulse/db";
import { DRIZZLE } from "../../database/database.tokens";
import { ALLOW_SCOPED_WRITE_KEY } from "../decorators/allow-scoped-write.decorator";
import { loadUserScope } from "../scope";

/**
 * Tiered authorization:
 *   - super_admin → all methods allowed
 *   - any active user_role_assignment → GET / read-only methods allowed
 *   - else → 403
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
      throw new ForbiddenException(
        "Write operations require super_admin (or a @AllowScopedWrite() handler that does its own row-level check)"
      );
    }

    // Reads require an active assignment. `null` = unrestricted (platform); a
    // non-null but empty array on ALL three dimensions means no active
    // assignment. Team scope counts here so team_admin / coach / player
    // sessions on the role-targeted apps clear the gate.
    const noLeagueAccess = scope.leagueIds !== null && scope.leagueIds.length === 0;
    const noOrgAccess = scope.orgIds !== null && scope.orgIds.length === 0;
    const noTeamAccess = scope.teamIds !== null && scope.teamIds.length === 0;
    if (noLeagueAccess && noOrgAccess && noTeamAccess) {
      throw new ForbiddenException("No active role assignment");
    }
    return true;
  }
}
