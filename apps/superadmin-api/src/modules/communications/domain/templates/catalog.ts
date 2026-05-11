/**
 * Built-in template catalog. Stable codes used across the platform.
 * UI-overridable templates (per-org, localized) live in the
 * `notification_templates` table; codes here are the fallback / default.
 */

export const TEMPLATE_CODES = [
  "registration.submitted",
  "registration.approved",
  "registration.rejected",
  "registration.waitlisted",
  "game.scheduled",
  "game.postponed",
  "game.cancelled",
  "game.finalized",
  "suspension.issued",
  "suspension.lifted",
  "roster.added",
  "roster.dropped",
  // Workflow 7A · captain rollover
  "TEAM_INVITE_NEW",
  "TEAM_INVITE_RETURNING",
  "SUB_INVOICE_SENT",
  "TEAM_CONFIRMED",
  "CAPTAIN_ASSIGNED",
  "TEAM_CREATED",
  // Workflow 7B · roster management
  "INVITE_REMINDER_1",
  "INVITE_REMINDER_2",
  "INVITE_EXPIRED_CAPTAIN",
  "DROP_CONFIRMED",
  "REFUND_ASSESSMENT_REQUIRED",
  "TRANSFER_REQUEST",
  "TRANSFER_REJECTED",
  "CAPTAIN_REVOKED",
  "DIVISION_APPLICATION_REJECTED",
  // Workflow 7C · compliance + eligibility
  "ELIGIBILITY_WAIVED",
  "USA_HOCKEY_EXPIRING_SOON",
  "USA_HOCKEY_EXPIRED",
  "USA_HOCKEY_EXPIRED_CAPTAIN",
  "COMPLIANCE_SWEEP_COMPLETE",
  "PLAYOFF_INELIGIBLE",
  "DUPLICATE_ID_FLAGGED",
  "REGISTRATION_UNDER_REVIEW",
  // Approval-gate (Team Registration via Admin Approval brief)
  "TEAM_REGISTRATION_APPLIED",
  "TEAM_REGISTRATION_APPLIED_CONFIRMATION",
  "TEAM_REGISTRATION_APPROVED",
  "TEAM_REGISTRATION_REJECTED",
  "TEAM_REGISTRATION_WITHDRAWN"
] as const;

export type TemplateCode = (typeof TEMPLATE_CODES)[number];

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
    body:
      "You've been invited to join {{teamName}} for the upcoming season.\n\n" +
      "Click to register and pay your share: {{token}}\n\n" +
      "This invite expires {{expiresAt}}.",
    variables: ["teamName", "token", "expiresAt"]
  },
  {
    code: "TEAM_INVITE_RETURNING",
    channel: "email",
    subject: "Welcome back — {{teamName}} is registering",
    body:
      "Hi! {{teamName}} is registering again and has reserved your spot. " +
      "Most of your details are pre-filled — confirm and pay your deposit here: {{token}}\n\n" +
      "This invite expires {{expiresAt}}.",
    variables: ["teamName", "token", "expiresAt"]
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
      "Just a reminder: {{teamName}} is holding your spot. " +
      "Complete your registration here before {{expiresAt}}: {{token}}",
    variables: ["teamName", "token", "expiresAt"]
  },
  {
    code: "INVITE_REMINDER_2",
    channel: "email",
    subject: "Second reminder — your {{teamName}} spot expires soon",
    body:
      "Your spot on {{teamName}} expires {{expiresAt}}. " +
      "If you still want to play, finish registration now: {{token}}",
    variables: ["teamName", "token", "expiresAt"]
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
      "Review and decide here: /admin/refunds/{{refundAssessmentId}}",
    variables: ["teamName", "refundAssessmentId"]
  },
  {
    code: "TRANSFER_REQUEST",
    channel: "email",
    subject: "Trade request — {{playerName}}",
    body:
      "{{sourceTeam}} has offered {{playerName}} to your team. " +
      "Accept or decline here: /captain/transfers/{{transferId}}",
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
      "The compliance sweep for season {{seasonId}} is complete.\n\n" +
      "Expiring USA Hockey: {{expiring}}\n" +
      "Already expired: {{expired}}\n" +
      "Sweep run at: {{sweepRunAt}}",
    variables: ["seasonId", "expiring", "expired", "sweepRunAt"]
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
  // -----------------------------------------------------------------
  // Approval-gate (Team Registration via Admin Approval brief)
  // -----------------------------------------------------------------
  {
    code: "TEAM_REGISTRATION_APPLIED",
    channel: "email",
    subject: "{{teamName}} applied — {{divisionName}}",
    body:
      "{{teamName}} has applied to register for {{divisionName}} in {{seasonName}}.\n\n" +
      "Review and approve or deny this application: /seasons/{{entryId}}/applications",
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
