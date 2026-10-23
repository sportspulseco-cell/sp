import { DomainError, SEASON_STATUSES, type SeasonStatus } from "@sportspulse/kernel";

// Statuses and transitions live in @sportspulse/kernel so the status
// menus offer exactly what this enforces.
export { SEASON_STATUSES, canTransitionSeason } from "@sportspulse/kernel";
export type { SeasonStatus } from "@sportspulse/kernel";

export const assertSeasonStatus = (raw: string): SeasonStatus => {
  if (!SEASON_STATUSES.includes(raw as SeasonStatus)) {
    throw new DomainError("INVALID_SEASON_STATUS", `Invalid status: ${raw}`);
  }
  return raw as SeasonStatus;
};

