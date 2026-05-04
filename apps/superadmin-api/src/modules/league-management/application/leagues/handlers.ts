import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  clampLimit,
  NotFoundError,
  type CommandHandler,
  type QueryHandler
} from "@sportspulse/kernel";
import {
  LEAGUE_REPOSITORY,
  type LeagueRepository
} from "../../domain/repositories/league.repository";
import { LeagueId, SeasonId, GoverningBodyId, RuleSetId } from "../../domain/identifiers";
import { League } from "../../domain/entities/league.entity";
import {
  assertLeagueFormat,
  assertLeagueStatus,
  type LeagueFormat
} from "../../domain/value-objects/league-status.vo";
import { LeagueDto, LeaguePageDto } from "../dtos/league.dto";

export interface ListLeaguesInput {
  limit?: number;
  cursor?: string;
  seasonId?: string;
  sportCode?: string;
  status?: string;
  search?: string;
  /** Optional whitelist passed by the controller from the principal's scope. */
  leagueIdsFilter?: string[];
}

@Injectable()
export class ListLeaguesHandler
  implements QueryHandler<ListLeaguesInput, LeaguePageDto>
{
  constructor(@Inject(LEAGUE_REPOSITORY) private readonly leagues: LeagueRepository) {}
  async execute(input: ListLeaguesInput): Promise<LeaguePageDto> {
    if (input.leagueIdsFilter && input.leagueIdsFilter.length === 0) {
      return { items: [], nextCursor: null };
    }
    const page = await this.leagues.list({
      limit: clampLimit(input.limit),
      cursor: input.cursor,
      seasonId: input.seasonId,
      sportCode: input.sportCode,
      status: input.status,
      search: input.search,
      leagueIdsFilter: input.leagueIdsFilter
    });
    return {
      items: page.items.map(LeagueDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetLeagueHandler
  implements
    QueryHandler<{ id: string; leagueIdsFilter?: string[] }, LeagueDto>
{
  constructor(@Inject(LEAGUE_REPOSITORY) private readonly leagues: LeagueRepository) {}
  async execute(input: { id: string; leagueIdsFilter?: string[] }): Promise<LeagueDto> {
    if (input.leagueIdsFilter && !input.leagueIdsFilter.includes(input.id)) {
      throw new NotFoundError("League", input.id);
    }
    const league = await this.leagues.findById(LeagueId.of(input.id));
    if (!league) throw new NotFoundError("League", input.id);
    return LeagueDto.fromDomain(league);
  }
}

export interface CreateLeagueInput {
  seasonId: string;
  sportCode: string;
  name: string;
  format?: LeagueFormat;
  governingBodyId?: string | null;
  ruleSetId?: string | null;
}

@Injectable()
export class CreateLeagueHandler
  implements CommandHandler<CreateLeagueInput, LeagueDto>
{
  constructor(@Inject(LEAGUE_REPOSITORY) private readonly leagues: LeagueRepository) {}
  async execute(input: CreateLeagueInput): Promise<LeagueDto> {
    const league = League.create({
      id: LeagueId.of(randomUUID()),
      seasonId: SeasonId.of(input.seasonId),
      sportCode: input.sportCode,
      name: input.name,
      format: input.format,
      governingBodyId: input.governingBodyId
        ? GoverningBodyId.of(input.governingBodyId)
        : null,
      ruleSetId: input.ruleSetId ? RuleSetId.of(input.ruleSetId) : null
    });
    await this.leagues.insert(league);
    return LeagueDto.fromDomain(league);
  }
}

export interface UpdateLeagueInput {
  id: string;
  name?: string;
  format?: string;
  governingBodyId?: string | null;
  ruleSetId?: string | null;
}

@Injectable()
export class UpdateLeagueHandler
  implements CommandHandler<UpdateLeagueInput, LeagueDto>
{
  constructor(@Inject(LEAGUE_REPOSITORY) private readonly leagues: LeagueRepository) {}
  async execute(input: UpdateLeagueInput): Promise<LeagueDto> {
    const league = await this.leagues.findById(LeagueId.of(input.id));
    if (!league) throw new NotFoundError("League", input.id);
    if (input.name !== undefined) league.rename(input.name);
    if (input.format !== undefined) league.changeFormat(assertLeagueFormat(input.format));
    if (input.governingBodyId !== undefined) {
      league.setGoverningBody(
        input.governingBodyId ? GoverningBodyId.of(input.governingBodyId) : null
      );
    }
    if (input.ruleSetId !== undefined) {
      league.setRuleSet(input.ruleSetId ? RuleSetId.of(input.ruleSetId) : null);
    }
    await this.leagues.save(league);
    return LeagueDto.fromDomain(league);
  }
}

@Injectable()
export class ChangeLeagueStatusHandler
  implements CommandHandler<{ id: string; status: string }, LeagueDto>
{
  constructor(@Inject(LEAGUE_REPOSITORY) private readonly leagues: LeagueRepository) {}
  async execute(input: { id: string; status: string }): Promise<LeagueDto> {
    const league = await this.leagues.findById(LeagueId.of(input.id));
    if (!league) throw new NotFoundError("League", input.id);
    league.changeStatus(assertLeagueStatus(input.status));
    await this.leagues.save(league);
    return LeagueDto.fromDomain(league);
  }
}
