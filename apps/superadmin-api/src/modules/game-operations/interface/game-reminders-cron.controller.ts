import { Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Database } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { CronSecretGuard } from "../../../shared/auth/guards/cron-secret.guard";
import { NotificationService } from "../../communications/application/notification.service";
import { sweepGameReminders, type ReminderSweepResult } from "../application/games/game-reminders";

/**
 * Hourly game-reminder sweep (FR-3.17.3). pg_cron posts here with the
 * X-Cron-Secret header (migration 0093). Idempotent: safe to call again.
 */
@ApiTags("game-operations/cron")
@Controller("games/cron")
export class GameRemindersCronController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  @Post("reminders")
  @UseGuards(CronSecretGuard)
  @ApiOperation({
    summary:
      "Remind both teams about published, scheduled games starting in the next 24 hours. One reminder per person per game start time. `more` = run again for the rest."
  })
  run(): Promise<ReminderSweepResult> {
    return sweepGameReminders(this.db, this.notify);
  }
}
