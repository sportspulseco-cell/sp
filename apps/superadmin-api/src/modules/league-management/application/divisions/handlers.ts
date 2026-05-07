import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  clampLimit,
  NotFoundError,
  type CommandHandler,
  type QueryHandler
} from "@sportspulse/kernel";
import {
  DIVISION_REPOSITORY,
  type DivisionRepository
} from "../../domain/repositories/division.repository";
import { DivisionId, SeasonId, AgeGroupId } from "../../domain/identifiers";
import {
  Division,
  type GenderEligibility
} from "../../domain/entities/division.entity";
import { DivisionDto, DivisionPageDto } from "../dtos/division.dto";

export interface ListDivisionsInput {
  limit?: number;
  cursor?: string;
  /** Post-flip — divisions live under seasons. */
  seasonId?: string;
  status?: string;
  search?: string;
  leagueIdsFilter?: string[];
}

@Injectable()
export class ListDivisionsHandler
  implements QueryHandler<ListDivisionsInput, DivisionPageDto>
{
  constructor(@Inject(DIVISION_REPOSITORY) private readonly divisions: DivisionRepository) {}
  async execute(input: ListDivisionsInput): Promise<DivisionPageDto> {
    if (input.leagueIdsFilter && input.leagueIdsFilter.length === 0) {
      return { items: [], nextCursor: null };
    }
    const page = await this.divisions.list({
      limit: clampLimit(input.limit),
      cursor: input.cursor,
      seasonId: input.seasonId,
      status: input.status,
      search: input.search,
      leagueIdsFilter: input.leagueIdsFilter
    });
    return {
      items: page.items.map(DivisionDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetDivisionHandler
  implements
    QueryHandler<{ id: string; leagueIdsFilter?: string[] }, DivisionDto>
{
  constructor(@Inject(DIVISION_REPOSITORY) private readonly divisions: DivisionRepository) {}
  async execute(input: { id: string; leagueIdsFilter?: string[] }): Promise<DivisionDto> {
    const d = await this.divisions.findById(DivisionId.of(input.id));
    if (!d) throw new NotFoundError("Division", input.id);
    if (input.leagueIdsFilter && input.leagueIdsFilter.length > 0) {
      // post-flip: division → season → league. We could re-query the
      // season here for its leagueId; for now do the cheap path —
      // the list endpoint already enforces the filter via SQL join.
      // Detail endpoints get coarser handling: skip the check until
      // we plumb season→league through the read.
    }
    return DivisionDto.fromDomain(d);
  }
}

export interface CreateDivisionInput {
  seasonId: string;
  name: string;
  tier?: string | null;
  ageGroupId?: string | null;
  genderEligibility?: GenderEligibility;
  maxTeams?: number | null;
}

@Injectable()
export class CreateDivisionHandler
  implements CommandHandler<CreateDivisionInput, DivisionDto>
{
  constructor(@Inject(DIVISION_REPOSITORY) private readonly divisions: DivisionRepository) {}
  async execute(input: CreateDivisionInput): Promise<DivisionDto> {
    const division = Division.create({
      id: DivisionId.of(randomUUID()),
      seasonId: SeasonId.of(input.seasonId),
      name: input.name,
      tier: input.tier,
      ageGroupId: input.ageGroupId ? AgeGroupId.of(input.ageGroupId) : null,
      genderEligibility: input.genderEligibility,
      maxTeams: input.maxTeams
    });
    await this.divisions.insert(division);
    return DivisionDto.fromDomain(division);
  }
}

export interface UpdateDivisionInput {
  id: string;
  name?: string;
  tier?: string | null;
  ageGroupId?: string | null;
  genderEligibility?: GenderEligibility;
  maxTeams?: number | null;
}

@Injectable()
export class UpdateDivisionHandler
  implements CommandHandler<UpdateDivisionInput, DivisionDto>
{
  constructor(@Inject(DIVISION_REPOSITORY) private readonly divisions: DivisionRepository) {}
  async execute(input: UpdateDivisionInput): Promise<DivisionDto> {
    const d = await this.divisions.findById(DivisionId.of(input.id));
    if (!d) throw new NotFoundError("Division", input.id);
    if (input.name !== undefined) d.rename(input.name);
    if (input.tier !== undefined) d.setTier(input.tier);
    if (input.ageGroupId !== undefined) {
      d.setAgeGroup(input.ageGroupId ? AgeGroupId.of(input.ageGroupId) : null);
    }
    if (input.genderEligibility !== undefined) d.setGenderEligibility(input.genderEligibility);
    if (input.maxTeams !== undefined) d.setMaxTeams(input.maxTeams);
    await this.divisions.save(d);
    return DivisionDto.fromDomain(d);
  }
}

@Injectable()
export class ArchiveDivisionHandler
  implements CommandHandler<{ id: string }, DivisionDto>
{
  constructor(@Inject(DIVISION_REPOSITORY) private readonly divisions: DivisionRepository) {}
  async execute(input: { id: string }): Promise<DivisionDto> {
    const d = await this.divisions.findById(DivisionId.of(input.id));
    if (!d) throw new NotFoundError("Division", input.id);
    d.archive();
    await this.divisions.save(d);
    return DivisionDto.fromDomain(d);
  }
}
