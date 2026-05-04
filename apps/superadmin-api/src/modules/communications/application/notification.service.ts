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
    private readonly repo: NotificationRepository
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

      return await this.repo.enqueue({
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
    } catch (err) {
      // Never throw — domain mutation must succeed even if notification fails.
      this.log.error(
        `queue notification failed: ${(err as Error).message}`,
        (err as Error).stack
      );
      return null;
    }
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
