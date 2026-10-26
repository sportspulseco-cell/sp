/**
 * Registration window: when may a player start or submit a registration
 * for a season? One rule shared by the public funnel endpoints (refuse
 * create / pay outside the window), the season context the funnel
 * renders ("Registration opens on ..."), and the discovery lists.
 *
 * The window governs, not the season status alone (PPHL change #2): a
 * season moved to in_progress still takes late registrations while its
 * window is open. Seasons in playoffs, completed or archived never do.
 *
 * Both ends are required. A season without registrationOpensAt and
 * registrationClosesAt is "not_scheduled" and takes no registrations;
 * the discovery lists already required both (REG-16).
 */
import type { SeasonStatus } from "./season-status";

export const REGISTRATION_ACCEPTING_SEASON_STATUSES = [
  "draft",
  "registration_open",
  "in_progress"
] as const satisfies readonly SeasonStatus[];

export type RegistrationWindowState =
  | "open"
  | "not_yet_open"
  | "closed"
  | "not_scheduled"
  | "season_closed";

export interface RegistrationWindowFields {
  status: string;
  registrationOpensAt: string | Date | null | undefined;
  registrationClosesAt: string | Date | null | undefined;
  /** IANA zone used for player-facing dates. Defaults to UTC. */
  timezone?: string | null;
}

function epochMs(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Classify a season's registration window against `now`. Inclusive at both ends. */
export function registrationWindowState(
  season: RegistrationWindowFields,
  now: Date = new Date()
): RegistrationWindowState {
  if (
    !(REGISTRATION_ACCEPTING_SEASON_STATUSES as readonly string[]).includes(
      season.status
    )
  ) {
    return "season_closed";
  }
  const opens = epochMs(season.registrationOpensAt);
  const closes = epochMs(season.registrationClosesAt);
  if (opens === null || closes === null) return "not_scheduled";
  const t = now.getTime();
  if (t < opens) return "not_yet_open";
  if (t > closes) return "closed";
  return "open";
}

export function isRegistrationOpen(
  season: RegistrationWindowFields,
  now: Date = new Date()
): boolean {
  return registrationWindowState(season, now) === "open";
}

/**
 * "Oct 26, 2026, 12:00 AM EDT" in the season's time zone. Falls back to
 * UTC when the stored zone is not a valid IANA name.
 */
export function formatRegistrationInstant(
  value: string | Date,
  timezone?: string | null
): string {
  const d = value instanceof Date ? value : new Date(value);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  };
  try {
    return new Intl.DateTimeFormat("en-US", {
      ...opts,
      timeZone: timezone || "UTC"
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(d);
  }
}

/**
 * Player-facing sentence for a window that is not open, or null when it
 * is open. The API sends it with refusals and the funnel renders it.
 */
export function registrationWindowMessage(
  season: RegistrationWindowFields & { name?: string | null },
  now: Date = new Date()
): string | null {
  const state = registrationWindowState(season, now);
  const what = season.name ? `Registration for ${season.name}` : "Registration";
  switch (state) {
    case "open":
      return null;
    case "not_yet_open":
      return `${what} opens on ${formatRegistrationInstant(
        season.registrationOpensAt as string | Date,
        season.timezone
      )}.`;
    case "closed":
      return `${what} closed on ${formatRegistrationInstant(
        season.registrationClosesAt as string | Date,
        season.timezone
      )}.`;
    case "not_scheduled":
      return `${what} has no dates yet. The league has not opened it.`;
    case "season_closed":
      return `${what} is closed. This season is no longer taking registrations.`;
  }
}

/**
 * "closes in 3 days" for a registration window's close, for the player's
 * open-registration lists. Null when there is no close date.
 */
export function registrationClosesLabel(closesAt: string | null, now: Date = new Date()): string | null {
  if (!closesAt) return null;
  const days = Math.ceil((new Date(closesAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (days < 0) return "closed";
  if (days === 0) return "closes today";
  if (days === 1) return "closes tomorrow";
  return `closes in ${days} days`;
}

