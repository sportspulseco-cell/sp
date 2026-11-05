/** Bounded, count-only read model for the staff season lifecycle. */
export interface SeasonOverview {
  seasonId: string; divisions: number; registrations: number;
  waitingRegistrations: number; pendingTeamApplications: number;
  placedTeams: number; players: number; games: number; finalGames: number;
  publishedForm: boolean;
  nextGame: { startsAt: string; timezone: string } | null;
}
