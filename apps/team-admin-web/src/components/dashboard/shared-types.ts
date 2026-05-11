import type { Team } from "@sportspulse/api-client";

export type DashboardState = {
  mode:
    | "off_season"
    | "registration_open"
    | "applied"
    | "in_season"
    | "post_season";
  teamId: string;
  seasonId: string | null;
  leagueId: string | null;
  seasonName: string | null;
  leagueName: string | null;
  divisionTeamEntryId: string | null;
  entryStatus: string | null;
  registrationClosesAt: string | null;
  collectedCents: number;
  thresholdCents: number;
};

export type DashboardTeam = Team;
