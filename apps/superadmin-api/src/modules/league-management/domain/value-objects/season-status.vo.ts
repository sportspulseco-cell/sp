import { DomainError } from "@sportspulse/kernel";

export const SEASON_STATUSES = [
  "draft",
  "registration_open",
  "in_progress",
  "playoffs",
  "completed",
  "archived"
] as const;
export type SeasonStatus = (typeof SEASON_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<SeasonStatus, SeasonStatus[]> = {
  draft: ["registration_open", "archived"],
  registration_open: ["in_progress", "draft", "archived"],
  in_progress: ["playoffs", "completed", "archived"],
  playoffs: ["completed", "archived"],
  completed: ["archived"],
  archived: []
};

export const assertSeasonStatus = (raw: string): SeasonStatus => {
  if (!SEASON_STATUSES.includes(raw as SeasonStatus)) {
    throw new DomainError("INVALID_SEASON_STATUS", `Invalid status: ${raw}`);
  }
  return raw as SeasonStatus;
};

export const canTransitionSeason = (
  from: SeasonStatus,
  to: SeasonStatus
): boolean => ALLOWED_TRANSITIONS[from].includes(to);
