import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, lt, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepository,
  type NotificationRow
} from "../../domain/repositories/notification.repository";
import { NotificationService } from "../notification.service";
import {
  NotificationDto
} from "../dtos/notification.dto";
import { DRIZZLE } from "../../../../shared/database/database.tokens";

/**
 * Backoff schedule for retrying a failed notification, indexed by
 * current `attemptCount` (= the attempt that just failed). Encoded
 * inline as Postgres `interval` literals in the cron query below.
 *
 *   - 1st failure → wait 5 min before retry 2
 *   - 2nd failure → wait 30 min before retry 3
 *   - 3rd failure → terminal, no further retries
 */

@Injectable()
export class RetryNotificationHandler {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: NotificationRepository,
    private readonly service: NotificationService
  ) {}

  async execute({ id }: { id: string }): Promise<NotificationDto> {
    const row = await this.repo.findById(id);
    if (!row) throw new Error("notification not found");
    if (row.status === "sent") return NotificationDto.fromRow(row);

    await this.service.dispatch(row);
    const updated = (await this.repo.findById(id)) ?? row;
    return NotificationDto.fromRow(updated);
  }
}

@Injectable()
export class FlushQueuedHandler {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: NotificationRepository,
    private readonly service: NotificationService
  ) {}

  /** Send everything currently queued. Returns count sent + failed. */
  async execute(): Promise<{ sent: number; failed: number }> {
    const page = await this.repo.list({ status: "queued", limit: 100 });
    let sent = 0;
    let failed = 0;
    for (const row of page.items) {
      await this.service.dispatch(row);
      const after = await this.repo.findById(row.id);
      if (after?.status === "sent") sent++;
      else failed++;
    }
    return { sent, failed };
  }
}

/**
 * Cron-driven retry of `failed` notifications. Hit by the external
 * scheduler (Vercel Cron, GitHub Actions) every 5 min on
 * POST /notifications/cron/retry-failed.
 *
 * Selection rules:
 *   - status='failed'
 *   - attemptCount < 3 (3 total attempts; first was the inline
 *     dispatch from NotificationService.queue, two more here)
 *   - last attempt was longer ago than BACKOFF_SECONDS[attemptCount]
 *     so we don't hammer the provider on a transient outage
 *
 * Closes plan P4-2 (retry half) / audit §7 follow-on.
 */
@Injectable()
export class RetryFailedHandler {
  private readonly log = new Logger(RetryFailedHandler.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: NotificationRepository,
    private readonly service: NotificationService,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  async execute(): Promise<{
    eligible: number;
    sent: number;
    stillFailed: number;
  }> {
    // Fetch failed candidates respecting the per-attempt backoff
    // window. updated_at is bumped by markStatus, so it tracks the
    // most recent attempt. Backoff schedule comes from BACKOFF_SECONDS.
    const rows = (await this.db
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.status, "failed"),
          lt(schema.notifications.attemptCount, 3),
          sql`CASE ${schema.notifications.attemptCount}
                WHEN 1 THEN ${schema.notifications.updatedAt} < now() - interval '5 minutes'
                WHEN 2 THEN ${schema.notifications.updatedAt} < now() - interval '30 minutes'
                ELSE false
              END`
        )
      )
      .limit(50)) as unknown as NotificationRow[];

    let sent = 0;
    let stillFailed = 0;
    for (const row of rows) {
      try {
        await this.service.dispatch(row);
        const after = await this.repo.findById(row.id);
        if (after?.status === "sent") sent++;
        else stillFailed++;
      } catch (err) {
        this.log.error(
          `retry-failed dispatch threw for ${row.id}: ${(err as Error).message}`
        );
        stillFailed++;
      }
    }
    this.log.log(
      `retry-failed cron sweep: eligible=${rows.length} sent=${sent} stillFailed=${stillFailed}`
    );
    return { eligible: rows.length, sent, stillFailed };
  }
}
