import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable
} from "@nestjs/common";
import type { Database } from "@sportspulse/db";
import { DRIZZLE } from "../../database/database.tokens";
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
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const principal = req.principal;
    if (!principal?.userId) throw new ForbiddenException("No principal");

    const scope = await loadUserScope(this.db, principal.userId);
    req.userScope = scope;

    if (scope.isSuperAdmin) return true;

    const method = (req.method ?? "").toUpperCase();
    const isRead = method === "GET" || method === "HEAD" || method === "OPTIONS";
    if (!isRead) {
      throw new ForbiddenException(
        "Write operations require super_admin (or a scoped @Roles() decorator on the controller)"
      );
    }

    // Reads require an active assignment. `null` = unrestricted (platform); a
    // non-null but empty array on BOTH dimensions means no active assignment.
    const noLeagueAccess = scope.leagueIds !== null && scope.leagueIds.length === 0;
    const noOrgAccess = scope.orgIds !== null && scope.orgIds.length === 0;
    if (noLeagueAccess && noOrgAccess) {
      throw new ForbiddenException("No active role assignment");
    }
    return true;
  }
}
