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
 * Maps role codes to the canonical app surface the invitee should
 * sign in on. Keeps the sp-superadmin URL out of invites sent to
 * player / captain / org_admin recipients — CLAUDE.md cardinal rule:
 * the sa-web URL is confidential and must not appear in non-SA users'
 * mailboxes.
 */
const PLAYER_ROLES = new Set(["player", "parent", "spectator", "free_agent"]);
const TEAM_ROLES = new Set(["team_admin", "captain", "coach"]);
const ORG_ROLES = new Set(["org_admin"]);

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
    const appUrl = this.resolveAppUrl(input.role?.roleCode);

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

  private resolveAppUrl(roleCode: string | undefined): string {
    if (roleCode && PLAYER_ROLES.has(roleCode)) {
      return (
        this.config.get<string>("PLAYER_WEB_URL") ??
        "https://sp-player-red.vercel.app"
      );
    }
    if (roleCode && TEAM_ROLES.has(roleCode)) {
      return (
        this.config.get<string>("TEAM_ADMIN_WEB_URL") ??
        "https://sp-team-admin.vercel.app"
      );
    }
    if (roleCode && ORG_ROLES.has(roleCode)) {
      return (
        this.config.get<string>("ORG_ADMIN_WEB_URL") ??
        "https://sp-org-admin.vercel.app"
      );
    }
    // Every remaining role (super_admin, league_admin, registrar, referee,
    // scorekeeper, et al) lives on sa-web per the post-P5-D consolidation.
    return (
      this.config.get<string>("SUPERADMIN_WEB_URL") ??
      "https://sp-superadmin.vercel.app"
    );
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
