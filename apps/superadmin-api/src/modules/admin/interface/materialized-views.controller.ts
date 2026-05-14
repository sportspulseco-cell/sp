import {
  Controller,
  Inject,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";

/**
 * Refresh hooks for the platform's materialized views. Wired in
 * P2-3 (part B) to drive `v_active_season_membership` — the single
 * source of truth for "is this player rostered for this season?".
 *
 * Endpoints follow the existing cron-pattern: gated by
 * `SuperAdminGuard`, called by an external scheduler (Vercel Cron /
 * GitHub Actions) at whatever cadence the view's staleness budget
 * allows. Default cadence: hourly. Critical write paths that need
 * "rostered now" semantics should still hit the underlying tables;
 * the view is for cross-path aggregation reads.
 *
 * CONCURRENTLY runs without blocking selects on the view; requires
 * the unique index that 0033 creates.
 */
@ApiTags("admin/views")
@ApiBearerAuth()
@Controller("admin/views")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class MaterializedViewsController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Post("v-active-season-membership/refresh")
  @ApiOperation({
    summary:
      "Refresh v_active_season_membership without blocking reads. Idempotent; safe on a short cadence (e.g. hourly cron)."
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
