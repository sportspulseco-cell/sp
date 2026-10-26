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
  CHANNEL_DEFAULT_ON,
  MOBILE_CHANNEL_CODES,
  findDefaultTemplate,
  renderTemplate,
  type TemplateCode
} from "../domain/templates/catalog";
import { EmailDispatcherService } from "../../../shared/notifications/email-dispatcher.service";
import { PushDispatcherService } from "../../../shared/notifications/push-dispatcher.service";
import {
  SMS_NOT_SET_UP,
  SmsDispatcherService
} from "../../../shared/notifications/sms-dispatcher.service";
import { normalizePhoneE164, smsText } from "@sportspulse/kernel";
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
    @Inject(SmsDispatcherService)
    private readonly smsDispatcher: SmsDispatcherService,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  /** Queue a templated notification. Returns the row (existing or new). */
  async queue(args: QueueArgs): Promise<NotificationRow | null> {
    try {
      const channel = args.channel ?? "email";
      // A notice must name who gets it (COMP-19). A row with no person and
      // no email can never be delivered or read, so none is written.
      if (!args.recipientPersonId && !args.recipientEmail) {
        this.log.warn(
          `refused code=${args.templateCode} key=${args.idempotencyKey}: no recipient`
        );
        return null;
      }
      // An email to a person: use their sign-in email when the caller
      // did not pass one, instead of writing a row that fails at send.
      let recipientEmail = args.recipientEmail ?? null;
      if (channel === "email" && !recipientEmail && args.recipientPersonId) {
        recipientEmail = await this.emailForPerson(args.recipientPersonId);
        if (!recipientEmail) {
          // No account, so no inbox either: nothing could reach them.
          this.log.warn(
            `refused code=${args.templateCode} key=${args.idempotencyKey}: person ${args.recipientPersonId} has no email`
          );
          return null;
        }
      }
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
        recipientEmail,
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

  /** The person's sign-in email, or null when they have no account. */
  private async emailForPerson(personId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ email: schema.profiles.email })
      .from(schema.persons)
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId))
      .where(eq(schema.persons.id, personId))
      .limit(1);
    return row?.email ?? null;
  }

  /**
   * Route a queued row to the right provider and mark its final state.
   * Centralised so the inline path (`queue`), the flush endpoint and the
   * cron sweep share the same delivery rules.
   *
   * Final states a row can end in:
   *   sent        provider accepted it (email, SMS, push) or the inbox holds it (in_app)
   *   suppressed  deliberately not sent, with the reason in last_error:
   *               opted out, SMS / push not set up, no number, no device
   *   failed      provider refused or was unreachable; the cron retries
   *               up to 3 attempts, a permanent refusal uses all 3 at once
   */
  async dispatch(row: NotificationRow): Promise<void> {
    if (row.status === "sent") return;

    // A message to a person on the email or in-app channel also goes by
    // text and push when they have those on (FR-3.10.2).
    if ((row.channel === "email" || row.channel === "in_app") && row.recipientPersonId) {
      await this.fanOutMobile(row).catch((err) =>
        this.log.error(`fan-out failed for ${row.id}: ${(err as Error).message}`)
      );
    }

    if (row.channel === "in_app") {
      // Delivery is implicit — the row itself IS the notification, the
      // recipient reads it via /notifications/me. Mark sent, unless the
      // person switched this code off in-app (the inbox hides it too).
      if (await this.isOptedOut(row.recipientPersonId, row.templateCode, "in_app")) {
        await this.markSuppressed(row.id, "recipient opted out of this template/channel");
        this.log.log(`suppressed in_app ${row.templateCode} ${row.id}: recipient opted out`);
        return;
      }
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
      if (await this.isOptedOut(row.recipientPersonId, row.templateCode, "email")) {
        await this.markSuppressed(row.id, "recipient opted out of this template/channel");
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

    if (row.channel === "sms") {
      await this.dispatchSms(row);
      return;
    }

    if (row.channel === "push") {
      await this.dispatchPush(row);
      return;
    }

    this.log.warn(`no provider for channel=${row.channel} (notification ${row.id})`);
    await this.markSuppressed(row.id, `not sent: unknown channel ${row.channel}`);
  }

  /**
   * One text message. Order of refusals, each final and named:
   * not opted in -> SMS not set up -> no person / account -> no number or
   * a number that is not a mobile in E.164 -> provider answer.
   */
  private async dispatchSms(row: NotificationRow): Promise<void> {
    if (!row.recipientPersonId) {
      await this.markSuppressed(row.id, "not sent: no person on the row");
      return;
    }
    if (await this.isOptedOut(row.recipientPersonId, row.templateCode, "sms")) {
      await this.markSuppressed(row.id, "recipient has not turned on text messages for this topic");
      return;
    }
    if (!this.smsDispatcher.isConfigured()) {
      await this.markSuppressed(row.id, SMS_NOT_SET_UP);
      this.log.log(`sms ${row.id} ${row.templateCode}: ${SMS_NOT_SET_UP}`);
      return;
    }
    const [p] = await this.db
      .select({ phone: schema.profiles.phoneE164, country: schema.profiles.countryCode })
      .from(schema.persons)
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId))
      .where(eq(schema.persons.id, row.recipientPersonId))
      .limit(1);
    if (!p?.phone) {
      await this.markSuppressed(row.id, "not sent: no mobile number on file");
      return;
    }
    const norm = normalizePhoneE164(p.phone, p.country ?? "US");
    if (!norm.ok) {
      await this.markSuppressed(row.id, `not sent: the number on file is not valid (${norm.reason})`);
      return;
    }
    const result = await this.smsDispatcher.send({
      to: norm.e164,
      body: smsText(row.subject, row.body),
      channel: row.templateCode
    });
    await this.logDelivery(row.id, "twilio", {
      status: result.delivered ? "sent" : "failed",
      providerMessageId: result.providerMessageId,
      statusCode: result.statusCode ?? null,
      response: { failure: result.failure ?? null, providerCode: result.providerCode ?? null, reason: result.reason ?? null }
    });
    if (result.delivered) {
      await this.markSent(row.id);
    } else if (result.failure === "not_configured") {
      await this.markSuppressed(row.id, SMS_NOT_SET_UP);
    } else if (result.failure === "permanent") {
      await this.markFailed(row.id, result.reason ?? "provider refused", { final: true });
    } else {
      await this.markFailed(row.id, result.reason ?? "provider unreachable");
    }
  }

  private async dispatchPush(row: NotificationRow): Promise<void> {
    if (!row.recipientPersonId) {
      await this.markSuppressed(row.id, "not sent: no person on the row");
      return;
    }
    if (await this.isOptedOut(row.recipientPersonId, row.templateCode, "push")) {
      await this.markSuppressed(row.id, "recipient opted out of this template/channel");
      return;
    }
    // Resolve persons.user_id → auth.users.id for push lookup.
    const [person] = await this.db
      .select({ userId: schema.persons.userId })
      .from(schema.persons)
      .where(eq(schema.persons.id, row.recipientPersonId))
      .limit(1);
    if (!person?.userId) {
      await this.markSuppressed(row.id, "not sent: person has no account");
      return;
    }
    const result = await this.pushDispatcher.send({
      userId: person.userId,
      title: row.subject ?? row.templateCode,
      body: smsText(null, row.body, 240),
      url: pushUrl(row.payload),
      channel: row.templateCode,
      notificationId: row.id
    });
    if (result.attempts.length > 0) {
      await this.logDelivery(row.id, "web-push", {
        status: result.delivered ? "sent" : "failed",
        providerMessageId: null,
        statusCode: result.attempts[0]?.statusCode ?? null,
        response: { attempts: result.attempts, removed: result.removed }
      });
    }
    if (result.delivered) await this.markSent(row.id);
    else if (result.failure === "transient") await this.markFailed(row.id, result.reason ?? "push service refused");
    else await this.markSuppressed(row.id, result.reason ?? "not sent");
  }

  /**
   * Text and push copies of an email / in-app message for a person. Keys
   * follow the multi-channel convention (`<base>-sms`, `<base>-push`), so
   * the email and in-app twins of one message share one SMS and one push,
   * and the inbox shows none of them. Only topics a person can manage in
   * notification settings fan out. A copy is written only when it could
   * matter: SMS when the person turned text on for that topic (opt-in),
   * push when they have a device subscribed and have not switched it off.
   * Each copy is written once; a retry of the email does not resend it.
   */
  private async fanOutMobile(row: NotificationRow): Promise<void> {
    if (!MOBILE_CHANNEL_CODES.has(row.templateCode) || !row.recipientPersonId) return;
    const base = row.idempotencyKey.replace(/-(email|in_app)$/, "");
    const [person] = await this.db
      .select({ userId: schema.persons.userId })
      .from(schema.persons)
      .where(eq(schema.persons.id, row.recipientPersonId))
      .limit(1);
    if (!person?.userId) return;

    const wants: Array<"sms" | "push"> = [];
    if (!(await this.isOptedOut(row.recipientPersonId, row.templateCode, "sms"))) wants.push("sms");
    if (
      !(await this.isOptedOut(row.recipientPersonId, row.templateCode, "push")) &&
      (await this.pushDispatcher.hasActiveSubscription(person.userId))
    ) {
      wants.push("push");
    }
    for (const channel of wants) {
      const key = `${base}-${channel}`;
      if (await this.repo.findByIdempotencyKey(key)) continue;
      const copy = await this.repo.enqueue({
        orgId: row.orgId,
        idempotencyKey: key,
        templateCode: row.templateCode,
        channel,
        subject: row.subject,
        body: row.body,
        recipientPersonId: row.recipientPersonId,
        recipientEmail: null,
        payload: row.payload,
        sourceEvent: row.sourceEvent
      });
      this.log.log(`fan-out ${row.id} -> ${channel} ${copy.id} (${row.templateCode})`);
      if (copy.status === "queued") await this.dispatch(copy);
    }
  }

  /**
   * Is this (templateCode, channel) off for the recipient? Resolves the
   * recipient's auth.users.id via persons.user_id, then reads
   * notification_preferences. With no row the channel default applies:
   * email, in-app and push are on until switched off; SMS is off until
   * the person turns it on (consent to texts is opt-in). A lookup error
   * falls back to the default, so a glitch never silently swallows mail
   * and never sends a text nobody asked for.
   */
  private async isOptedOut(
    recipientPersonId: string | null,
    templateCode: string,
    channel: "email" | "in_app" | "sms" | "push"
  ): Promise<boolean> {
    const defaultOn = CHANNEL_DEFAULT_ON[channel];
    if (!recipientPersonId) return !defaultOn;
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
      return row ? row.enabled === false : !defaultOn;
    } catch (err) {
      this.log.warn(
        `prefs lookup failed for person=${recipientPersonId} tpl=${templateCode}: ${(err as Error).message}`
      );
      return !defaultOn;
    }
  }

  /** Append one provider attempt to notification_delivery_logs. Never throws. */
  private async logDelivery(
    notificationId: string,
    provider: string,
    a: { status: string; providerMessageId: string | null; statusCode: number | null; response: Record<string, unknown> }
  ): Promise<void> {
    try {
      await this.db.insert(schema.notificationDeliveryLogs).values({
        notificationId,
        provider,
        providerMessageId: a.providerMessageId,
        status: a.status,
        statusCode: a.statusCode,
        response: a.response
      });
    } catch (err) {
      this.log.warn(`delivery log write failed for ${notificationId}: ${(err as Error).message}`);
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

  /** Mark queued → sent. */
  async markSent(id: string) {
    await this.repo.incrementAttempt(id);
    return this.repo.markStatus(id, "sent", { sentAt: new Date() });
  }

  /**
   * Mark failed. `final` uses up the retry budget at once: the provider
   * refused this message for good, so the cron must not try again.
   */
  async markFailed(id: string, error: string, opts: { final?: boolean } = {}) {
    await this.repo.incrementAttempt(id);
    if (opts.final) await this.repo.exhaustAttempts(id);
    return this.repo.markStatus(id, "failed", { lastError: error });
  }

  /** Deliberately not sent; final, never retried. `reason` says why. */
  async markSuppressed(id: string, reason: string) {
    await this.repo.incrementAttempt(id);
    return this.repo.markStatus(id, "suppressed", { lastError: reason });
  }
}

/** Where a push opens: a link in the payload when it is ours, else the inbox. */
function pushUrl(payload: Record<string, unknown>): string {
  for (const k of ["url", "invoiceUrl", "link"]) {
    const v = payload[k];
    if (typeof v === "string" && (v.startsWith("/") || v.startsWith("https://"))) return v;
  }
  return "/notifications";
}

export const NOTIFICATION_SERVICE = NotificationService;
