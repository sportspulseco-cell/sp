import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq } from "drizzle-orm";
import webpush from "web-push";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../database/database.tokens";

export interface PushMessage {
  /** Recipient — resolved to active push_subscriptions rows. */
  userId: string;
  title: string;
  body: string;
  /** Optional deep-link the browser opens on tap (path or absolute URL). */
  url?: string;
  /** Telemetry tag — appears in the structured log line. */
  channel?: string;
  /** The notifications row, echoed to the service worker. */
  notificationId?: string;
}

export interface PushAttempt {
  subscriptionId: string;
  statusCode: number | null;
  outcome: "accepted" | "expired_removed" | "failed" | "skipped_native";
  error?: string;
}

export interface PushDispatchResult {
  /** True when at least one device's push service accepted the message. */
  delivered: boolean;
  /** How many active subscriptions we attempted. */
  attempted: number;
  /** Subscriptions removed because the push service said 404 / 410. */
  removed: number;
  /** Why we didn't deliver (no-subs, env-not-set, provider-failed). */
  reason?: string;
  /** `not_configured` and `no_subscriptions` are final; `transient` is worth a retry. */
  failure?: "not_configured" | "no_subscriptions" | "transient";
  attempts: PushAttempt[];
}

/** What an admin reads when VAPID keys are missing. */
export const PUSH_NOT_SET_UP = "not sent: push notifications are not set up";

/**
 * Web push (FR-3.10.2, FR-3.21.2). Standard Push API with VAPID: no paid
 * provider. Each browser's push service (FCM for Chrome, Mozilla autopush,
 * Apple for Safari) receives an encrypted payload through the `web-push`
 * package; the app's service worker (`/sw.js`) shows it.
 *
 *   - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY unset -> `not_configured`,
 *     nothing sent.
 *   - VAPID_SUBJECT: a mailto: or https: contact the push services can
 *     reach (defaults to mailto:notifications@sportspulse.us).
 *   - 404 / 410 from a push service = the subscription is gone (browser
 *     unsubscribed, site data cleared): the row is deleted.
 *   - Native rows (platform ios / android) are skipped: no APNs / FCM
 *     native transport exists yet. Web is the only transport.
 *
 * "Accepted" means the push service took the message (HTTP 201); it is
 * not proof the device displayed it.
 */
@Injectable()
export class PushDispatcherService {
  private readonly log = new Logger(PushDispatcherService.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  private vapid(): { publicKey: string; privateKey: string; subject: string } | null {
    const publicKey = this.config.get<string>("VAPID_PUBLIC_KEY")?.trim();
    const privateKey = this.config.get<string>("VAPID_PRIVATE_KEY")?.trim();
    if (!publicKey || !privateKey) return null;
    const subject = this.config.get<string>("VAPID_SUBJECT")?.trim() || "mailto:notifications@sportspulse.us";
    return { publicKey, privateKey, subject };
  }

  /** The public key browsers subscribe with, or null when push is not set up. */
  publicKey(): string | null {
    return this.vapid()?.publicKey ?? null;
  }

  isConfigured(): boolean {
    return this.vapid() !== null;
  }

  /** True when the user has at least one active web subscription. */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.pushSubscriptions.id })
      .from(schema.pushSubscriptions)
      .where(
        and(
          eq(schema.pushSubscriptions.userId, userId),
          eq(schema.pushSubscriptions.isActive, true),
          eq(schema.pushSubscriptions.platform, "web")
        )
      )
      .limit(1);
    return !!row;
  }

  async send(msg: PushMessage): Promise<PushDispatchResult> {
    const tag = msg.channel ?? "default";
    const keys = this.vapid();
    if (!keys) {
      this.log.warn(`[push:${tag}] not sent: VAPID keys unset. user=${msg.userId}`);
      return { delivered: false, attempted: 0, removed: 0, reason: PUSH_NOT_SET_UP, failure: "not_configured", attempts: [] };
    }

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
        removed: 0,
        reason: "not sent: no device has push turned on",
        failure: "no_subscriptions",
        attempts: []
      };
    }

    const payload = JSON.stringify({
      title: msg.title,
      body: msg.body,
      url: msg.url ?? "/notifications",
      tag,
      notificationId: msg.notificationId ?? null
    });

    const attempts: PushAttempt[] = [];
    for (const sub of subs) {
      if (sub.platform !== "web" || !sub.p256dh || !sub.auth) {
        attempts.push({ subscriptionId: sub.id, statusCode: null, outcome: "skipped_native" });
        continue;
      }
      try {
        const res = await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          {
            vapidDetails: keys,
            TTL: 60 * 60 * 24,
            timeout: 10_000
          }
        );
        attempts.push({ subscriptionId: sub.id, statusCode: res.statusCode, outcome: "accepted" });
      } catch (e) {
        const err = e as { statusCode?: number; body?: string; message?: string };
        const status = typeof err.statusCode === "number" ? err.statusCode : null;
        if (status === 404 || status === 410) {
          await this.removeSubscription(sub.id);
          attempts.push({ subscriptionId: sub.id, statusCode: status, outcome: "expired_removed" });
          this.log.log(`[push:${tag}] subscription ${sub.id} gone (${status}); removed`);
        } else {
          const error = `${status ?? "network"}: ${(err.body || err.message || "unknown").slice(0, 200)}`;
          attempts.push({ subscriptionId: sub.id, statusCode: status, outcome: "failed", error });
          this.log.warn(`[push:${tag}] subscription ${sub.id} failed ${error}`);
        }
      }
    }

    const accepted = attempts.filter((a) => a.outcome === "accepted").length;
    const removed = attempts.filter((a) => a.outcome === "expired_removed").length;
    const failed = attempts.filter((a) => a.outcome === "failed").length;
    this.log.log(
      `[push:${tag}] user=${msg.userId} subs=${subs.length} accepted=${accepted} removed=${removed} failed=${failed}`
    );
    if (accepted > 0) return { delivered: true, attempted: subs.length, removed, attempts };
    if (failed > 0) {
      return {
        delivered: false,
        attempted: subs.length,
        removed,
        reason: attempts.find((a) => a.error)?.error ?? "push service refused",
        failure: "transient",
        attempts
      };
    }
    return {
      delivered: false,
      attempted: subs.length,
      removed,
      reason: removed > 0 ? "not sent: every subscription had expired and was removed" : "not sent: no web push subscription",
      failure: "no_subscriptions",
      attempts
    };
  }

  /** Delete a subscription the push service reported as gone (404 / 410). */
  async removeSubscription(id: string): Promise<number> {
    const rows = await this.db
      .delete(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.id, id))
      .returning({ id: schema.pushSubscriptions.id });
    return rows.length;
  }
}
