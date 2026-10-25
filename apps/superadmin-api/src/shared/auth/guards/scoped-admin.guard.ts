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
import { userIsPeopleAdmin } from "../org-admin";
import { loadAdminScope } from "../scope";

/**
 * Admin-console reads for scoped admins. Same contract as
 * `AuthorizedAccessGuard` (super_admin: everything; writes need
 * super_admin or `@AllowScopedWrite()`), plus: the caller must hold an
 * admin role (org / league / season / division admin or registrar), so a
 * player's org-projected scope never opens people, registrations or
 * finance lists. Handlers still filter by `@UserScope()`; see
 * `shared/auth/visibility.ts`.
 */
@Injectable()
export class ScopedAdminGuard implements CanActivate {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly reflector: Reflector
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const principal = req.principal;
    if (!principal?.userId) throw new ForbiddenException("No principal");

    // Admin reads use the admin-only scope: roster spots never widen it.
    const scope = await loadAdminScope(this.db, principal.userId);
    req.userScope = scope;
    if (scope.isSuperAdmin) return true;

    const method = (req.method ?? "").toUpperCase();
    const isRead = method === "GET" || method === "HEAD" || method === "OPTIONS";
    const allowScopedWrite = this.reflector.getAllAndOverride<boolean>(
      ALLOW_SCOPED_WRITE_KEY,
      [ctx.getHandler(), ctx.getClass()]
    );
    if (!isRead && !allowScopedWrite) {
      throw new ForbiddenException("Super admin access required");
    }
    if (!(await userIsPeopleAdmin(this.db, principal.userId))) {
      throw new ForbiddenException(
        "Requires an admin role (org, league, season or division admin)."
      );
    }
    return true;
  }
}
