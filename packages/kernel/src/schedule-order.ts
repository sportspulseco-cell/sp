/**
 * How a team's schedule is listed for players and captains (F-5).
 * The next game is at the top: upcoming games nearest first, completed
 * games most recent first. "All" is upcoming, then everything past.
 */
export const SCHEDULE_FILTERS = ["upcoming", "completed", "all"] as const;
export type ScheduleFilter = (typeof SCHEDULE_FILTERS)[number];

export const SCHEDULE_FILTER_LABELS: Record<ScheduleFilter, string> = {
  upcoming: "Upcoming",
  completed: "Completed",
  all: "All"
};

/** Games with a final result. */
const FINISHED = new Set(["completed", "forfeited"]);

export interface SchedulableGame {
  scheduledStartTsUtc: string | Date;
  status: string;
}

const at = (g: SchedulableGame) => new Date(g.scheduledStartTsUtc).getTime();

/** A game still to play: live now, or not started and not finished or cancelled. */
export function isUpcomingGame(g: SchedulableGame, now: number = Date.now()): boolean {
  if (g.status === "in_play") return true;
  if (FINISHED.has(g.status) || g.status === "cancelled") return false;
  return at(g) >= now;
}

export function isCompletedGame(g: SchedulableGame): boolean {
  return FINISHED.has(g.status);
}

/** A filter from the URL; anything else is the default, upcoming. */
export function parseScheduleFilter(raw: string | null | undefined): ScheduleFilter {
  return (SCHEDULE_FILTERS as readonly string[]).includes(raw ?? "") ? (raw as ScheduleFilter) : "upcoming";
}

/**
 * The games for one filter, in the order shown:
 *   upcoming   nearest first (a live game first of all)
 *   completed  most recent first
 *   all        upcoming nearest first, then every past game most recent first
 */
export function orderSchedule<T extends SchedulableGame>(
  games: readonly T[],
  filter: ScheduleFilter,
  now: number = Date.now()
): T[] {
  const upcoming = games.filter((g) => isUpcomingGame(g, now)).sort((a, b) => at(a) - at(b));
  const newestFirst = (a: T, b: T) => at(b) - at(a);
  if (filter === "upcoming") return upcoming;
  if (filter === "completed") return games.filter(isCompletedGame).sort(newestFirst);
  const past = games.filter((g) => !isUpcomingGame(g, now)).sort(newestFirst);
  return [...upcoming, ...past];
}
