/**
 * How a player gets onto a team roster (UC-01, UC-03, UC-04, FR-3.4.1).
 *
 * SportsEngine-like rule, owner brief 26 Oct: a player joins a roster by
 * completing that season's registration (form, required waivers,
 * payment or an offline / plan choice the season allows) and the league
 * approving it. Invites, captain adds, free-agent offers and join
 * requests all go through this one gate:
 *
 *   ready              approved registration for the season: join now
 *   awaiting_approval  submitted, the league has not approved it yet:
 *                      the team is recorded on the registration and the
 *                      player joins when it is approved
 *   register           no submitted registration: the player is sent to
 *                      the season's funnel with the team set
 *
 * Shared by the API (which enforces it) and the apps (which word it).
 */
import type { RegistrationSubmissionType } from "./registration-paths";

export type RosterEntryReadiness = "ready" | "awaiting_approval" | "register";

const READY_STATUSES = new Set(["approved"]);
/**
 * Submitted and waiting on the league. `incomplete` was sent back for a
 * fix and goes back to review; `submitted` / `under_review` are the v1
 * names the column still accepts.
 */
const AWAITING_STATUSES = new Set([
  "pending_review",
  "pending_offline",
  "incomplete",
  "submitted",
  "under_review"
]);

export function rosterEntryReadiness(
  registrationStatus: string | null | undefined
): RosterEntryReadiness {
  if (registrationStatus && READY_STATUSES.has(registrationStatus)) return "ready";
  if (registrationStatus && AWAITING_STATUSES.has(registrationStatus)) return "awaiting_approval";
  return "register";
}

/**
 * Registration statuses that still hold the player's place for the
 * season (the partial unique index `registrations_active_uniq` ignores
 * the others). A team can be recorded on one of these.
 */
export const REGISTRATION_ENDED_STATUSES = ["rejected", "cancelled", "withdrawn"] as const;

/** Funnel paths that may carry a team to join (a team registration creates its own team). */
export function submissionTypeCarriesTeam(type: string | null | undefined): boolean {
  return type === "individual" || type === "captain_invite" || type === "free_agent";
}

/**
 * The path a player joining a team takes in a season's funnel: the
 * captain-invite path when the season offers it, else the individual
 * path. Null when the season offers neither (team registrations only).
 */
export function joinTeamSubmissionType(
  offered: readonly RegistrationSubmissionType[]
): RegistrationSubmissionType | null {
  if (offered.includes("captain_invite")) return "captain_invite";
  if (offered.includes("individual")) return "individual";
  return null;
}

/**
 * Player-app path to register for a season directly onto a team
 * (FR-3.4.1). The invite token, when there is one, lets the funnel
 * settle that invite when the registration is approved.
 */
export function teamRegistrationPath(
  seasonId: string,
  teamId: string,
  inviteToken?: string | null
): string {
  const qs = new URLSearchParams({ team: teamId });
  if (inviteToken) qs.set("invite", inviteToken);
  return `/register/${encodeURIComponent(seasonId)}?${qs.toString()}`;
}

export interface RosterOpening {
  teamName: string;
  seasonName: string;
  /** Active players on the roster now. */
  current: number;
  maxRosterSize: number;
  rosterLockAt: Date | string | null | undefined;
}

/**
 * Why a team cannot take another player right now, or null when it can.
 * The funnel says this before payment; the roster add refuses with the
 * same words.
 */
export function rosterOpeningRefusal(
  o: RosterOpening,
  now: Date = new Date()
): { reason: "locked" | "full"; message: string } | null {
  const lock = o.rosterLockAt ? new Date(o.rosterLockAt) : null;
  if (lock && !Number.isNaN(lock.getTime()) && now > lock) {
    return {
      reason: "locked",
      message: `Rosters for ${o.seasonName} are locked, so ${o.teamName} cannot take new players.`
    };
  }
  if (o.current >= o.maxRosterSize) {
    return {
      reason: "full",
      message: `The ${o.teamName} roster is full (${o.current} of ${o.maxRosterSize}). Ask the captain, or register for the season without a team.`
    };
  }
  return null;
}

// =====================================================================
// JERSEY NUMBERS (FR-3.11.2, FR-3.4.2)
// =====================================================================
export const JERSEY_NUMBER_MIN = 0;
export const JERSEY_NUMBER_MAX = 99;

/** Null when `n` is a usable sweater number (whole number 0-99). */
export function jerseyNumberRefusal(n: unknown): string | null {
  if (n === null || n === undefined) return null;
  if (typeof n !== "number" || !Number.isInteger(n)) return "A jersey number is a whole number.";
  if (n < JERSEY_NUMBER_MIN || n > JERSEY_NUMBER_MAX) {
    return `A jersey number is between ${JERSEY_NUMBER_MIN} and ${JERSEY_NUMBER_MAX}.`;
  }
  return null;
}

/** The sentence for a number another player on the team already wears. */
export function jerseyNumberClash(n: number, holderName: string | null): string {
  return `Number ${n} is already worn by ${holderName ?? "another player"} on this team this season. Pick another number.`;
}
