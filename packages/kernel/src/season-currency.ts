/**
 * "The team's current season" — one rule shared by the API (captain
 * roster, dashboard state) and the web consoles (invite season picker).
 *
 * Given the seasons a team is live in (division entry applied /
 * accepted / confirmed), the current one is:
 *   1. the season whose start..end dates contain today (in progress);
 *   2. else the season whose registration window contains now;
 *   3. else the newest season by start date.
 * Ties inside a group resolve to the newest start date, then input order.
 *
 * Before this, every page picked "newest season by start date" or
 * "newest division entry", so the roster page and the invite flow could
 * default to different seasons for the same team (CAP-8, CAP-15, CAP-24).
 *
 * Dates: `startDate` / `endDate` are calendar dates (YYYY-MM-DD, or a
 * Date); the registration window is a timestamp. "Today" is the UTC
 * calendar date of `now`, matching how the API checks season windows.
 */

export interface SeasonCurrencyFields {
  startDate: string | Date | null | undefined;
  endDate: string | Date | null | undefined;
  registrationOpensAt?: string | Date | null;
  registrationClosesAt?: string | Date | null;
}

export type SeasonCurrency = "in_progress" | "registration_open" | "other";

const CURRENCY_RANK: Record<SeasonCurrency, number> = {
  in_progress: 0,
  registration_open: 1,
  other: 2
};

function isoDay(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function epochMs(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Classify one season against `now`. */
export function seasonCurrency(
  season: SeasonCurrencyFields,
  now: Date = new Date()
): SeasonCurrency {
  const today = now.toISOString().slice(0, 10);
  const start = isoDay(season.startDate);
  const end = isoDay(season.endDate);
  if (start && end && start <= today && today <= end) return "in_progress";

  const opens = epochMs(season.registrationOpensAt);
  const closes = epochMs(season.registrationClosesAt);
  const nowMs = now.getTime();
  if (closes !== null && closes >= nowMs && (opens === null || opens <= nowMs)) {
    return "registration_open";
  }
  return "other";
}

/**
 * Stable sort: most current first. The first element is the season a
 * captain-facing page should default to.
 */
export function sortSeasonsByCurrency<T extends SeasonCurrencyFields>(
  seasons: readonly T[],
  now: Date = new Date()
): T[] {
  return seasons
    .map((season, index) => ({
      season,
      index,
      rank: CURRENCY_RANK[seasonCurrency(season, now)],
      start: isoDay(season.startDate) ?? ""
    }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.start !== b.start) return a.start < b.start ? 1 : -1;
      return a.index - b.index;
    })
    .map((x) => x.season);
}

/** The season a captain-facing page defaults to, or null when none. */
export function pickCurrentSeason<T extends SeasonCurrencyFields>(
  seasons: readonly T[],
  now: Date = new Date()
): T | null {
  return sortSeasonsByCurrency(seasons, now)[0] ?? null;
}

/**
 * The season a roster page shows (CAP-19): the season asked for when the
 * team has played it, otherwise the team's current season by the rule
 * above. `seasons` are the seasons the team has memberships in.
 */
export function pickRosterSeason<T extends SeasonCurrencyFields & { id: string }>(
  seasons: readonly T[],
  requestedId: string | null | undefined,
  now: Date = new Date()
): T | null {
  if (requestedId) {
    const asked = seasons.find((s) => s.id === requestedId);
    if (asked) return asked;
  }
  return pickCurrentSeason(seasons, now);
}
