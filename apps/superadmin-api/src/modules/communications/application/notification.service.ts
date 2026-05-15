import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
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
import { PushDispatcherService } from "../../../shared/notifications/push-dispatcher.service";
import { DRIZZLE } from "../../../shared/database/database.tokens";

/**
 * Map dispatcher template codes → `email_templates.event_type` enum.
 * Form-builder lets admins override the body per (season, event)
 * using the wider event-type names; we resolve to those when looking
 * for an override before falling back to the catalog default.
 *
 * Codes that don't map (registration approval/rejection use both —
 * `on_approved`/`on_rejected`) get a `null` override, i.e. always
 * use the catalog default.
 */
const TEMPLATE_CODE_TO_EVENT_TYPE: Partial<Record<TemplateCode, string>> = {
  "registration.approved": "on_approved",
  "registration.rejected": "on_rejected",
  "payment.confirmed": "on_payment",
  "installment.failed": "installment_reminder",
  "invoice.overdue.r1": "installment_reminder",
  "invoice.overdue.r2": "installment_reminder",
  "invoice.overdue.r3": "installment_reminder",
  "invoice.overdue.r4": "installment_reminder",
  "invoice.manual_reminder": "installment_reminder",
  SUB_INVOICE_REMINDER: "installment_reminder",
  INVOICE_OVERDUE_STAGE_1: "installment_reminder",
  INVOICE_OVERDUE_STAGE_2: "installment_reminder",
  INVOICE_OVERDUE_STAGE_3: "installment_reminder",
  INVOICE_OVERDUE_STAGE_4: "installment_reminder",
  INVOICE_MANUAL_REMIND: "installment_reminder"
};

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
    private readonly dispatcher: EmailDispatcherService,
    @Inject(PushDispatcherService)
    private readonly pushDispatcher: PushDispatcherService,
    @Inject(DRIZZLE) private readonly db: Database
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

      // Resolve subject + body. Email channel checks `email_templates`
      // for a per-season admin override before falling back to the
      // catalog default (P3-3 / audit §3.4). In-app stays on catalog.
      let subjectSource = tpl.subject;
      let bodySource = tpl.body;
      if (tplChannel === "email") {
        const override = await this.findEmailOverride(
          args.templateCode,
          args.payload
        );
        if (override) {
          subjectSource = override.subject;
          bodySource = override.bodyHtml;
        }
      }
      const subject = subjectSource
        ? renderTemplate(subjectSource, args.payload)
        : null;
      const body = renderTemplate(bodySource, args.payload);

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
      // Honor opt-outs in notification_preferences (P4-2). Marks
      // `suppressed` rather than `failed` so admins can tell the
      // delivery was skipped intentionally vs the provider rejecting.
      const optedOut = await this.isOptedOut(
        row.recipientPersonId,
        row.templateCode,
        "email"
      );
      if (optedOut) {
        await this.repo.incrementAttempt(row.id);
        await this.repo.markStatus(row.id, "suppressed", {
          lastError: "recipient opted out of this template/channel"
        });
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

    if (row.channel === "push") {
      if (!row.recipientPersonId) {
        await this.markFailed(row.id, "no recipientPersonId on row");
        return;
      }
      const optedOut = await this.isOptedOut(
        row.recipientPersonId,
        row.templateCode,
        "push"
      );
      if (optedOut) {
        await this.repo.incrementAttempt(row.id);
        await this.repo.markStatus(row.id, "suppressed", {
          lastError: "recipient opted out of this template/channel"
        });
        return;
      }
      // Resolve persons.user_id → auth.users.id for push lookup.
      const [person] = await this.db
        .select({ userId: schema.persons.userId })
        .from(schema.persons)
        .where(eq(schema.persons.id, row.recipientPersonId))
        .limit(1);
      if (!person?.userId) {
        await this.markFailed(row.id, "person has no linked auth user");
        return;
      }
      const result = await this.pushDispatcher.send({
        userId: person.userId,
        title: row.subject ?? row.templateCode,
        body: row.body,
        channel: row.templateCode
      });
      if (result.delivered) {
        await this.markSent(row.id);
      } else {
        await this.markFailed(row.id, result.reason ?? "no delivery");
      }
      return;
    }

    // SMS provider not wired yet — leave queued.
    this.log.warn(
      `no provider for channel=${row.channel} (notification ${row.id})`
    );
  }

  /**
   * Has the recipient opted out of this (templateCode, channel)?
   * Resolves the recipient's auth.users.id via persons.user_id, then
   * checks notification_preferences. Absence of a row = opted-in
   * (default-on). DB errors fall back to "not opted out" so a glitch
   * never silently swallows mission-critical mail.
   */
  private async isOptedOut(
    recipientPersonId: string | null,
    templateCode: string,
    channel: "email" | "in_app" | "sms" | "push"
  ): Promise<boolean> {
    if (!recipientPersonId) return false;
    try {
      const [row] = await this.db
        .select({ enabled: schema.notificationPreferences.enabled })
        .from(schema.notificationPreferences)
        .innerJoin(
          schema.persons,
          eq(schema.persons.userId, schema.notificationPreferences.userId)
        )
        .where(
          and(
            eq(schema.persons.id, recipientPersonId),
            eq(schema.notificationPreferences.templateCode, templateCode),
            eq(schema.notificationPreferences.channel, channel)
          )
        )
        .limit(1);
      return row ? row.enabled === false : false;
    } catch (err) {
      this.log.warn(
        `prefs lookup failed for person=${recipientPersonId} tpl=${templateCode}: ${(err as Error).message}`
      );
      return false;
    }
  }

  /**
   * Look up an admin-authored override in `email_templates` keyed by
   * (seasonId, eventType). `seasonId` is plucked from the payload —
   * callers that want overrides applied must pass it through.
   * Returns null when no mapping, no seasonId, or no active row.
   */
  private async findEmailOverride(
    templateCode: TemplateCode,
    payload: Record<string, unknown>
  ): Promise<{ subject: string; bodyHtml: string } | null> {
    const eventType = TEMPLATE_CODE_TO_EVENT_TYPE[templateCode];
    if (!eventType) return null;
    const seasonId = payload.seasonId;
    if (typeof seasonId !== "string" || !seasonId) return null;

    try {
      const [row] = await this.db
        .select({
          subject: schema.emailTemplates.subject,
          bodyHtml: schema.emailTemplates.bodyHtml
        })
        .from(schema.emailTemplates)
        .where(
          and(
            eq(schema.emailTemplates.seasonId, seasonId),
            eq(schema.emailTemplates.eventType, eventType),
            eq(schema.emailTemplates.isActive, true)
          )
        )
        .limit(1);
      return row ?? null;
    } catch (err) {
      // Never block the catalog fallback on a lookup error.
      this.log.warn(
        `email_templates override lookup failed for ${templateCode} season=${seasonId}: ${(err as Error).message}`
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
