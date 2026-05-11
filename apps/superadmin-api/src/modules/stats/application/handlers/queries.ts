import { Inject, Injectable } from "@nestjs/common";
import { clampLimit, type QueryHandler } from "@sportspulse/kernel";
import {
  STATS_REPOSITORY,
  type StatsRepository
} from "../../domain/repositories/stats.repository";
import {
  LeaderboardDto,
  StandingDto,
  StatLineDto,
  StatLinePageDto
} from "../dtos/stats.dto";

export interface ListStatLinesInput {
  limit?: number;
  cursor?: string;
  personId?: string;
  teamId?: string;
  leagueId?: string;
  seasonId?: string;
  divisionId?: string;
  gameId?: string;
}

@Injectable()
export class ListStatLinesHandler
  implements QueryHandler<ListStatLinesInput, StatLinePageDto>
{
  constructor(
    @Inject(STATS_REPOSITORY) private readonly stats: StatsRepository
  ) {}
  async execute(input: ListStatLinesInput): Promise<StatLinePageDto> {
    const page = await this.stats.listLines({
      ...input,
      limit: clampLimit(input.limit)
    });
    return {
      items: page.items.map(StatLineDto.fromRow),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class ListLinesForGameHandler
  implements QueryHandler<{ gameId: string }, StatLineDto[]>
{
  constructor(
    @Inject(STATS_REPOSITORY) private readonly stats: StatsRepository
  ) {}
  async execute(input: { gameId: string }): Promise<StatLineDto[]> {
    const rows = await this.stats.listLinesForGame(input.gameId);
    return rows.map(StatLineDto.fromRow);
  }
}

@Injectable()
export class ListStandingsHandler
  implements
    QueryHandler<{ leagueId: string; divisionId?: string }, StandingDto[]>
{
  constructor(
    @Inject(STATS_REPOSITORY) private readonly stats: StatsRepository
  ) {}
  async execute(input: {
    leagueId: string;
    divisionId?: string;
  }): Promise<StandingDto[]> {
    const rows = await this.stats.listStandings(input.leagueId, input.divisionId);
    return rows.map(StandingDto.fromRow);
  }
}

/**
 * Workflow 7C dashboard helper — one team's standings row plus the
 * standing rank within the supplied league/division. Returns null
 * if no standings row has been derived yet for the team.
 */
@Injectable()
export class TeamStandingHandler
  implements
    QueryHandler<
      { teamId: string; leagueId: string; divisionId?: string },
      {
        team: StandingDto | null;
        rankInDivision: number | null;
        teamCountInDivision: number;
      }
    >
{
  constructor(
    @Inject(STATS_REPOSITORY) private readonly stats: StatsRepository
  ) {}
  async execute(input: {
    teamId: string;
    leagueId: string;
    divisionId?: string;
  }) {
    const rows = await this.stats.listStandings(
      input.leagueId,
      input.divisionId
    );
    const sorted = rows
      .map(StandingDto.fromRow)
      .sort((a, b) => b.points - a.points || b.gd - a.gd);
    const idx = sorted.findIndex((r) => r.teamId === input.teamId);
    return {
      team: idx >= 0 ? sorted[idx]! : null,
      rankInDivision: idx >= 0 ? idx + 1 : null,
      teamCountInDivision: sorted.length
    };
  }
}

export interface BuildLeaderboardInput {
  scopeType: "platform" | "org" | "league" | "division";
  scopeId?: string | null;
  metric: string;
  windowKind?: "season" | "last_n" | "all_time";
  sportCode: string;
  topN?: number;
  /** When scope is league/division, restrict source data to that scope */
  leagueId?: string;
  divisionId?: string;
}

@Injectable()
export class BuildLeaderboardHandler
  implements QueryHandler<BuildLeaderboardInput, LeaderboardDto>
{
  constructor(
    @Inject(STATS_REPOSITORY) private readonly stats: StatsRepository
  ) {}
  async execute(input: BuildLeaderboardInput): Promise<LeaderboardDto> {
    const topN = input.topN ?? 25;
    // Aggregate sum of `core[metric]` per person across stat lines in scope
    const lines = await this.stats.listLines({
      limit: 1000,
      leagueId: input.leagueId,
      divisionId: input.divisionId
    });
    const totals = new Map<string, { teamId: string; value: number }>();
    for (const l of lines.items) {
      const v = (l.core?.[input.metric] as number) ?? 0;
      const cur = totals.get(l.personId);
      if (!cur) {
        totals.set(l.personId, { teamId: l.teamId, value: v });
      } else {
        cur.value += v;
        cur.teamId = l.teamId;
      }
    }
    const entries = Array.from(totals.entries())
      .map(([personId, x]) => ({ personId, teamId: x.teamId, value: x.value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, topN);

    await this.stats.upsertLeaderboard({
      scopeType: input.scopeType,
      scopeId: input.scopeId ?? null,
      metric: input.metric,
      windowKind: input.windowKind ?? "season",
      sportCode: input.sportCode,
      entries
    });
    const row = await this.stats.findLeaderboard(
      input.scopeType,
      input.scopeId ?? null,
      input.metric,
      input.windowKind ?? "season"
    );
    return LeaderboardDto.fromRow(row!);
  }
}
