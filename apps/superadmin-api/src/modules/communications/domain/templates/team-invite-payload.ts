/**
 * One payload builder for every captain invite email (TEAM_INVITE_NEW,
 * TEAM_INVITE_RETURNING, INVITE_REMINDER_1/2).
 *
 * The templates used to render `{{token}}` and a raw ISO `{{expiresAt}}`,
 * and the wizard's call site sent neither `teamName` nor `token`, so
 * recipients got "You've been invited to join  for the upcoming
 * season. Click to register and pay your share: " (CAP-4, j07 run
 * CAP0625U). Every call site now goes through this builder, so the
 * body always carries the team, the season, a full player-app link
 * and a readable expiry.
 *
 * `seasonId` stays in the payload: NotificationService uses it to look
 * up a per-season admin override of the email template.
 */
export interface TeamInvitePayloadInput {
  teamName: string;
  seasonName: string;
  seasonId: string;
  token: string;
  expiresAt: Date | null;
  /** Player app origin, e.g. https://player.sportspulse.us (no trailing slash). */
  playerWebUrl: string;
  divisionName?: string | null;
}

export function teamInviteUrl(playerWebUrl: string, token: string): string {
  return `${playerWebUrl.replace(/\/+$/, "")}/invite/${encodeURIComponent(token)}`;
}

export function formatInviteExpiry(expiresAt: Date): string {
  return expiresAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

export function buildTeamInvitePayload(
  input: TeamInvitePayloadInput
): Record<string, unknown> {
  const expiresOn = input.expiresAt ? formatInviteExpiry(input.expiresAt) : null;
  return {
    teamName: input.teamName,
    seasonName: input.seasonName,
    seasonId: input.seasonId,
    divisionName: input.divisionName ?? null,
    inviteUrl: teamInviteUrl(input.playerWebUrl, input.token),
    token: input.token,
    expiresAt: input.expiresAt?.toISOString() ?? null,
    expiresOn,
    expiryClause: expiresOn ? `This invite expires on ${expiresOn}.` : ""
  };
}
