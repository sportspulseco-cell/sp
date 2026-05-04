import type { Page, PageQuery } from "@sportspulse/kernel";

export interface StatLineRow {
  id: string;
  gameId: string;
  personId: string;
  teamId: string;
  sportCode: string;
  seasonId: string | null;
  leagueId: string | null;
  divisionId: string | null;
  gpIncrement: number;
  minutesPlayed: number | null;
  core: Record<string, number>;
  extended: Record<string, unknown>;
  derivedAt: Date;
  createdAt: Date;
}

export interface StandingRow {
  id: string;
  leagueId: string;
  divisionId: string | null;
  teamId: string;
  gp: number;
  w: number;
  l: number;
  t: number;
  otl: number;
  points: number;
  gf: number;
  ga: number;
  gd: number;
  rank: number | null;
  tiebreakers: Record<string, unknown>;
  derivedAt: Date;
}

export interface LeaderboardRow {
  id: string;
  scopeType: string;
  scopeId: string | null;
  metric: string;
  windowKind: string;
  sportCode: string;
  entries: Array<{
    personId?: string;
    teamId?: string;
    value: number;
    name?: string;
  }>;
  rankedAt: Date;
}

export interface ListStatLinesQuery extends PageQuery {
  personId?: string;
  teamId?: string;
  leagueId?: string;
  seasonId?: string;
  divisionId?: string;
  gameId?: string;
}

export interface UpsertStatLine {
  gameId: string;
  personId: string;
  teamId: string;
  sportCode: string;
  seasonId?: string | null;
  leagueId?: string | null;
  divisionId?: string | null;
  gpIncrement?: number;
  minutesPlayed?: number | null;
  core: Record<string, number>;
  extended: Record<string, unknown>;
}

export interface StatsRepository {
  // StatLines
  listLines(q: ListStatLinesQuery): Promise<Page<StatLineRow>>;
  listLinesForGame(gameId: string): Promise<StatLineRow[]>;
  upsertStatLines(rows: UpsertStatLine[]): Promise<void>;
  deleteStatLinesForGame(gameId: string): Promise<void>;

  // Standings
  listStandings(leagueId: string, divisionId?: string): Promise<StandingRow[]>;
  upsertStanding(row: Omit<StandingRow, "id" | "derivedAt">): Promise<void>;
  deleteStandingsForLeague(leagueId: string): Promise<void>;

  // Leaderboards
  upsertLeaderboard(
    row: Omit<LeaderboardRow, "id" | "rankedAt">
  ): Promise<void>;
  findLeaderboard(
    scopeType: string,
    scopeId: string | null,
    metric: string,
    windowKind: string
  ): Promise<LeaderboardRow | null>;
}

export const STATS_REPOSITORY = Symbol("STATS_REPOSITORY");
