/**
 * Substitute requests (UC-31, FR-3.3.1, FR-3.3.3).
 *
 * A captain short of players for one game asks an eligible player to sub.
 * The player accepts or declines; on accept the server adds them to that
 * game's lineup as a guest through the one guest path (game_attendance
 * is_guest, roster_moves guest_add). A league admin may also assign a sub
 * directly; that row carries `rosterOverride`.
 *
 * Pure rules shared by the API (who is eligible, what state a request is
 * in) and the captain, player and admin screens (labels). Unit tests:
 * substitutes.test.ts.
 */

import { FREE_AGENT_DAYS, type FreeAgentDay } from "./free-agents";
import { normalizeSkillLevel, skillLevelFitsTier } from "./skill-levels";

export const SUB_REQUEST_STATUSES = ["requested", "accepted", "declined", "cancelled", "expired"] as const;
export type SubRequestStatus = (typeof SUB_REQUEST_STATUSES)[number];

export const SUB_REQUEST_STATUS_LABELS: Record<SubRequestStatus, string> = {
  requested: "Waiting for answer",
  accepted: "Accepted",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired"
};

/** Final states: nothing moves a request out of them. */
export const SUB_REQUEST_FINAL_STATUSES: ReadonlyArray<SubRequestStatus> = [
  "accepted",
  "declined",
  "cancelled",
  "expired"
];

/** Game statuses in which a sub can still be asked or answer. */
export const SUB_OPEN_GAME_STATUSES: ReadonlyArray<string> = ["scheduled", "postponed"];

/** Why an open request was cancelled by the system, stored on the request. */
export const SUB_CANCEL_REASONS = {
  captain: "Cancelled by the captain",
  guest_spots_filled: "Every guest spot for this game is filled",
  player_added_elsewhere: "The player is already on this game's lineup"
} as const;
export type SubCancelReason = keyof typeof SUB_CANCEL_REASONS;

/**
 * The status a person should read. A request still `requested` when the
 * game has started (or was played, forfeited or cancelled) has expired:
 * the server writes `expired` the next time anyone acts on it.
 */
export function subRequestStatus(
  stored: string,
  game: { start: Date | string; status: string },
  now: Date = new Date()
): SubRequestStatus {
  if (stored === "requested") {
    const start = new Date(game.start);
    if (now.getTime() >= start.getTime()) return "expired";
    if (!SUB_OPEN_GAME_STATUSES.includes(game.status)) return "expired";
    return "requested";
  }
  return (SUB_REQUEST_STATUSES as readonly string[]).includes(stored)
    ? (stored as SubRequestStatus)
    : "expired";
}

// ---------------------------------------------------------------------
// Eligibility (FR-3.3.3)
// ---------------------------------------------------------------------

export const SUB_INELIGIBLE_REASONS = [
  "on_roster",
  "in_game",
  "suspended",
  "not_available",
  "availability_unknown",
  "busy_other_game",
  "level_mismatch",
  "guest_season_limit",
  "no_account"
] as const;
export type SubIneligibleReason = (typeof SUB_INELIGIBLE_REASONS)[number];

/** Words the captain and admin read beside a player who cannot sub. */
export const SUB_INELIGIBLE_LABELS: Record<SubIneligibleReason, string> = {
  on_roster: "On your roster",
  in_game: "Already plays in this game",
  suspended: "Suspended for this game",
  not_available: "Not available that day or time",
  availability_unknown: "Has not said when they can play",
  busy_other_game: "Has another game at that time",
  level_mismatch: "Skill level does not match this division",
  guest_season_limit: "Reached the guest limit for your team this season",
  no_account: "Has no account to answer a request"
};

/**
 * Reasons a league admin may override when assigning a sub directly
 * (UC-31 alternative flow). A suspension, a player already in the game,
 * a player on the team's own roster and the guest limits are never
 * overridden: the guest path enforces those for everyone.
 */
export const SUB_ADMIN_OVERRIDABLE: ReadonlyArray<SubIneligibleReason> = [
  "not_available",
  "availability_unknown",
  "busy_other_game",
  "level_mismatch",
  "no_account"
];

export type SubSource = "free_agent" | "league_player";

export const SUB_SOURCE_LABELS: Record<SubSource, string> = {
  free_agent: "Free agent",
  league_player: "Plays in this level"
};

/** Time-of-day windows the free-agent form offers. */
export type SubTimeWindow = "AM" | "PM" | "EVE";

/** AM before noon, PM noon to 5 pm, EVE from 5 pm (rink-local time). */
export function timeWindowOfHour(hour: number): SubTimeWindow {
  if (hour < 12) return "AM";
  if (hour < 17) return "PM";
  return "EVE";
}

