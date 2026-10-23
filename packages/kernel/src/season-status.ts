/**
 * Season lifecycle. The one source of truth for which status changes are
 * legal: the API enforces it and the status menus offer only these, so
 * admins are never shown a choice the server will reject (SETUP-4).
 */
export const SEASON_STATUSES = [
  "draft",
  "registration_open",
  "in_progress",
  "playoffs",
  "completed",
  "archived"
] as const;
export type SeasonStatus = (typeof SEASON_STATUSES)[number];

export const SEASON_STATUS_TRANSITIONS: Record<SeasonStatus, readonly SeasonStatus[]> = {
  draft: ["registration_open", "archived"],
  registration_open: ["in_progress", "draft", "archived"],
  in_progress: ["playoffs", "completed", "archived"],
  playoffs: ["completed", "archived"],
  completed: ["archived"],
  archived: []
};

export function isSeasonStatus(raw: string): raw is SeasonStatus {
  return (SEASON_STATUSES as readonly string[]).includes(raw);
}

export function canTransitionSeason(from: SeasonStatus, to: SeasonStatus): boolean {
  return SEASON_STATUS_TRANSITIONS[from].includes(to);
}

/** Statuses a season in `from` may move to next (empty for unknown input). */
export function nextSeasonStatuses(from: string): readonly SeasonStatus[] {
  return isSeasonStatus(from) ? SEASON_STATUS_TRANSITIONS[from] : [];
}
