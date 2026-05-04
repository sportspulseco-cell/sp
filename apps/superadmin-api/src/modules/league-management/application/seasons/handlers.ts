import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  clampLimit,
  NotFoundError,
  type CommandHandler,
  type QueryHandler
} from "@sportspulse/kernel";
import {
  SEASON_REPOSITORY,
  type SeasonRepository
} from "../../domain/repositories/season.repository";
import { SeasonId } from "../../domain/identifiers";
import { Season } from "../../domain/entities/season.entity";
import { assertSeasonStatus } from "../../domain/value-objects/season-status.vo";
import { SeasonDto, SeasonPageDto } from "../dtos/season.dto";

// ---------- Queries ----------

export interface ListSeasonsInput {
  limit?: number;
  cursor?: string;
  orgId?: string;
  sportCode?: string;
  status?: string;
  search?: string;
}

@Injectable()
export class ListSeasonsHandler
  implements QueryHandler<ListSeasonsInput, SeasonPageDto>
{
  constructor(@Inject(SEASON_REPOSITORY) private readonly seasons: SeasonRepository) {}

  async execute(input: ListSeasonsInput): Promise<SeasonPageDto> {
    const page = await this.seasons.list({
      limit: clampLimit(input.limit),
      cursor: input.cursor,
      orgId: input.orgId,
      sportCode: input.sportCode,
      status: input.status,
      search: input.search
    });
    return {
      items: page.items.map(SeasonDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetSeasonHandler implements QueryHandler<{ id: string }, SeasonDto> {
  constructor(@Inject(SEASON_REPOSITORY) private readonly seasons: SeasonRepository) {}

  async execute(input: { id: string }): Promise<SeasonDto> {
    const season = await this.seasons.findById(SeasonId.of(input.id));
    if (!season) throw new NotFoundError("Season", input.id);
    return SeasonDto.fromDomain(season);
  }
}

// ---------- Commands ----------

export interface CreateSeasonInput {
  orgId: string;
  name: string;
  sportCode: string;
  startDate: string;
  endDate: string;
  timezone?: string;
  createdByUserId?: string | null;
}

@Injectable()
export class CreateSeasonHandler
  implements CommandHandler<CreateSeasonInput, SeasonDto>
{
  constructor(@Inject(SEASON_REPOSITORY) private readonly seasons: SeasonRepository) {}

  async execute(input: CreateSeasonInput): Promise<SeasonDto> {
    const season = Season.create({
      id: SeasonId.of(randomUUID()),
      orgId: input.orgId,
      name: input.name,
      sportCode: input.sportCode,
      startDate: input.startDate,
      endDate: input.endDate,
      timezone: input.timezone,
      createdByUserId: input.createdByUserId ?? null
    });
    await this.seasons.insert(season);
    return SeasonDto.fromDomain(season);
  }
}

export interface UpdateSeasonInput {
  id: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  rosterLockAt?: string | null;
}

@Injectable()
export class UpdateSeasonHandler
  implements CommandHandler<UpdateSeasonInput, SeasonDto>
{
  constructor(@Inject(SEASON_REPOSITORY) private readonly seasons: SeasonRepository) {}

  async execute(input: UpdateSeasonInput): Promise<SeasonDto> {
    const season = await this.seasons.findById(SeasonId.of(input.id));
    if (!season) throw new NotFoundError("Season", input.id);

    if (input.name !== undefined) season.rename(input.name);
    if (input.startDate !== undefined && input.endDate !== undefined) {
      season.reschedule(input.startDate, input.endDate);
    } else if (input.startDate !== undefined || input.endDate !== undefined) {
      season.reschedule(
        input.startDate ?? season.startDate,
        input.endDate ?? season.endDate
      );
    }
    if (input.timezone !== undefined) season.setTimezone(input.timezone);
    if (
      input.registrationOpensAt !== undefined ||
      input.registrationClosesAt !== undefined
    ) {
      season.setRegistrationWindow(
        input.registrationOpensAt
          ? new Date(input.registrationOpensAt)
          : season.registrationOpensAt,
        input.registrationClosesAt
          ? new Date(input.registrationClosesAt)
          : season.registrationClosesAt
      );
    }
    if (input.rosterLockAt !== undefined) {
      season.setRosterLock(
        input.rosterLockAt ? new Date(input.rosterLockAt) : null
      );
    }
    await this.seasons.save(season);
    return SeasonDto.fromDomain(season);
  }
}

export interface ChangeSeasonStatusInput {
  id: string;
  status: string;
}

@Injectable()
export class ChangeSeasonStatusHandler
  implements CommandHandler<ChangeSeasonStatusInput, SeasonDto>
{
  constructor(@Inject(SEASON_REPOSITORY) private readonly seasons: SeasonRepository) {}

  async execute(input: ChangeSeasonStatusInput): Promise<SeasonDto> {
    const season = await this.seasons.findById(SeasonId.of(input.id));
    if (!season) throw new NotFoundError("Season", input.id);
    season.changeStatus(assertSeasonStatus(input.status));
    await this.seasons.save(season);
    return SeasonDto.fromDomain(season);
  }
}

@Injectable()
export class ArchiveSeasonHandler
  implements CommandHandler<{ id: string }, SeasonDto>
{
  constructor(@Inject(SEASON_REPOSITORY) private readonly seasons: SeasonRepository) {}

  async execute(input: { id: string }): Promise<SeasonDto> {
    const season = await this.seasons.findById(SeasonId.of(input.id));
    if (!season) throw new NotFoundError("Season", input.id);
    season.archive();
    await this.seasons.save(season);
    return SeasonDto.fromDomain(season);
  }
}
