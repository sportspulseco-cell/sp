import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../database/database.tokens";

// Independent of JwtAuthGuard's order — re-resolves the principal from the
// request, then asserts the linked profile has is_super_admin = true.
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const principal = req.principal;
    if (!principal?.userId) throw new ForbiddenException("No principal");

    const [row] = await this.db
      .select({ isSuperAdmin: schema.profiles.isSuperAdmin })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, principal.userId))
      .limit(1);

    if (!row?.isSuperAdmin) {
      throw new ForbiddenException("Super admin access required");
    }
    return true;
  }
}
