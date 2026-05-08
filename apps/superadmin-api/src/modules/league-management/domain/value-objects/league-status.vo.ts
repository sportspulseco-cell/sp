import { DomainError } from "@sportspulse/kernel";

/**
 * Mirrors the DB CHECK constraint `league_status_check` —
 * leagues are coarser than seasons (draft / active / archived). The
 * fine-grained registration_open/in_progress/playoffs lifecycle lives
 * on `seasons.status`, not the league.
 */
export const LEAGUE_STATUSES = ["draft", "active", "archived"] as const;
export type LeagueStatus = (typeof LEAGUE_STATUSES)[number];

export const LEAGUE_FORMATS = [
  "regular",
  "tournament",
  "pickup",
  "friendly"
] as const;
export type LeagueFormat = (typeof LEAGUE_FORMATS)[number];

export const assertLeagueStatus = (raw: string): LeagueStatus => {
  if (!LEAGUE_STATUSES.includes(raw as LeagueStatus))
    throw new DomainError("INVALID_LEAGUE_STATUS", `Invalid status: ${raw}`);
  return raw as LeagueStatus;
};

export const assertLeagueFormat = (raw: string): LeagueFormat => {
  if (!LEAGUE_FORMATS.includes(raw as LeagueFormat))
    throw new DomainError("INVALID_LEAGUE_FORMAT", `Invalid format: ${raw}`);
  return raw as LeagueFormat;
};
