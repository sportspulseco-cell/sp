import { Controller, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CronSecretGuard } from "../../../shared/auth/guards/cron-secret.guard";
import { RetryFailedHandler } from "../application/handlers/retry.handler";

/**
 * Cron-driven communications endpoints — split from the main
 * NotificationsController so the class-level JwtAuthGuard there
 * doesn't apply. pg_cron has no Supabase JWT; it authenticates
 * via the X-Cron-Secret header against the API's CRON_SECRET env.
 *
 * Schedules live in `packages/db/migrations/0034_cron_jobs.sql`
 * (pg_cron + pg_net). Manual admin retry is still available via
 * the JWT-gated POST /notifications/:id/retry endpoint.
 */
@ApiTags("communications/cron")
@Controller("notifications")
export class NotificationsCronController {
  constructor(private readonly retryFailedH: RetryFailedHandler) {}

  @Post("cron/retry-failed")
  @UseGuards(CronSecretGuard)
  @ApiOperation({
    summary:
      "pg_cron-driven sweep: retry every failed notification under the 3-attempt cap whose last attempt is older than the backoff window. Gated by X-Cron-Secret header."
  })
  retryFailed() {
    return this.retryFailedH.execute();
  }
}
