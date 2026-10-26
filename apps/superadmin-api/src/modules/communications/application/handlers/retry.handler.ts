import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
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

/**
 * Queued rows nobody sent: rows written by database jobs (overdue sweep,
 * compliance sweep, invite expiry) never get the API's inline send. Only
 * the last 24 hours are sent: an older notice is stale and must never
 * reach a person late. Every channel is sent: an SMS row with no
 * provider configured ends `suppressed` ("not sent: SMS is not set up"),
 * never `failed`, so it is not picked again.
 */
function recentQueued(db: Database, limit: number, minAgeMinutes: number) {
  return db
    .select()
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.status, "queued"),
        inArray(schema.notifications.channel, ["email", "in_app", "sms", "push"]),
        sql`${schema.notifications.createdAt} > now() - interval '24 hours'`,
        sql`${schema.notifications.createdAt} < now() - make_interval(mins => ${minAgeMinutes}::int)`
      )
    )
    .orderBy(asc(schema.notifications.createdAt))
    .limit(limit) as unknown as Promise<NotificationRow[]>;
}

/** Queued rows older than the 24-hour send window (reported, never sent). */
async function staleQueuedCount(db: Database): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.status, "queued"),
        sql`${schema.notifications.createdAt} <= now() - interval '24 hours'`
      )
    );
  return r?.n ?? 0;
}

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
  private readonly log = new Logger(FlushQueuedHandler.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: NotificationRepository,
    private readonly service: NotificationService,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  /**
   * Send what is queued from the last 24 hours. Older rows are counted
   * as `skippedStale` and left queued: months-old notices never go out.
   */
  async execute(): Promise<{ sent: number; failed: number; skippedStale: number }> {
    const rows = await recentQueued(this.db, 100, 0);
    const skippedStale = await staleQueuedCount(this.db);
    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      await this.service.dispatch(row);
      const after = await this.repo.findById(row.id);
      if (after?.status === "sent") sent++;
      else failed++;
    }
    this.log.log(
      `flush queued: picked=${rows.length} sent=${sent} failed=${failed} skippedStale=${skippedStale}`
    );
    return { sent, failed, skippedStale };
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
    queuedPicked: number;
    queuedSent: number;
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
    // Then the queued rows nobody sent (see recentQueued). The 2-minute
    // floor leaves a fresh row to the API's inline send. A row that fails
    // here becomes `failed` and joins the retry schedule above.
    const queued = await recentQueued(this.db, 50, 2);
    let queuedSent = 0;
    for (const row of queued) {
      try {
        await this.service.dispatch(row);
        const after = await this.repo.findById(row.id);
        if (after?.status === "sent") queuedSent++;
      } catch (err) {
        this.log.error(
          `queued dispatch threw for ${row.id}: ${(err as Error).message}`
        );
      }
    }
    this.log.log(
      `retry-failed cron sweep: eligible=${rows.length} sent=${sent} stillFailed=${stillFailed} queuedPicked=${queued.length} queuedSent=${queuedSent}`
    );
    return {
      eligible: rows.length,
      sent,
      stillFailed,
      queuedPicked: queued.length,
      queuedSent
    };
  }
}
