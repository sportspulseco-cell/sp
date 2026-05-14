import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  NOTIFICATION_REPOSITORY,
  type NotificationChannel,
  type NotificationRepository,
  type NotificationRow
} from "../domain/repositories/notification.repository";
import {
  findDefaultTemplate,
  renderTemplate,
  type TemplateCode
} from "../domain/templates/catalog";
import { EmailDispatcherService } from "../../../shared/notifications/email-dispatcher.service";

export interface QueueArgs {
  orgId?: string | null;
  templateCode: TemplateCode;
  channel?: NotificationChannel;
  /**
   * Idempotency key — should be a function of (event, recipient, version).
   * Re-calling with the same key is a no-op.
   */
  idempotencyKey: string;
  recipientPersonId?: string | null;
  recipientEmail?: string | null;
  /** Variables substituted into the template. */
  payload: Record<string, unknown>;
  sourceEvent?: string | null;
}

/**
 * Application-level notification facade. Other modules call this from their
 * command handlers — the side effect is fire-and-forget (errors logged but
 * never thrown back to the caller, so a notification failure can't roll back
 * a domain mutation).
 */
@Injectable()
export class NotificationService {
  private readonly log = new Logger(NotificationService.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: NotificationRepository,
    @Inject(EmailDispatcherService)
    private readonly dispatcher: EmailDispatcherService
  ) {}

  /** Queue a templated notification. Returns the row (existing or new). */
  async queue(args: QueueArgs): Promise<NotificationRow | null> {
    try {
      const channel = args.channel ?? "email";
      const tplChannel: "email" | "in_app" =
        channel === "in_app" ? "in_app" : "email";
      const tpl = findDefaultTemplate(args.templateCode, tplChannel);
      if (!tpl) {
        this.log.warn(
          `no template for code=${args.templateCode} channel=${channel}`
        );
        return null;
      }
      const subject = tpl.subject
        ? renderTemplate(tpl.subject, args.payload)
        : null;
      const body = renderTemplate(tpl.body, args.payload);

      const row = await this.repo.enqueue({
        orgId: args.orgId ?? null,
        idempotencyKey: args.idempotencyKey,
        templateCode: args.templateCode,
        channel,
        subject,
        body,
        recipientPersonId: args.recipientPersonId ?? null,
        recipientEmail: args.recipientEmail ?? null,
        payload: args.payload,
        sourceEvent: args.sourceEvent ?? args.templateCode
      });

      // Inline dispatch — fire-and-forget so the caller's domain mutation
      // is never blocked or rolled back by a transport failure. Anything
      // that fails here stays queued and can be retried via the flush
      // endpoint.
      if (row.status === "queued") {
        void this.dispatch(row).catch((err) => {
          this.log.error(
            `inline dispatch failed for ${row.id}: ${(err as Error).message}`
          );
        });
      }
      return row;
    } catch (err) {
      // Never throw — domain mutation must succeed even if notification fails.
      this.log.error(
        `queue notification failed: ${(err as Error).message}`,
        (err as Error).stack
      );
      return null;
    }
  }

  /**
   * Route a queued row to the right provider and mark sent/failed.
   * Centralised so the inline path (`queue`) and the bulk path
   * (`FlushQueuedHandler`) share the same delivery rules.
   */
  async dispatch(row: NotificationRow): Promise<void> {
    if (row.status === "sent") return;

    if (row.channel === "in_app") {
      // Delivery is implicit — the row itself IS the notification, the
      // recipient reads it via /notifications/recent. Mark sent.
      await this.markSent(row.id);
      return;
    }

    if (row.channel === "email") {
      if (!row.recipientEmail) {
        await this.markFailed(row.id, "no recipientEmail on row");
        return;
      }
      const result = await this.dispatcher.send({
        to: row.recipientEmail,
        subject: row.subject ?? row.templateCode,
        body: row.body,
        channel: row.templateCode
      });
      if (result.delivered) {
        await this.markSent(row.id);
      } else {
        await this.markFailed(row.id, result.reason ?? "unknown");
      }
      return;
    }

    // SMS provider not wired yet — leave queued.
    this.log.warn(
      `no provider for channel=${row.channel} (notification ${row.id})`
    );
  }

  /** Mark queued → sent (used by stub provider for now). */
  async markSent(id: string) {
    await this.repo.incrementAttempt(id);
    return this.repo.markStatus(id, "sent", { sentAt: new Date() });
  }

  /** Mark queued → failed. */
  async markFailed(id: string, error: string) {
    await this.repo.incrementAttempt(id);
    return this.repo.markStatus(id, "failed", { lastError: error });
  }
}

export const NOTIFICATION_SERVICE = NotificationService;
