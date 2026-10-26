import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { isE164 } from "@sportspulse/kernel";

export interface SmsMessage {
  /** E.164 number. Callers normalise with the kernel's normalizePhoneE164. */
  to: string;
  body: string;
  /** Telemetry tag (template code); appears in the structured log line. */
  channel?: string;
}

export interface SmsDispatchResult {
  /** True only when the provider accepted the message (HTTP 2xx with a sid). */
  delivered: boolean;
  /** Provider message id (Twilio `sid`). */
  providerMessageId: string | null;
  /** Why it was not delivered. */
  reason?: string;
  /**
   * `not_configured`: no provider credentials, nothing was attempted.
   * `permanent`: the provider refused this message for good (bad number,
   * opted out at the carrier); retrying cannot help.
   * `transient`: network error, 429 or 5xx; worth a retry.
   */
  failure?: "not_configured" | "permanent" | "transient";
  /** Provider HTTP status, when a request was made. */
  statusCode?: number;
  /** Provider error code (Twilio `code`), when it sent one. */
  providerCode?: number | null;
}

/** What a person or admin reads when SMS is not configured. */
export const SMS_NOT_SET_UP = "not sent: SMS is not set up for this league";

/**
 * SMS seam for the whole API, same contract as EmailDispatcherService:
 * env-driven, never throws, returns `delivered` only on a provider
 * acceptance.
 *
 * Provider: Twilio Programmable Messaging, Messages API
 *   POST {TWILIO_API_BASE_URL}/2010-04-01/Accounts/{SID}/Messages.json
 *   Basic auth SID:AUTH_TOKEN, form-encoded To, From | MessagingServiceSid, Body.
 *
 *   - TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + (TWILIO_FROM_NUMBER or
 *     TWILIO_MESSAGING_SERVICE_SID) unset -> `not_configured`; nothing is
 *     sent and NotificationService marks the row with SMS_NOT_SET_UP.
 *   - TWILIO_API_BASE_URL overrides https://api.twilio.com (tests point it
 *     at a local fake; never set it in a deployed environment).
 *
 * "Accepted" is Twilio's `queued`/`accepted`/`sent` answer, not handset
 * delivery. Delivery receipts (status callbacks) are not wired.
 */
@Injectable()
export class SmsDispatcherService {
  private readonly log = new Logger(SmsDispatcherService.name);

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  private settings(): {
    sid: string;
    token: string;
    from: string | null;
    messagingServiceSid: string | null;
    baseUrl: string;
  } | null {
    const sid = this.config.get<string>("TWILIO_ACCOUNT_SID")?.trim();
    const token = this.config.get<string>("TWILIO_AUTH_TOKEN")?.trim();
    const from = this.config.get<string>("TWILIO_FROM_NUMBER")?.trim() || null;
    const messagingServiceSid = this.config.get<string>("TWILIO_MESSAGING_SERVICE_SID")?.trim() || null;
    if (!sid || !token || (!from && !messagingServiceSid)) return null;
    const baseUrl = (this.config.get<string>("TWILIO_API_BASE_URL")?.trim() || "https://api.twilio.com").replace(/\/+$/, "");
    return { sid, token, from, messagingServiceSid, baseUrl };
  }

  /** True when credentials and a sender are configured. */
  isConfigured(): boolean {
    return this.settings() !== null;
  }

  async send(msg: SmsMessage): Promise<SmsDispatchResult> {
    const tag = msg.channel ?? "default";
    const s = this.settings();
    if (!s) {
      this.log.warn(`[sms:${tag}] not sent: Twilio credentials or sender unset`);
      return { delivered: false, providerMessageId: null, reason: SMS_NOT_SET_UP, failure: "not_configured" };
    }
    if (!isE164(msg.to)) {
      return {
        delivered: false,
        providerMessageId: null,
        reason: "not sent: the number is not in E.164 form",
        failure: "permanent"
      };
    }

    const form = twilioMessageForm({ to: msg.to, body: msg.body, from: s.from, messagingServiceSid: s.messagingServiceSid });
    const url = `${s.baseUrl}/2010-04-01/Accounts/${encodeURIComponent(s.sid)}/Messages.json`;
    const masked = `${msg.to.slice(0, 3)}…${msg.to.slice(-4)}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${s.sid}:${s.token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: form.toString(),
        signal: AbortSignal.timeout(10_000)
      });
      const text = await res.text();
      let json: { sid?: string; status?: string; code?: number; message?: string } = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }
      if (res.ok && json.sid) {
        this.log.log(`[sms:${tag}] accepted to=${masked} sid=${json.sid} status=${json.status ?? "?"}`);
        return { delivered: true, providerMessageId: json.sid, statusCode: res.status };
      }
      const transient = res.status === 429 || res.status >= 500;
      const reason = `provider ${res.status}${json.code ? ` code ${json.code}` : ""}: ${json.message ?? (text.slice(0, 200) || "no body")}`;
      this.log.warn(`[sms:${tag}] refused to=${masked} ${reason}`);
      return {
        delivered: false,
        providerMessageId: null,
        reason,
        failure: transient ? "transient" : "permanent",
        statusCode: res.status,
        providerCode: json.code ?? null
      };
    } catch (e) {
      const reason = `provider unreachable: ${(e as Error).message}`;
      this.log.error(`[sms:${tag}] ${reason} to=${masked}`);
      return { delivered: false, providerMessageId: null, reason, failure: "transient" };
    }
  }
}

/** The form body of one Twilio Messages API create request. Exported for the shape test. */
export function twilioMessageForm(args: {
  to: string;
  body: string;
  from: string | null;
  messagingServiceSid: string | null;
}): URLSearchParams {
  const form = new URLSearchParams();
  form.set("To", args.to);
  // A Messaging Service picks the sender itself; From is then omitted.
  if (args.messagingServiceSid) form.set("MessagingServiceSid", args.messagingServiceSid);
  else if (args.from) form.set("From", args.from);
  form.set("Body", args.body);
  return form;
}
