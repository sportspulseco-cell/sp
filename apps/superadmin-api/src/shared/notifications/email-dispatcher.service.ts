import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text — also rendered as a minimal <pre>-style HTML body. */
  body: string;
  /** Optional override for `from`. Defaults to EMAIL_FROM_ADDRESS env. */
  from?: string;
  /** Caller-supplied tag for telemetry — appears in the structured log line. */
  channel?: string;
}

export interface DispatchResult {
  /** True when the message was handed off to a real provider (Resend). */
  delivered: boolean;
  /** Provider message id (Resend). null when we logged-only. */
  providerMessageId: string | null;
  /** Why we didn't deliver (env-not-set, dev-domain-rejected, etc). */
  reason?: string;
}

/**
 * Single send-email seam for the whole API.
 *
 * Wraps Resend behind an env-driven kill-switch so the same code paths
 * work in CI / local-dev / production without conditionals at every
 * call site:
 *
 *   - RESEND_API_KEY unset → log-only mode. Returns {delivered: false}
 *     with the rendered body in the logs. Callers MUST also surface
 *     the body to the admin UI as a copy/paste fallback (we already
 *     do this for invite + parental-consent).
 *   - RESEND_API_KEY set → real dispatch. EMAIL_FROM_ADDRESS controls
 *     the sender; defaults to onboarding@resend.dev which only delivers
 *     to verified addresses on the Resend free tier.
 *
 * NEVER commit the API key. It lives only in env vars (Vercel +
 * .env.local). The .env.example carries a placeholder.
 */
@Injectable()
export class EmailDispatcherService {
  private readonly log = new Logger(EmailDispatcherService.name);
  private client: Resend | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): Resend | null {
    if (this.client) return this.client;
    const key = this.config.get<string>("RESEND_API_KEY");
    if (!key) return null;
    this.client = new Resend(key);
    return this.client;
  }

  private getFrom(override?: string): string {
    return (
      override ??
      this.config.get<string>("EMAIL_FROM_ADDRESS") ??
      "onboarding@resend.dev"
    );
  }

  async send(msg: EmailMessage): Promise<DispatchResult> {
    const client = this.getClient();
    const from = this.getFrom(msg.from);
    const channel = msg.channel ?? "default";

    if (!client) {
      this.log.warn(
        `[email:${channel}] log-only (RESEND_API_KEY unset). to=${msg.to} subject="${msg.subject}"`
      );
      this.log.debug(`[email:${channel}] body:\n${msg.body}`);
      return {
        delivered: false,
        providerMessageId: null,
        reason: "RESEND_API_KEY not configured"
      };
    }

    try {
      const { data, error } = await client.emails.send({
        from,
        to: msg.to,
        subject: msg.subject,
        text: msg.body,
        html: bodyToHtml(msg.body)
      });
      if (error) {
        this.log.warn(
          `[email:${channel}] resend rejected to=${msg.to}: ${error.message}`
        );
        return {
          delivered: false,
          providerMessageId: null,
          reason: error.message
        };
      }
      this.log.log(
        `[email:${channel}] delivered to=${msg.to} id=${data?.id ?? "?"}`
      );
      return { delivered: true, providerMessageId: data?.id ?? null };
    } catch (e) {
      this.log.error(
        `[email:${channel}] dispatch threw to=${msg.to}: ${(e as Error).message}`
      );
      return {
        delivered: false,
        providerMessageId: null,
        reason: (e as Error).message
      };
    }
  }
}

/**
 * Minimal text → HTML so Resend can satisfy clients that prefer the
 * HTML part. Wraps in a system-font block, preserves paragraph breaks
 * and double-line gaps, escapes user content.
 */
function bodyToHtml(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family: -apple-system, system-ui, sans-serif; font-size:14px; line-height:1.5; color:#0f172a">${paragraphs}</div>`;
}