/** Weekday ("Mon".."Sun") and hour of `instant` in `timeZone` (UTC when the zone is unknown). */
export function localDayAndHour(
  instant: Date | string,
  timeZone: string | null | undefined
): { day: FreeAgentDay; hour: number } {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  let tz = "UTC";
  if (timeZone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
      tz = timeZone;
    } catch {
      tz = "UTC";
    }
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23"
  }).formatToParts(d);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const day = (FREE_AGENT_DAYS as readonly string[]).includes(wd) ? (wd as FreeAgentDay) : "Mon";
  return { day, hour };
}

/**
 * Free-agent availability against one game. The player form stores
 * `{ "Mon": ["AM","EVE"], ... }`; older rows used lowercase keys or
 * `true` for the whole day. `unknown` when the player marked no day at
 * all, `no` when they did not mark this day or this time of day.
 */
export function freeAgentAvailableFor(
  availability: Record<string, unknown> | null | undefined,
  slot: { day: FreeAgentDay; hour: number }
): "yes" | "no" | "unknown" {
  const entries = Object.entries(availability ?? {});
  const marked = entries.filter(([, v]) => v === true || (Array.isArray(v) && v.length > 0));
  if (marked.length === 0) return "unknown";
  const hit = marked.find(([k]) => k.toLowerCase().slice(0, 3) === slot.day.toLowerCase());
  if (!hit) return "no";
  const v = hit[1];
  if (v === true) return "yes";
  const windows = (v as unknown[]).map((w) => String(w).toUpperCase());
  return windows.includes(timeWindowOfHour(slot.hour)) ? "yes" : "no";
}

/**
 * Whether a player's level suits the division the sub would play in.
 * A free agent lists a primary level and the levels they are happy to
 * play; any one that fits the division's tier is a match. `unknown` when
 * the division has no tier or the player gave no usable level: the
 * captain decides, the server does not guess.
 */
export function subLevelFit(
  levels: ReadonlyArray<string | null | undefined>,
  divisionTier: string | null | undefined
): "match" | "mismatch" | "unknown" {
  const known = levels.map((l) => normalizeSkillLevel(l)).filter((l): l is NonNullable<typeof l> => !!l);
  if (!divisionTier || known.length === 0) return "unknown";
  const fits = known.map((l) => skillLevelFitsTier(l, divisionTier));
  if (fits.some((f) => f === true)) return "match";
  if (fits.every((f) => f === null)) return "unknown";
  return "mismatch";
}

export interface SubCandidateFacts {
  source: SubSource;
  /** Active on the requesting team's roster for the game's season. */
  onThisTeam: boolean;
  /** On the other team's roster, or already on this game's lineup. */
  inGame: boolean;
  /** A suspension bars them from this game. */
  suspended: boolean;
  /** Free agents: their stated availability for the game's day and time. */
  availability: "yes" | "no" | "unknown" | null;
  /** Rostered elsewhere: one of their own games overlaps this one. */
  busyOtherGame: boolean;
  level: "match" | "mismatch" | "unknown";
  /** Guest appearances for the requesting team this season. */
  guestAppearances: number;
  guestSeasonLimit: number;
  /** Has a sign-in, so they can answer a request. */
  hasAccount: boolean;
}

/** Every reason the player cannot be asked; empty when they can. */
export function subIneligibleReasons(f: SubCandidateFacts): SubIneligibleReason[] {
  const out: SubIneligibleReason[] = [];
  if (f.onThisTeam) out.push("on_roster");
  if (f.inGame) out.push("in_game");
  if (f.suspended) out.push("suspended");
  if (f.source === "free_agent") {
    if (f.availability === "no") out.push("not_available");
    if (f.availability === "unknown") out.push("availability_unknown");
  }
  if (f.busyOtherGame) out.push("busy_other_game");
  if (f.level === "mismatch") out.push("level_mismatch");
  if (f.guestAppearances >= f.guestSeasonLimit) out.push("guest_season_limit");
  if (!f.hasAccount) out.push("no_account");
  return out;
}

/** True when an admin may assign the player anyway (every reason is overridable). */
export function subAdminMayOverride(reasons: ReadonlyArray<SubIneligibleReason>): boolean {
  return reasons.every((r) => SUB_ADMIN_OVERRIDABLE.includes(r));
}

/** One line for a reason list: "Suspended for this game; Has another game at that time". */
export function describeSubReasons(reasons: ReadonlyArray<SubIneligibleReason>): string {
  return reasons.map((r) => SUB_INELIGIBLE_LABELS[r]).join("; ");
}

/** A confirmation log entry stored on the request (append-only). */
export interface SubLogEntry {
  at: string;
  status: SubRequestStatus;
  byUserId: string | null;
  note?: string;
}
