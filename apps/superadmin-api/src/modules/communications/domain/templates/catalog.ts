/**
 * Built-in template catalog. Stable codes used across the platform.
 * UI-overridable templates (per-org, localized) live in the
 * `notification_templates` table; codes here are the fallback / default.
 */
import { NOTIFICATION_TEMPLATE_CODES } from "@sportspulse/kernel";

// The code list is canonical in the kernel (shared with the web apps).
export const TEMPLATE_CODES = NOTIFICATION_TEMPLATE_CODES;

export type TemplateCode = (typeof TEMPLATE_CODES)[number];

/** Channels a person can switch on or off per topic. */
export const PREFERENCE_CHANNELS = ["email", "in_app", "sms", "push"] as const;
export type PreferenceChannel = (typeof PREFERENCE_CHANNELS)[number];

/**
 * A channel with no preference row: email, in-app and push are on until
 * switched off (push also needs a subscribed device); text messages are
 * off until the person turns them on, because texts need consent.
 */
export const CHANNEL_DEFAULT_ON: Record<PreferenceChannel, boolean> = {
  email: true,
  in_app: true,
  sms: false,
  push: true
};

/**
 * The notifications a person can turn off, one row per topic in the
 * settings page. A topic covers every template code that sends the same
 * kind of message (four overdue stages are one "Overdue reminder" row).
 * The settings page renders this list as the API returns it, so a new
 * code reaches the page by being added here, never by a copy in the UI.
 * Codes not listed (admin-only, invites to people without an account)
 * cannot be turned off.
 */
export interface PreferenceTopic {
  key: string;
  label: string;
  description: string;
  category: string;
  codes: TemplateCode[];
}

export const PREFERENCE_TOPICS: PreferenceTopic[] = [
  // Games (UC-21, SCH-6, SCH-8)
  { key: "schedule.published", category: "Games", label: "Schedule published", description: "When your team's schedule is out.", codes: ["schedule.published"] },
  { key: "game.scheduled", category: "Games", label: "New game", description: "When a game is added to your team's schedule.", codes: ["game.scheduled"] },
  { key: "game.reminder", category: "Games", label: "Game reminder", description: "A reminder about a day before each of your games.", codes: ["game.reminder"] },
  { key: "game.rescheduled", category: "Games", label: "Game moved", description: "When a game's time or rink changes.", codes: ["game.rescheduled"] },
  { key: "game.postponed", category: "Games", label: "Game postponed or cancelled", description: "When a game is postponed or cancelled.", codes: ["game.postponed", "game.cancelled"] },
  { key: "game.official_assigned", category: "Games", label: "Officiating assignment", description: "When you are put on a game's crew as a referee or scorekeeper.", codes: ["game.official_assigned"] },
  { key: "game.finalized", category: "Games", label: "Final score", description: "When a game is final and stats are in.", codes: ["game.finalized"] },
  // Announcements (UC-19, UC-20)
  { key: "org.broadcast", category: "Announcements", label: "Announcements", description: "Messages from your league, organization, captain or coach.", codes: ["org.broadcast"] },
  // Registration
  { key: "registration.approved", category: "Registration", label: "Registration approved", description: "When an admin approves your season registration.", codes: ["registration.approved"] },
  { key: "registration.rejected", category: "Registration", label: "Registration declined", description: "When an admin declines your season registration.", codes: ["registration.rejected"] },
  { key: "registration.waitlisted", category: "Registration", label: "Waitlisted", description: "When you're placed on a season waitlist.", codes: ["registration.waitlisted"] },
  // Team activity
  { key: "PLAYER_JOIN_APPROVED", category: "Team activity", label: "Captain accepted you", description: "When a captain accepts your request to join.", codes: ["PLAYER_JOIN_APPROVED"] },
  { key: "PLAYER_JOIN_REJECTED", category: "Team activity", label: "Captain declined you", description: "When a captain declines your request to join.", codes: ["PLAYER_JOIN_REJECTED"] },
  { key: "FREE_AGENT_OFFER", category: "Team activity", label: "Team offer", description: "When a captain or admin offers you a spot.", codes: ["FREE_AGENT_OFFER"] },
  { key: "DROP_CONFIRMED", category: "Team activity", label: "Removed from roster", description: "When you are dropped from a roster.", codes: ["DROP_CONFIRMED"] },
  { key: "suspension", category: "Team activity", label: "Suspensions", description: "When a suspension is issued or lifted.", codes: ["suspension.issued", "suspension.lifted"] },
  // Payments
  { key: "invoice.created", category: "Payments", label: "New invoice", description: "When an invoice or your share of team dues is issued.", codes: ["invoice.created", "SUB_INVOICE_SENT"] },
  { key: "payment.confirmed", category: "Payments", label: "Payment received", description: "When a payment from you goes through.", codes: ["payment.confirmed"] },
  { key: "installment.failed", category: "Payments", label: "Installment failed", description: "When a scheduled card payment fails.", codes: ["installment.failed"] },
  { key: "invoice.overdue", category: "Payments", label: "Payment reminders", description: "Reminders when an invoice or your dues share is unpaid or past due.", codes: ["invoice.overdue.r1", "invoice.overdue.r2", "invoice.overdue.r3", "invoice.overdue.r4", "INVOICE_OVERDUE_STAGE_1", "INVOICE_OVERDUE_STAGE_2", "INVOICE_OVERDUE_STAGE_3", "INVOICE_OVERDUE_STAGE_4", "invoice.manual_reminder", "INVOICE_MANUAL_REMIND", "SUB_INVOICE_REMINDER"] },
  { key: "captain.covered_dues", category: "Payments", label: "Dues covered by captain", description: "When your captain pays your share.", codes: ["captain.covered_dues", "DUES_COVERED_BY_CAPTAIN"] },
  { key: "refund.issued", category: "Payments", label: "Refund issued", description: "When a refund is sent to you.", codes: ["refund.issued"] },
  // Compliance
  { key: "membership", category: "Compliance", label: "Membership expiring or expired", description: "Before and after your governing-body membership lapses.", codes: ["USA_HOCKEY_EXPIRING_SOON", "USA_HOCKEY_EXPIRED"] },
  { key: "compliance.document.decided", category: "Compliance", label: "Document reviewed", description: "When an admin accepts or rejects a document you uploaded.", codes: ["compliance.document.decided", "eligibility.waived"] },
  // Running a team (captains and coaches)
  { key: "PLAYER_JOIN_REQUEST", category: "Running a team", label: "Join requests", description: "When a player asks to join your team.", codes: ["PLAYER_JOIN_REQUEST"] },
  { key: "FREE_AGENT_OFFER_REPLY", category: "Running a team", label: "Offer replies", description: "When a player accepts or declines your offer.", codes: ["FREE_AGENT_OFFER_ACCEPTED", "FREE_AGENT_OFFER_DECLINED"] },
  { key: "TEAM_REGISTRATION", category: "Running a team", label: "Team registration", description: "When your team's registration is received, approved, declined or withdrawn.", codes: ["TEAM_REGISTRATION_APPLIED_CONFIRMATION", "TEAM_REGISTRATION_APPROVED", "TEAM_REGISTRATION_REJECTED", "TEAM_REGISTRATION_WITHDRAWN", "TEAM_CONFIRMED"] },
  { key: "team.compliance", category: "Running a team", label: "Player eligibility", description: "When a player's membership lapses or a document is decided.", codes: ["USA_HOCKEY_EXPIRED_CAPTAIN", "compliance.document.decided.captain", "eligibility.waived.captain", "INVITE_EXPIRED_CAPTAIN"] }
];

