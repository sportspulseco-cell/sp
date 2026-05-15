import { Controller, Inject, Logger, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { CronSecretGuard } from "../../../shared/auth/guards/cron-secret.guard";
import { ComplianceSweepsController } from "./compliance-sweeps.controller";

/**
 * Cron-driven endpoint that finds seasons whose `roster_lock_at`
 * has passed and runs the compliance lock-sweep for each.
 *
 * Selection rules:
 *   - roster_lock_at IS NOT NULL
 *   - roster_lock_at <= now()
 *   - last_lock_sweep_at IS NULL OR last_lock_sweep_at < roster_lock_at
 *
 * The last clause is the idempotency knob: once a sweep stamps
 * `last_lock_sweep_at = now()`, subsequent cron passes skip the
 * season until an admin moves `roster_lock_at` forward (re-lock).
 *
 * pg_cron schedules this hourly via migration 0036.
 * Auth: X-Cron-Secret header (CronSecretGuard).
 */
@ApiTags("compliance/cron")
@Controller("compliance/eligibility")
export class ComplianceCronController {
  private readonly log = new Logger(ComplianceCronController.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly sweeps: ComplianceSweepsController
  ) {}

  @Post("cron/lock-sweep")
  @UseGuards(CronSecretGuard)
  @ApiOperation({
    summary:
      "Run the lock-sweep for every season whose roster_lock_at has just passed. Idempotent — already-swept seasons are skipped via seasons.last_lock_sweep_at."
  })
  async runDueLockSweeps(): Promise<{
    candidates: number;
    swept: number;
    skipped: number;
    totalExpired: number;
    totalExpiring: number;
  }> {
    const seasons = await this.db
      .select({
        id: schema.seasons.id,
        name: schema.seasons.name,
        rosterLockAt: schema.seasons.rosterLockAt,
        lastLockSweepAt: schema.seasons.lastLockSweepAt
      })
      .from(schema.seasons)
      .where(
        and(
          isNotNull(schema.seasons.rosterLockAt),
          lte(schema.seasons.rosterLockAt, sql`now()`),
          or(
            isNull(schema.seasons.lastLockSweepAt),
            sql`${schema.seasons.lastLockSweepAt} < ${schema.seasons.rosterLockAt}`
          )
        )
      );

    let swept = 0;
    let skipped = 0;
    let totalExpired = 0;
    let totalExpiring = 0;
    for (const s of seasons) {
      try {
        const result = await this.sweeps.lockSweepForSeason(s.id);
        swept++;
        totalExpired += result.expired;
        totalExpiring += result.expiring;
      } catch (err) {
        skipped++;
        this.log.error(
          `lock-sweep failed for season ${s.id} (${s.name}): ${(err as Error).message}`
        );
      }
    }

    this.log.log(
      `compliance lock-sweep cron: candidates=${seasons.length} swept=${swept} skipped=${skipped} expired=${totalExpired} expiring=${totalExpiring}`
    );
    return {
      candidates: seasons.length,
      swept,
      skipped,
      totalExpired,
      totalExpiring
    };
  }
}
