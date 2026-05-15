import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Auth guard for endpoints called by pg_cron (via pg_net) on a
 * fixed schedule. Verifies a shared secret in the `X-Cron-Secret`
 * header against the `CRON_SECRET` env var. No JWT required —
 * pg_cron has no concept of a Supabase session.
 *
 * Endpoints using this guard MUST be safe to call repeatedly with
 * no side effects beyond their documented behaviour (idempotent
 * sweeps, materialised-view refresh, etc).
 *
 * If `CRON_SECRET` is unset in env, the guard refuses everything —
 * fail closed rather than open the endpoint accidentally.
 */
@Injectable()
export class CronSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.config.get<string>("CRON_SECRET");
    if (!expected) {
      throw new ForbiddenException("Cron secret not configured");
    }
    const req = ctx.switchToHttp().getRequest();
    const supplied =
      req.headers?.["x-cron-secret"] ??
      req.headers?.["X-Cron-Secret"] ??
      "";
    if (supplied !== expected) {
      throw new ForbiddenException("Invalid cron secret");
    }
    return true;
  }
}
