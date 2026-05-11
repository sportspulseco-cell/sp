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
  "TEAM_CREATED"
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
