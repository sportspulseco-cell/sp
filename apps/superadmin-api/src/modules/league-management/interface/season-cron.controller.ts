import { Controller, Inject, Logger, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, eq, isNotNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { CronSecretGuard } from "../../../shared/auth/guards/cron-secret.guard";

/**
 * Time-based season-status promotions. pg_cron hits this hourly; it
 * walks the seasons table and flips status forward when the calendar
 * has already caught up but no admin has manually toggled.
 *
 * Two transitions handled — both conservative, both honour the
 * season-status state machine (`canTransitionSeason`):
 *
 *   draft              → registration_open
 *      when registration_opens_at <= now()
 *      (independent of registration_closes_at — if the close has also
 *       passed, the next stage promotion below will pick it up in the
 *       same cron pass)
 *
 *   registration_open  → in_progress
 *      when (registration_closes_at <= now()) OR (start_date <= today)
 *
 * We deliberately do NOT auto-transition to playoffs / completed /
 * archived — those are admin-driven (season finale ceremony, archive
 * audit, etc.). Spec §10.
 *
 * Auth: X-Cron-Secret header (CronSecretGuard) — same pattern as the
 * compliance lock-sweep cron (migration 0036).
 */
@ApiTags("league-management/cron")
@Controller("league/seasons")
export class SeasonCronController {
  private readonly log = new Logger(SeasonCronController.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Post("cron/auto-transition")
  @UseGuards(CronSecretGuard)
  @ApiOperation({
    summary:
      "Flip season status forward when the calendar has caught up. draft → registration_open when registration_opens_at has passed. registration_open → in_progress when the registration window has closed or start_date has arrived. Idempotent."
  })
  async runAutoTransitions(): Promise<{
    promotedToOpen: number;
    promotedToInProgress: number;
  }> {
    // ---- draft → registration_open
    // Honour reg_opens regardless of whether reg_closes has also passed
    // — the in_progress promotion below catches up in the same pass.
    const opened = await this.db
      .update(schema.seasons)
      .set({
        status: "registration_open",
        updatedAt: new Date()
      })
      .where(
        and(
          eq(schema.seasons.status, "draft"),
          isNotNull(schema.seasons.registrationOpensAt),
          lte(schema.seasons.registrationOpensAt, sql`now()`)
        )
      )
      .returning({ id: schema.seasons.id, name: schema.seasons.name });
    if (opened.length > 0) {
      this.log.log(
        `auto-promoted to registration_open: ${opened.length} seasons — ${opened
          .map((s) => `${s.name} (${s.id})`)
          .join(", ")}`
      );
    }

    // ---- registration_open → in_progress
    // Window closed OR season start date arrived (whichever happens first
    // tells us the registration phase is over).
    const inProgressed = await this.db
      .update(schema.seasons)
      .set({
        status: "in_progress",
        updatedAt: new Date()
      })
      .where(
        and(
          eq(schema.seasons.status, "registration_open"),
          or(
            sql`(${schema.seasons.registrationClosesAt} IS NOT NULL AND ${schema.seasons.registrationClosesAt} <= now())`,
            sql`${schema.seasons.startDate} <= (now() AT TIME ZONE 'UTC')::date`
          )
        )
      )
      .returning({ id: schema.seasons.id, name: schema.seasons.name });
    if (inProgressed.length > 0) {
      this.log.log(
        `auto-promoted to in_progress: ${inProgressed.length} seasons — ${inProgressed
          .map((s) => `${s.name} (${s.id})`)
          .join(", ")}`
      );
    }

    return {
      promotedToOpen: opened.length,
      promotedToInProgress: inProgressed.length
    };
  }
}
