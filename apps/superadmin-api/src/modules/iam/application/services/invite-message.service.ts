import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SYSTEM_ROLE_BY_CODE } from "@sportspulse/kernel";

export interface RenderedInviteMessage {
  /** Email subject line. */
  subject: string;
  /** Plain-text body — what we'll feed Resend, also what the admin copies to clipboard. */
  body: string;
  /** Where the message should go (email). */
  recipient: string;
}

export interface RenderInviteInput {
  email: string;
  displayName?: string | null;
  /** Set when admin chose "also set initial credentials" — included verbatim in the message. */
  password?: string | null;
  role?: {
    roleCode: string;
    scopeType: string;
    scopeId?: string | null;
  };
  /** Human label for the resource the role is granted on, e.g. "PPHL · Adult League". */
  scopeLabel?: string | null;
  /** Recorded as the inviter's name in the signature. */
  inviterDisplayName?: string | null;
}

/**
 * Renders the invite message we send (and that the admin also gets a
 * clipboard copy of for manual delivery via Slack/WhatsApp/SMS).
 *
 * Plain text only — easier to paste, easier to read, and lets a future
 * Resend wiring drop in without a template engine. Kept inline (no
 * Handlebars, no MJML) because the message is short and varies on a
 * handful of switches.
 */
@Injectable()
export class InviteMessageService {
  constructor(private readonly config: ConfigService) {}

  render(input: RenderInviteInput): RenderedInviteMessage {
    const appUrl =
      this.config.get<string>("SUPERADMIN_WEB_URL") ??
      "https://sp-superadmin.vercel.app";

    const greeting = input.displayName
      ? `Hi ${input.displayName.split(" ")[0]},`
      : "Hi,";

    const roleLine = input.role
      ? buildRoleLine(input.role.roleCode, input.scopeLabel ?? null)
      : "You've been invited to SportsPulse.";

    const credentialsBlock = input.password
      ? [
          "Your initial credentials:",
          `  Email:    ${input.email}`,
          `  Password: ${input.password}`,
          "",
          "Please sign in and change your password from the profile page."
        ].join("\n")
      : [
          "We've also sent you a one-click sign-in link.",
          "Open it from this email; you'll be asked to set a password on first sign-in."
        ].join("\n");

    const signOff = input.inviterDisplayName
      ? `— ${input.inviterDisplayName}, on behalf of SportsPulse`
      : "— SportsPulse";

    const body = [
      greeting,
      "",
      roleLine,
      "",
      `Sign in: ${appUrl}/sign-in`,
      "",
      credentialsBlock,
      "",
      "Reply to this email if anything looks off.",
      "",
      signOff
    ].join("\n");

    const subject = input.role
      ? `You're invited to SportsPulse — ${
          SYSTEM_ROLE_BY_CODE[input.role.roleCode]?.name ?? input.role.roleCode
        }`
      : "You're invited to SportsPulse";

    return { subject, body, recipient: input.email };
  }
}

function buildRoleLine(roleCode: string, scopeLabel: string | null): string {
  const def = SYSTEM_ROLE_BY_CODE[roleCode];
  const roleName = def?.name ?? roleCode;
  if (scopeLabel) {
    return `You've been invited to SportsPulse as ${roleName} for ${scopeLabel}.`;
  }
  return `You've been invited to SportsPulse as ${roleName}.`;
}