/** Every code a person may switch off. */
export const PREFERENCE_CODES: ReadonlySet<string> = new Set(PREFERENCE_TOPICS.flatMap((t) => t.codes));

/**
 * Codes that also go by text and push (FR-3.10.2): the topics a person
 * manages in notification settings, so every text or push they get is
 * one they can switch off on the same page.
 */
export const MOBILE_CHANNEL_CODES: ReadonlySet<string> = PREFERENCE_CODES;

export interface DefaultTemplate {
  code: TemplateCode;
  channel: "email" | "in_app";
  subject: string;
  body: string;
  variables: string[];
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    code: "registration.submitted",
    channel: "email",
    subject: "Registration received — {{leagueName}}",
    body:
      "Hi {{personName}},\n\nWe've received your registration for {{leagueName}}. " +
      "An admin will review it shortly.",
    variables: ["personName", "leagueName"]
  },
  {
    code: "registration.approved",
    channel: "email",
    subject: "Registration approved — {{leagueName}}",
    body:
      "Hi {{personName}},\n\nGreat news — your registration for " +
      "{{leagueName}} has been approved. You're cleared to take the ice / field.",
    variables: ["personName", "leagueName"]
  },
  {
    code: "registration.rejected",
    channel: "email",
    subject: "Registration update — {{leagueName}}",
    body:
      "Hi {{personName}},\n\nUnfortunately your registration for {{leagueName}} " +
      "could not be approved. Reason: {{reason}}",
    variables: ["personName", "leagueName", "reason"]
  },
  {
    code: "registration.waitlisted",
    channel: "email",
    subject: "You're on the waitlist — {{leagueName}}",
    body:
      "Hi {{personName}},\n\nYou've been placed on the waitlist for " +
      "{{leagueName}}. We'll reach out if a spot opens up.",
    variables: ["personName", "leagueName"]
  },
  {
    code: "game.finalized",
    channel: "email",
    subject: "Final score — {{awayTeam}} {{awayScore}} @ {{homeTeam}} {{homeScore}}",
    body:
      "The game between {{awayTeam}} and {{homeTeam}} is final.\n\n" +
      "Final score: {{awayTeam}} {{awayScore}} – {{homeScore}} {{homeTeam}}.",
    variables: ["awayTeam", "homeTeam", "awayScore", "homeScore"]
  },
  // Game notices go to both teams' rostered players and captains, one row
  // per person: email when the person has an address, in-app otherwise
  // (the inbox lists every row addressed to the person).
  {
    code: "game.finalized",
    channel: "in_app",
    subject: "Final: {{awayTeam}} {{awayScore}}, {{homeTeam}} {{homeScore}}",
    body:
      "Final score: {{awayTeam}} {{awayScore}}, {{homeTeam}} {{homeScore}}{{endedInClause}}. " +
      "Stats and standings are updated.",
    variables: ["awayTeam", "homeTeam", "awayScore", "homeScore", "endedInClause"]
  },
  {
    code: "game.scheduled",
    channel: "email",
    subject: "New game: {{awayTeam}} at {{homeTeam}}, {{whenLabel}}",
    body:
      "{{awayTeam}} play at {{homeTeam}} on {{whenLabel}}{{venueClause}}.\n\n" +
      "The game is on your team schedule.",
    variables: ["awayTeam", "homeTeam", "whenLabel", "venueClause"]
  },
  {
    code: "game.scheduled",
    channel: "in_app",
    subject: "New game: {{awayTeam}} at {{homeTeam}}",
    body: "{{awayTeam}} play at {{homeTeam}} on {{whenLabel}}{{venueClause}}.",
    variables: ["awayTeam", "homeTeam", "whenLabel", "venueClause"]
  },
  // FR-3.17.3: sent by the hourly reminder sweep, about a day ahead.
  {
    code: "game.reminder",
    channel: "email",
    subject: "Reminder: {{awayTeam}} at {{homeTeam}}, {{whenLabel}}",
    body:
      "Your game is coming up: {{awayTeam}} play at {{homeTeam}} on {{whenLabel}}{{venueClause}}.\n\n" +
      "Check your team schedule for any changes.",
    variables: ["awayTeam", "homeTeam", "whenLabel", "venueClause"]
  },
  {
    code: "game.reminder",
    channel: "in_app",
    subject: "Reminder: {{awayTeam}} at {{homeTeam}}",
    body: "Your game is coming up: {{awayTeam}} play at {{homeTeam}} on {{whenLabel}}{{venueClause}}.",
    variables: ["awayTeam", "homeTeam", "whenLabel", "venueClause"]
  },
  {
    code: "schedule.published",
    channel: "email",
    subject: "{{teamName}} schedule is out: {{gameCount}} {{gamesWord}}",
    body:
      "The {{seasonName}} schedule for {{teamName}} is published: {{gameCount}} {{gamesWord}}.\n\n" +
      "First game: {{firstGameLabel}} against {{firstOpponent}}{{firstVenueClause}}.\n\n" +
      "Every game is on your team schedule in SportsPulse.",
    variables: ["teamName", "seasonName", "gameCount", "gamesWord", "firstGameLabel", "firstOpponent", "firstVenueClause"]
  },
  {
    code: "schedule.published",
    channel: "in_app",
    subject: "{{teamName}} schedule is out: {{gameCount}} {{gamesWord}}",
    body:
      "{{seasonName}}: {{gameCount}} {{gamesWord}} for {{teamName}}. First game {{firstGameLabel}} against {{firstOpponent}}{{firstVenueClause}}.",
    variables: ["teamName", "seasonName", "gameCount", "gamesWord", "firstGameLabel", "firstOpponent", "firstVenueClause"]
  },
  {
    code: "game.postponed",
    channel: "email",
    subject: "Game postponed: {{awayTeam}} at {{homeTeam}}",
    body:
      "Your game {{awayTeam}} at {{homeTeam}} on {{whenLabel}}{{venueClause}} is postponed.\n\n" +
      "The league will send the new date when it is set.",
    variables: ["awayTeam", "homeTeam", "whenLabel", "venueClause"]
  },
  {
    code: "game.postponed",
    channel: "in_app",
    subject: "Game postponed: {{awayTeam}} at {{homeTeam}}",
    body:
      "{{awayTeam}} at {{homeTeam}} on {{whenLabel}}{{venueClause}} is postponed. A new date will follow.",
    variables: ["awayTeam", "homeTeam", "whenLabel", "venueClause"]
  },
  {
    code: "game.cancelled",
    channel: "email",
    subject: "Game cancelled: {{awayTeam}} at {{homeTeam}}",
    body:
      "Your game {{awayTeam}} at {{homeTeam}} on {{whenLabel}}{{venueClause}} is cancelled.",
    variables: ["awayTeam", "homeTeam", "whenLabel", "venueClause"]
  },
  {
    code: "game.cancelled",
    channel: "in_app",
    subject: "Game cancelled: {{awayTeam}} at {{homeTeam}}",
    body: "{{awayTeam}} at {{homeTeam}} on {{whenLabel}}{{venueClause}} is cancelled.",
    variables: ["awayTeam", "homeTeam", "whenLabel", "venueClause"]
  },
  {
    code: "game.rescheduled",
    channel: "email",
    subject: "Game moved: {{awayTeam}} at {{homeTeam}}",
    body:
      "Your game {{awayTeam}} at {{homeTeam}} has moved.\n\n" +
      "Was: {{fromLabel}}{{fromVenueClause}}\n" +
      "Now: {{toLabel}}{{toVenueClause}}{{reasonClause}}",
    variables: [
      "awayTeam",
      "homeTeam",
      "fromLabel",
      "fromVenueClause",
      "toLabel",
      "toVenueClause",
      "reasonClause"
    ]
  },
  {
    code: "game.rescheduled",
    channel: "in_app",
    subject: "Game moved: {{awayTeam}} at {{homeTeam}}",
    body:
      "Now {{toLabel}}{{toVenueClause}}. Was {{fromLabel}}{{fromVenueClause}}.{{reasonClause}}",
    variables: [
      "awayTeam",
      "homeTeam",
      "fromLabel",
      "fromVenueClause",
      "toLabel",
      "toVenueClause",
      "reasonClause"
    ]
  },
  {
    code: "game.official_assigned",
    channel: "email",
    subject: "You are on the crew: {{awayTeam}} at {{homeTeam}}",
    body:
      "You are assigned as {{roleLabel}} for {{awayTeam}} at {{homeTeam}} on {{whenLabel}}{{venueClause}}.\n\n" +
      "Sign in to the admin console to run the scoresheet.",
    variables: ["roleLabel", "awayTeam", "homeTeam", "whenLabel", "venueClause"]
  },
  {
    code: "game.official_assigned",
    channel: "in_app",
    subject: "You are on the crew: {{awayTeam}} at {{homeTeam}}",
    body: "{{roleLabel}} for {{awayTeam}} at {{homeTeam}} on {{whenLabel}}{{venueClause}}.",
    variables: ["roleLabel", "awayTeam", "homeTeam", "whenLabel", "venueClause"]
  },
  {
    code: "suspension.issued",
    channel: "email",
    subject: "Suspension issued",
    body:
      "Hi {{personName}},\n\nA {{kind}} suspension has been recorded against " +
      "you{{nGamesClause}}. Reason: {{reason}}",
    variables: ["personName", "kind", "reason", "nGamesClause"]
  },
  {
    code: "suspension.issued",
    channel: "in_app",
    subject: "Suspension issued",
    body: "A {{kind}} suspension has been recorded against you{{nGamesClause}}. Reason: {{reason}}",
    variables: ["kind", "reason", "nGamesClause"]
  },
  {
    code: "suspension.issued.captain",
    channel: "email",
    subject: "{{personName}} is suspended ({{teamName}})",
    body:
      "{{personName}} on {{teamName}} is suspended{{nGamesClause}}. Reason: {{reason}}\n\n" +
      "They cannot be in a lineup until the suspension is served or lifted.",
    variables: ["personName", "teamName", "reason", "nGamesClause"]
  },
  {
    code: "suspension.issued.captain",
    channel: "in_app",
    subject: "{{personName}} is suspended ({{teamName}})",
    body: "Suspended{{nGamesClause}}. They cannot be in a lineup until it is served or lifted.",
    variables: ["personName", "teamName", "nGamesClause"]
  },
  {
    code: "suspension.issued.admin",
    channel: "email",
    subject: "Automatic suspension: {{personName}} ({{teamName}})",
    body:
      "{{personName}} on {{teamName}} was suspended{{nGamesClause}} by the league's discipline rules. Reason: {{reason}}\n\n" +
      "Open the player in the admin console to reduce, extend or lift it.",
    variables: ["personName", "teamName", "reason", "nGamesClause"]
  },
  {
    code: "suspension.issued.admin",
    channel: "in_app",
    subject: "Automatic suspension: {{personName}} ({{teamName}})",
    body: "Suspended{{nGamesClause}} by the discipline rules. Open the player to reduce, extend or lift it.",
    variables: ["personName", "teamName", "nGamesClause"]
  },
  {
    code: "suspension.changed",
    channel: "email",
    subject: "Your suspension changed",
    body: "Hi {{personName}},\n\nYour suspension now runs for {{nGamesLabel}}. {{leftClause}} Reason: {{reason}}",
    variables: ["personName", "nGamesLabel", "leftClause", "reason"]
  },
  {
    code: "suspension.changed",
    channel: "in_app",
    subject: "Your suspension changed",
    body: "It now runs for {{nGamesLabel}}. {{leftClause}}",
    variables: ["nGamesLabel", "leftClause"]
  },
  {
    code: "suspension.lifted",
    channel: "email",
    subject: "Suspension lifted",
    body:
      "Hi {{personName}},\n\nYour suspension has been lifted. Reason: {{reason}}",
    variables: ["personName", "reason"]
  },
  {
    code: "roster.added",
    channel: "email",
    subject: "Added to roster — {{teamName}}",
    body:
      "Hi {{personName}},\n\nYou've been added to {{teamName}} for " +
      "{{seasonName}}{{jerseyClause}}.",
    variables: ["personName", "teamName", "seasonName", "jerseyClause"]
  },
  {
    code: "roster.added.captain",
    channel: "email",
    subject: "{{playerName}} joined {{teamName}}",
    body: "{{playerName}} finished registering and is on the {{teamName}} roster for {{seasonName}}.",
    variables: ["playerName", "teamName", "seasonName"]
  },
  {
    code: "roster.not_placed.captain",
    channel: "email",
    subject: "{{playerName}} could not join {{teamName}}",
    body:
      "The league approved the registration of {{playerName}} for {{seasonName}}, but they could not join the {{teamName}} roster: {{reason}}",
    variables: ["playerName", "teamName", "seasonName", "reason"]
  },
  {
    code: "TEAM_JOIN_REGISTER",
    channel: "email",
    subject: "Register to join {{teamName}}",
    body:
      "{{teamName}} wants you on the roster for {{seasonName}}. Players join a team by registering for the season (form, waivers and payment). " +
      "Register here and you join {{teamName}} when the league approves it:\n{{registerUrl}}",
    variables: ["teamName", "seasonName", "registerUrl"]
  },
  {
    code: "TEAM_INVITE_DECLINED",
    channel: "email",
    subject: "{{playerName}} declined the {{teamName}} invite",
    body: "{{playerName}} declined your invite to join {{teamName}} for {{seasonName}}. You can invite someone else from your Invites page.",
    variables: ["playerName", "teamName", "seasonName"]
  },
  {
    code: "roster.dropped",
    channel: "email",
    subject: "Removed from roster — {{teamName}}",
    body:
      "Hi {{personName}},\n\nYou've been removed from {{teamName}}{{reasonClause}}.",
    variables: ["personName", "teamName", "reasonClause"]
  },
  // -----------------------------------------------------------------
  // Workflow 7A · captain rollover defaults
  // -----------------------------------------------------------------
  {
    code: "TEAM_INVITE_NEW",
    channel: "email",
    subject: "{{teamName}} is registering — your spot is reserved",
    // Payload comes from buildTeamInvitePayload (team-invite-payload.ts):
    // `inviteUrl` is the full player-app link, `expiryClause` a readable
    // sentence or "" when the invite has no expiry.
    body:
      "You've been invited to join {{teamName}} for {{seasonName}}.\n\n" +
      "Open this link to join the team and pay your share:\n{{inviteUrl}}\n\n" +
      "{{expiryClause}}",
    variables: ["teamName", "seasonName", "inviteUrl", "expiryClause"]
  },
  {
    code: "TEAM_INVITE_RETURNING",
    channel: "email",
    subject: "Welcome back — {{teamName}} is registering",
    body:
      "Hi! {{teamName}} is registering again and has reserved your spot. " +
      "Most of your details are pre-filled. Confirm and pay your deposit here:\n{{inviteUrl}}\n\n" +
      "{{expiryClause}}",
    variables: ["teamName", "inviteUrl", "expiryClause"]
  },
  {
    code: "SUB_INVOICE_SENT",
    channel: "email",
    subject: "Your {{teamName}} dues invoice is ready",
    body:
      "Your share of the {{teamName}} season dues is {{amount}}. " +
      "Pay your deposit to confirm your spot: {{token}}",
    variables: ["teamName", "amount", "token"]
  },
  {
    code: "TEAM_CONFIRMED",
    channel: "email",
    subject: "{{teamName}} is confirmed for the season",
    body:
      "Great news — {{teamName}} has reached the confirmation threshold. " +
      "The team is officially confirmed for the upcoming season.",
    variables: ["teamName"]
  },
  {
    code: "CAPTAIN_ASSIGNED",
    channel: "email",
    subject: "You're the captain of {{teamName}}",
    body:
      "An admin has assigned you as captain of {{teamName}}. " +
      "Head to your dashboard to manage rollover and roster.",
    variables: ["teamName"]
  },
  {
    code: "TEAM_CREATED",
    channel: "email",
    subject: "{{teamName}} created",
    body:
      "{{teamName}} has been created in {{leagueName}}. {{captainName}} is the assigned captain.",
    variables: ["teamName", "leagueName", "captainName"]
  },
  // -----------------------------------------------------------------
  // Workflow 7B · roster management
  // -----------------------------------------------------------------
  {
    code: "INVITE_REMINDER_1",
    channel: "email",
    subject: "Reminder — your spot on {{teamName}}",
    body:
      "Just a reminder: {{teamName}} is holding your spot for {{seasonName}}. " +
      "Complete your registration here before {{expiresOn}}:\n{{inviteUrl}}",
    variables: ["teamName", "seasonName", "inviteUrl", "expiresOn"]
  },
  {
    code: "INVITE_REMINDER_2",
    channel: "email",
    subject: "Second reminder — your {{teamName}} spot expires soon",
    body:
      "Your spot on {{teamName}} for {{seasonName}} expires on {{expiresOn}}. " +
      "If you still want to play, finish registration now:\n{{inviteUrl}}",
    variables: ["teamName", "seasonName", "inviteUrl", "expiresOn"]
  },
  {
    code: "INVITE_EXPIRED_CAPTAIN",
    channel: "email",
    subject: "Invite expired — {{playerName}}",
    body:
      "The invite for {{playerName}} on {{teamName}} has expired. " +
      "They have not been added to your roster. " +
      "You can extend the invite or invite someone else.",
    variables: ["teamName", "playerName"]
  },
  {
    code: "DROP_CONFIRMED",
    channel: "email",
    subject: "You've been removed from {{teamName}}",
    body:
      "You've been removed from the {{teamName}} roster.\n\n" +
      "Reason: {{reason}}\n\n" +
      "If you'd paid into the team dues, the league admin will assess any " +
      "refund and notify you separately.",
    variables: ["teamName", "reason"]
  },
  {
    code: "REFUND_ASSESSMENT_REQUIRED",
    channel: "email",
    subject: "Refund assessment required",
    body:
      "A player drop on {{teamName}} requires a refund assessment. " +
      "Decide it under Disputes in the organisation console.",
    variables: ["teamName", "refundAssessmentId"]
  },
  {
    code: "TRANSFER_REQUEST",
    channel: "email",
    subject: "Trade request — {{playerName}}",
    body:
      "{{sourceTeam}} has asked to move {{playerName}} to your team. " +
      "Accept or decline it on the Roster page, Transfers tab, in the captain console.",
    variables: ["sourceTeam", "playerName", "transferId"]
  },
  {
    code: "TRANSFER_REJECTED",
    channel: "email",
    subject: "Trade rejected — {{playerName}}",
    body:
      "The proposed trade of {{playerName}} has been rejected.\n\n" +
      "Reason: {{reason}}",
    variables: ["playerName", "reason"]
  },
  {
    code: "team_store.open",
    channel: "email",
    subject: "The {{teamName}} store is open",
    body:
      "Your captain opened the {{teamName}} team store: {{items}}. " +
      "Pick your size and the name and number on the back here:\n{{storeUrl}}",
    variables: ["teamName", "items", "storeUrl"]
  },
  {
    code: "store.order.placed",
    channel: "email",
    subject: "Order received: {{teamName}} store",
    body:
      "Thanks, {{personName}}. You ordered:\n{{lines}}\n\nTotal {{totalLabel}}. " +
      "Pay invoice {{invoiceNumber}} to confirm your order:\n{{payUrl}}",
    variables: ["personName", "teamName", "lines", "totalLabel", "invoiceNumber", "payUrl"]
  },
  {
    code: "store.order.status",
    channel: "email",
    subject: "Your {{teamName}} order is {{statusLabel}}",
    body: "{{lines}}\n\n{{noteLine}}",
    variables: ["teamName", "statusLabel", "lines", "noteLine"]
  },
  {
    code: "TRANSFER_ACCEPTED",
    channel: "email",
    subject: "Transfer to approve: {{playerName}}",
    body:
      "{{toTeam}} accepted {{playerName}} from {{fromTeam}}. " +
      "Approve or reject it under Transfers in the admin console.",
    variables: ["playerName", "fromTeam", "toTeam"]
  },
  {
    code: "TRANSFER_APPROVED",
    channel: "email",
    subject: "Transfer approved: {{playerName}}",
    body: "{{playerName}} moves from {{fromTeam}} to {{toTeam}}. The league admin approved the transfer.",
    variables: ["playerName", "fromTeam", "toTeam"]
  },
  {
    code: "PLAYER_JOIN_REQUEST",
    channel: "email",
    subject: "{{playerFullName}} wants to join {{teamName}}",
    body:
      "{{playerFullName}} asked to join {{teamName}}.\n\nMessage: {{message}}\n\n" +
      "Accept or decline it under Join requests in the captain console.",
    variables: ["playerFullName", "teamName", "message"]
  },
  {
    code: "PLAYER_JOIN_APPROVED",
    channel: "email",
    subject: "{{teamName}} accepted your request",
    body: "{{teamName}} accepted your request to join. {{rosterClause}}",
    variables: ["teamName", "rosterClause"]
  },
  {
    code: "PLAYER_JOIN_REJECTED",
    channel: "email",
    subject: "{{teamName}} declined your request",
    body: "{{teamName}} declined your request to join.\n\nReason: {{reason}}",
    variables: ["teamName", "reason"]
  },
  {
    code: "CAPTAIN_REVOKED",
    channel: "email",
    subject: "Captain role revoked — {{teamName}}",
    body:
      "Your captain role on {{teamName}} has been revoked by a league admin. " +
      "You retain access to your historical data.",
    variables: ["teamName"]
  },
  {
    code: "DIVISION_APPLICATION_REJECTED",
    channel: "email",
    subject: "{{teamName}} application — not accepted in {{divisionName}}",
    body:
      "Your application to enter {{teamName}} in {{divisionName}} was not accepted.\n\n" +
      "Reason: {{reason}}\n\n" +
      "You can re-apply to a different division at any time.",
    variables: ["teamName", "divisionName", "reason"]
  },
  // -----------------------------------------------------------------
  // Workflow 7C · compliance + eligibility
  // -----------------------------------------------------------------
  {
    code: "ELIGIBILITY_WAIVED",
    channel: "email",
    subject: "An eligibility check was waived for your registration",
    body:
      "A league admin waived an eligibility check on your registration.\n\n" +
      "Reason: {{reason}}\n\n" +
      "You're cleared to proceed to payment.",
    variables: ["reason"]
  },
  {
    code: "eligibility.waived",
    channel: "email",
    subject: "Eligibility waived for {{personName}}",
    body:
      "A league admin waived the {{checkLabel}} check for {{personName}} ({{forLabel}}).\n\n" +
      "Reason: {{reason}}\n\nNothing else to do for this check.",
    variables: ["personName", "checkLabel", "forLabel", "reason"]
  },
  {
    code: "eligibility.waived",
    channel: "in_app",
    subject: "Eligibility waived for {{personName}}",
    body: "The {{checkLabel}} check was waived ({{forLabel}}). Reason: {{reason}}",
    variables: ["personName", "checkLabel", "forLabel", "reason"]
  },
  {
    code: "eligibility.waived.captain",
    channel: "email",
    subject: "{{personName}} is cleared to play for {{teamName}}",
    body:
      "A league admin waived the {{checkLabel}} check for {{personName}} on {{teamName}} ({{forLabel}}). The player has the details.",
    variables: ["personName", "checkLabel", "teamName", "forLabel"]
  },
  {
    code: "eligibility.waived.captain",
    channel: "in_app",
    subject: "{{personName}} is cleared to play for {{teamName}}",
    body: "The {{checkLabel}} check was waived ({{forLabel}}). The player has the details.",
    variables: ["personName", "checkLabel", "teamName", "forLabel"]
  },
  {
    code: "USA_HOCKEY_EXPIRING_SOON",
    channel: "email",
    subject: "Your USA Hockey membership expires soon",
    body:
      "Heads up — your USA Hockey membership expires {{expiresAt}}. " +
      "Renew at usahockey.com to stay eligible through the rest of the season.",
    variables: ["expiresAt"]
  },
  {
    code: "USA_HOCKEY_EXPIRED",
    channel: "email",
    subject: "Your USA Hockey membership has expired",
    body:
      "Your USA Hockey membership expired on {{expiresAt}}. " +
      "Renew at usahockey.com to remain eligible to play.",
    variables: ["expiresAt"]
  },
  {
    code: "USA_HOCKEY_EXPIRED_CAPTAIN",
    channel: "email",
    subject: "USA Hockey expired — {{playerName}}",
    body:
      "Heads up — {{playerName}} on {{teamName}} has an expired USA Hockey " +
      "membership (expired {{expiresAt}}). Please follow up with them to renew.",
    variables: ["playerName", "teamName", "expiresAt"]
  },
  {
    code: "COMPLIANCE_SWEEP_COMPLETE",
    channel: "email",
    subject: "Compliance sweep complete",
    body:
      "The compliance sweep for {{seasonName}} is complete.\n\n" +
      "Expiring USA Hockey: {{expiring}}\n" +
      "Already expired: {{expired}}\n" +
      "Sweep run at: {{sweepRunAt}}",
    variables: ["seasonName", "expiring", "expired", "sweepRunAt"]
  },
  {
    code: "PLAYOFF_INELIGIBLE",
    channel: "email",
    subject: "Playoff eligibility update",
    body:
      "Based on the playoff eligibility sweep, you don't currently meet the " +
      "requirements to appear in playoff lineups.\n\n" +
      "Failed checks: {{failedChecks}}\n\n" +
      "If you believe this is in error, contact your league admin.",
    variables: ["failedChecks"]
  },
  {
    code: "DUPLICATE_ID_FLAGGED",
    channel: "email",
    subject: "Your registration is under review",
    body:
      "The membership ID you provided is associated with another registration " +
      "this season. A league admin will review and notify you within 48 hours.",
    variables: []
  },
  {
    code: "REGISTRATION_UNDER_REVIEW",
    channel: "email",
    subject: "Your registration is under review",
    body:
      "Your registration is under review by a league admin. " +
      "We'll notify you within 48 hours.",
    variables: []
  },
  // COMP-1 / UC-29. To the player, or the guardian who uploaded for a
  // minor. reasonLine is "Reason: ..." or empty; nextStep says what to do.
  {
    code: "compliance.document.decided",
    channel: "email",
    subject: "{{documentLabel}}: {{decisionLabel}}",
    body:
      "An admin reviewed the {{documentLabel}} uploaded for {{personName}} ({{forLabel}}).\n\n" +
      "Decision: {{decisionLabel}}\n{{reasonLine}}\n\n{{nextStep}}",
    variables: ["documentLabel", "decisionLabel", "personName", "forLabel", "reasonLine", "nextStep"]
  },
  {
    code: "compliance.document.decided",
    channel: "in_app",
    subject: "{{documentLabel}}: {{decisionLabel}}",
    body: "{{personName}} ({{forLabel}}). {{reasonLine}} {{nextStep}}",
    variables: ["documentLabel", "decisionLabel", "personName", "forLabel", "reasonLine", "nextStep"]
  },
  // To the player's team captain(s). No reason: that stays between the
  // admin and the player.
  {
    code: "compliance.document.decided.captain",
    channel: "email",
    subject: "{{personName}}: {{documentLabel}} {{decisionLabel}}",
    body:
      "An admin reviewed the {{documentLabel}} for {{personName}} on {{teamName}} ({{forLabel}}).\n\n" +
      "Decision: {{decisionLabel}}. The player has the details.",
    variables: ["personName", "documentLabel", "decisionLabel", "teamName", "forLabel"]
  },
  {
    code: "compliance.document.decided.captain",
    channel: "in_app",
    subject: "{{personName}}: {{documentLabel}} {{decisionLabel}}",
    body: "{{teamName}} ({{forLabel}}). The player has the details.",
    variables: ["personName", "documentLabel", "decisionLabel", "teamName", "forLabel"]
  },
  // -----------------------------------------------------------------
  // Approval-gate (Team Registration via Admin Approval brief)
  // -----------------------------------------------------------------
  {
    code: "TEAM_REGISTRATION_APPLIED",
    channel: "email",
    subject: "{{teamName}} applied — {{divisionName}}",
    body:
      "{{teamName}} has applied to register for {{divisionName}} in {{seasonName}}.\n\n" +
      "Approve or deny it under Division applications in the admin console.",
    variables: ["teamName", "divisionName", "seasonName", "entryId"]
  },
  {
    code: "TEAM_REGISTRATION_APPLIED_CONFIRMATION",
    channel: "email",
    subject: "Application submitted — {{divisionName}}",
    body:
      "Your application for {{divisionName}} in {{seasonName}} has been submitted.\n\n" +
      "You will be notified once the league admin reviews it.",
    variables: ["divisionName", "seasonName"]
  },
  {
    code: "TEAM_REGISTRATION_APPROVED",
    channel: "email",
    subject: "{{teamName}} approved for {{divisionName}}",
    body:
      "Your team {{teamName}} has been approved for {{divisionName}} in {{seasonName}}.\n\n" +
      "Complete your registration — invite your players and set up dues:\n" +
      "/captain/register/setup/{{entryId}}",
    variables: ["teamName", "divisionName", "seasonName", "entryId"]
  },
  {
    code: "TEAM_REGISTRATION_REJECTED",
    channel: "email",
    subject: "{{teamName}} — application not approved",
    body:
      "Your application for {{divisionName}} in {{seasonName}} was not approved.\n\n" +
      "Reason: {{reason}}\n\n" +
      "You can apply to a different division at any time.",
    variables: ["teamName", "divisionName", "seasonName", "reason"]
  },
  {
    code: "TEAM_REGISTRATION_WITHDRAWN",
    channel: "email",
    subject: "Application withdrawn — {{teamName}}",
    body:
      "{{teamName}} has withdrawn their pending application. " +
      "No further action is needed.",
    variables: ["teamName", "entryId"]
  },
  // -----------------------------------------------------------------
  // Payments & Invoicing — Phases 3, 5, 6
  // -----------------------------------------------------------------
  {
    code: "INVOICE_OVERDUE_STAGE_1",
    channel: "email",
    subject: "Friendly reminder — invoice past due",
    body:
      "Your invoice is past due by 1+ days. Please complete payment to keep things running smoothly.",
    variables: []
  },
  {
    code: "INVOICE_OVERDUE_STAGE_2",
    channel: "email",
    subject: "Reminder — invoice 7+ days overdue",
    body:
      "Your invoice is overdue by 7+ days. Please pay promptly to avoid further action.",
    variables: []
  },
  {
    code: "INVOICE_OVERDUE_STAGE_3",
    channel: "email",
    subject: "Urgent — invoice 14+ days overdue",
    body:
      "Your invoice is now 14+ days overdue. Continued non-payment may affect your eligibility.",
    variables: []
  },
  {
    code: "INVOICE_OVERDUE_STAGE_4",
    channel: "email",
    subject: "FINAL NOTICE — invoice 21+ days overdue",
    body:
      "Your invoice is more than 21 days overdue. An admin has been notified.",
    variables: []
  },
  {
    code: "INVOICE_MANUAL_REMIND",
    channel: "email",
    subject: "Payment reminder",
    body:
      "A reminder from your league: please complete payment on your outstanding invoice.",
    variables: []
  },
  {
    code: "SUB_INVOICE_REMINDER",
    channel: "email",
    subject: "Your team dues are outstanding",
    body:
      "Your share of the team dues is still outstanding. Pay now to confirm your spot.",
    variables: []
  },
  {
    code: "DUES_COVERED_BY_CAPTAIN",
    channel: "email",
    subject: "Your captain covered your dues",
    body:
      "Good news — your team captain has paid your outstanding dues. You owe $0.",
    variables: ["teamName"]
  },
  // ─── Payments & Invoicing — Phase 16 dotted-code templates ───
  {
    code: "invoice.created",
    channel: "email",
    subject: "New invoice {{invoiceNumber}}: {{amountLabel}} due {{dueLabel}}",
    body:
      "You have a new invoice from your league: {{invoiceNumber}} for {{amountLabel}}, due {{dueLabel}}.\n\n" +
      "See it and pay at {{invoiceUrl}}.",
    variables: ["invoiceNumber", "amountLabel", "dueLabel", "invoiceUrl"]
  },
  {
    code: "invoice.created",
    channel: "in_app",
    subject: "New invoice {{invoiceNumber}}: {{amountLabel}}",
    body: "Due {{dueLabel}}. Open Payments to see it and pay.",
    variables: ["invoiceNumber", "amountLabel", "dueLabel"]
  },
  {
    code: "team_dues.created",
    channel: "email",
    subject: "Team invoice {{invoiceNumber}} for {{teamName}}: {{amountLabel}} due {{dueLabel}}",
    body:
      "Your league sent {{teamName}} a team invoice: {{invoiceNumber}} for {{amountLabel}}, due {{dueLabel}}.\n\n" +
      "Split it among your players on Dues: {{duesUrl}}. Each player then gets their own invoice for their share.",
    variables: ["invoiceNumber", "teamName", "amountLabel", "dueLabel", "duesUrl"]
  },
  {
    code: "team_dues.created",
    channel: "in_app",
    subject: "Team invoice {{invoiceNumber}} for {{teamName}}: {{amountLabel}}",
    body: "Due {{dueLabel}}. Split it among your players on Dues in the team console.",
    variables: ["invoiceNumber", "teamName", "amountLabel", "dueLabel"]
  },
  {
    code: "payment.confirmed",
    channel: "email",
    subject: "Payment received — {{invoiceNumber}}{{teamClause}}",
    body:
      "Thanks — we've received your payment.\n\n" +
      "Invoice: {{invoiceNumber}}\n" +
      "Amount: {{amountCents}}{{teamLine}}\n\n" +
      "A receipt PDF is on the way.",
    variables: ["invoiceNumber", "amountCents", "teamClause", "teamLine"]
  },
  {
    code: "installment.failed",
    channel: "email",
    subject: "Installment {{installmentNumber}} failed",
    body:
      "Your installment payment failed. We'll retry on {{nextRetryDate}}. " +
      "Update your card here: {{retryUrl}}",
    variables: ["installmentNumber", "amountCents", "nextRetryDate", "retryUrl"]
  },
  {
    code: "invoice.late_fee_applied",
    channel: "email",
    subject: "Late fee applied",
    body: "A late fee of {{lateFeeCents}} was applied to your invoice.",
    variables: ["lateFeeCents"]
  },
  {
    code: "invoice.overdue.r1",
    channel: "email",
    subject: "Friendly reminder — invoice {{invoiceNumber}} past due",
    body: "Template pending — invoice past due. {{outstandingCents}} owed.",
    variables: ["invoiceNumber", "outstandingCents", "daysPastDue", "payUrl"]
  },
  {
    code: "invoice.overdue.r2",
    channel: "email",
    subject: "Reminder — invoice 7+ days overdue",
    body: "Template pending — 7+ days overdue.",
    variables: ["invoiceNumber", "outstandingCents", "daysPastDue", "payUrl"]
  },
  {
    code: "invoice.overdue.r3",
    channel: "email",
    subject: "Urgent — invoice 14+ days overdue",
    body: "Template pending — urgent.",
    variables: ["invoiceNumber", "outstandingCents", "daysPastDue", "payUrl"]
  },
  {
    code: "invoice.overdue.r4",
    channel: "email",
    subject: "FINAL NOTICE — 21+ days overdue",
    body: "Template pending — final notice.",
    variables: ["invoiceNumber", "outstandingCents", "daysPastDue", "payUrl"]
  },
  {
    code: "invoice.overdue.admin_case",
    channel: "email",
    subject: "Admin case opened — {{invoiceNumber}}",
    body: "Template pending — admin case.",
    variables: ["invoiceId", "invoiceNumber", "recipientPersonId", "daysPastDue", "outstandingCents"]
  },
  {
    code: "invoice.manual_reminder",
    channel: "email",
    subject: "Payment reminder — {{invoiceNumber}}",
    body: "Template pending — please complete payment.",
    variables: ["invoiceNumber", "outstandingCents", "dueAt", "payUrl"]
  },
  {
    code: "invoice.due_date_extended",
    channel: "email",
    subject: "Due date extended — {{invoiceNumber}}",
    body: "Your invoice due date has been extended to {{newDueAt}}.",
    variables: ["newDueAt"]
  },
  {
    code: "refund.issued",
    channel: "email",
    subject: "Refund issued — {{amountCents}}",
    body: "{{processingNote}} Reason: {{reason}}",
    variables: ["amountCents", "reason", "processingNote"]
  },
  {
    code: "wallet.credited",
    channel: "email",
    subject: "Wallet credit issued — {{amountCents}}",
    body:
      "A credit of {{amountCents}} has been added to your wallet. " +
      "New balance: {{newBalance}}.",
    variables: ["amountCents", "newBalance", "expiresAt"]
  },
  {
    code: "wallet.credit_expired",
    channel: "email",
    subject: "Wallet credit expired",
    body: "A wallet credit of {{expiredCents}} has expired.",
    variables: ["expiredCents"]
  },
  {
    code: "captain.covered_dues",
    channel: "email",
    subject: "Your captain covered your dues",
    body: "Your captain paid {{amountCents}} toward your team dues.",
    variables: ["amountCents"]
  },
  // -----------------------------------------------------------------
  // Free-agent pool offers (UC-03, CAP-9). Payload from
  // FreeAgentOffersService: offerUrl is the player-app link to accept or
  // decline (/invite/<token>), expiryClause a sentence or "".
  // -----------------------------------------------------------------
  {
    code: "FREE_AGENT_OFFER",
    channel: "email",
    subject: "{{teamName}} would like you on their roster",
    body:
      "{{teamName}} offered you a spot for {{seasonName}} from the free-agent pool.\n\n" +
      "Accept or decline here:\n{{offerUrl}}\n\n" +
      "{{expiryClause}}",
    variables: ["teamName", "seasonName", "offerUrl", "expiryClause"]
  },
  {
    code: "FREE_AGENT_OFFER",
    channel: "in_app",
    subject: "Team offer: {{teamName}}",
    body:
      "{{teamName}} offered you a spot for {{seasonName}}. Accept or decline from your home page. {{expiryClause}}",
    variables: ["teamName", "seasonName", "expiryClause"]
  },
  {
    code: "FREE_AGENT_OFFER_ACCEPTED",
    channel: "email",
    subject: "{{playerName}} joined {{teamName}}",
    body:
      "{{playerName}} accepted your offer and is now on the {{teamName}} roster for {{seasonName}}.",
    variables: ["playerName", "teamName", "seasonName"]
  },
  {
    code: "FREE_AGENT_OFFER_ACCEPTED",
    channel: "in_app",
    subject: "{{playerName}} joined {{teamName}}",
    body: "{{playerName}} accepted your free-agent offer for {{seasonName}}.",
    variables: ["playerName", "teamName", "seasonName"]
  },
  {
    code: "FREE_AGENT_OFFER_DECLINED",
    channel: "email",
    subject: "{{playerName}} declined the {{teamName}} offer",
    body:
      "{{playerName}} declined your offer for {{seasonName}}. They stay in the free-agent pool.",
    variables: ["playerName", "teamName", "seasonName"]
  },
  {
    code: "FREE_AGENT_OFFER_DECLINED",
    channel: "in_app",
    subject: "{{playerName}} declined your offer",
    body: "{{playerName}} declined the {{teamName}} offer for {{seasonName}}. They stay in the free-agent pool.",
    variables: ["playerName", "teamName", "seasonName"]
  },
  {
    code: "FREE_AGENT_PITCH",
    channel: "email",
    subject: "Free agent for {{teamName}}: {{playerName}}",
    body:
      "{{playerName}} joined the free-agent pool for {{seasonName}}. Level: {{level}}. Positions: {{positions}}. " +
      "{{teamName}} has {{openSpots}} open roster spots. Open Free agents in your captain console to offer a spot.",
    variables: ["playerName", "teamName", "seasonName", "level", "positions", "openSpots"]
  },
  {
    code: "org.broadcast",
    channel: "email",
    subject: "{{subject}}",
    body: "{{body}}",
    variables: ["subject", "body"]
  },
  {
    code: "org.broadcast",
    channel: "in_app",
    subject: "{{subject}}",
    body: "{{body}}",
    variables: ["subject", "body"]
  }
];

export function findDefaultTemplate(
  code: TemplateCode,
  channel: "email" | "in_app" = "email"
): DefaultTemplate | undefined {
  return DEFAULT_TEMPLATES.find(
    (t) => t.code === code && t.channel === channel
  );
}

/** Tiny mustache-style renderer: replaces `{{var}}` with payload[var]. */
export function renderTemplate(
  source: string,
  payload: Record<string, unknown>
): string {
  return source.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const v = payload[key];
    return v === null || v === undefined ? "" : String(v);
  });
}
