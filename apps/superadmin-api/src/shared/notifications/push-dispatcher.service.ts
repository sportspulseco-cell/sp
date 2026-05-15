import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../database/database.tokens";

export interface PushMessage {
  /** Recipient — resolved to active push_subscriptions rows. */
  userId: string;
  title: string;
  body: string;
  /** Optional deep-link the OS / browser opens on tap. */
  url?: string;
  /** Telemetry tag — appears in the structured log line. */
  channel?: string;
}

export interface PushDispatchResult {
  /** True when at least one device accepted the push. */
  delivered: boolean;
  /** How many active subscriptions we attempted. */
  attempted: number;
  /** Why we didn't deliver (no-subs, env-not-set, provider-failed). */
  reason?: string;
}

/**
 * Backlog #16 — push channel dispatcher. Mirrors EmailDispatcherService
 * shape (env-driven kill-switch + structured logs) so the NotificationService
 * routing layer can swap channels without conditionals.
 *
 *   - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY unset → log-only mode. Pushes
 *     stay queued in the notifications table; pg_cron's retry-failed
 *     sweep (migration 0034) keeps re-trying with the same exponential
 *     backoff as email.
 *   - Keys set → real web-push dispatch. Native (iOS APNs / Android FCM)
 *     will plug in here via a platform check on push_subscriptions.platform.
 *
 * Web-push lib (`web-push` npm) is NOT bundled yet — the moment that
 * dep lands, replace the no-op send loop with a real `webpush.sendNotification`
 * call. Until then the service is intentionally a logging seam so
 * downstream wiring (NotificationService.dispatch, the queue table, the
 * pg_cron retry job) is exercised in dev/CI.
 */
@Injectable()
export class PushDispatcherService {
  private readonly log = new Logger(PushDispatcherService.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  private hasProvider(): boolean {
    return (
      !!this.config.get<string>("VAPID_PUBLIC_KEY") &&
      !!this.config.get<string>("VAPID_PRIVATE_KEY")
    );
  }

  async send(msg: PushMessage): Promise<PushDispatchResult> {
    const subs = await this.db
      .select({
        id: schema.pushSubscriptions.id,
        platform: schema.pushSubscriptions.platform,
        endpoint: schema.pushSubscriptions.endpoint,
        p256dh: schema.pushSubscriptions.p256dhKey,
        auth: schema.pushSubscriptions.authKey
      })
      .from(schema.pushSubscriptions)
      .where(
        and(
          eq(schema.pushSubscriptions.userId, msg.userId),
          eq(schema.pushSubscriptions.isActive, true)
        )
      );

    if (subs.length === 0) {
      return {
        delivered: false,
        attempted: 0,
        reason: "no active push subscriptions"
      };
    }

    const tag = msg.channel ?? "default";
    if (!this.hasProvider()) {
      this.log.warn(
        `[push:${tag}] log-only (VAPID keys unset). user=${msg.userId} subs=${subs.length} title="${msg.title}"`
      );
      this.log.debug(`[push:${tag}] body:\n${msg.body}`);
      return {
        delivered: false,
        attempted: subs.length,
        reason: "VAPID keys not configured"
      };
    }

    // Real dispatch lands here once `web-push` is added — for now we
    // log the resolved subs so the wiring can be verified end-to-end.
    // The lib import is intentionally not added yet because no provider
    // keys exist; adding it without keys would silently fail in prod.
    this.log.log(
      `[push:${tag}] would dispatch user=${msg.userId} subs=${subs.length} title="${msg.title}"`
    );
    for (const sub of subs) {
      this.log.debug(`[push:${tag}] sub ${sub.id} (${sub.platform}) ${sub.endpoint}`);
    }
    return {
      delivered: false,
      attempted: subs.length,
      reason: "web-push library not yet bundled; logged-only"
    };
  }

  /**
   * Soft-disable an endpoint that the provider reported as "gone".
   * Called by the real send path once web-push lands.
   */
  async deactivateEndpoint(endpoint: string): Promise<void> {
    await this.db
      .update(schema.pushSubscriptions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(schema.pushSubscriptions.endpoint, endpoint));
  }
}
