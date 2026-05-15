import {
  Controller,
  Inject,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { CronSecretGuard } from "../../../shared/auth/guards/cron-secret.guard";

/**
 * Refresh hooks for the platform's materialized views. Wired in
 * P2-3 (part B) to drive `v_active_season_membership` — the single
 * source of truth for "is this player rostered for this season?".
 *
 * Gated by `CronSecretGuard` (X-Cron-Secret header). pg_cron drives
 * the schedule via pg_net — see migration 0034. Manual admin
 * invocation: same secret in a curl. The view's refresh runs
 * CONCURRENTLY so reads never block.
 */
@ApiTags("admin/views")
@Controller("admin/views")
export class MaterializedViewsController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Post("v-active-season-membership/refresh")
  @UseGuards(CronSecretGuard)
  @ApiOperation({
    summary:
      "Refresh v_active_season_membership without blocking reads. Idempotent; safe on a short cadence. Gated by X-Cron-Secret."
  })
  async refreshActiveMembership(): Promise<{
    refreshed: true;
    view: string;
  }> {
    await this.db.execute(
      sql`REFRESH MATERIALIZED VIEW CONCURRENTLY v_active_season_membership`
    );
    return { refreshed: true, view: "v_active_season_membership" };
  }
}
