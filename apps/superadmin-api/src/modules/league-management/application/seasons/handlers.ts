import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
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
import { DRIZZLE } from "../../../../shared/database/database.tokens";

// ---------- Queries ----------

export interface ListSeasonsInput {
  limit?: number;
  cursor?: string;
  /** Filter by league (post-flip — primary nesting). */
  leagueId?: string;
  /** Convenience filter by org (denormalised on seasons). */
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
      leagueId: input.leagueId,
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
  /** Post-flip — seasons live under a league. orgId is derived. */
  leagueId: string;
  /**
   * orgId is denormalised on seasons (matches league.orgId). The
   * controller resolves it from the league before calling this
   * handler so the domain entity has a consistent snapshot to insert.
   */
  orgId: string;
  name: string;
  sportCode: string;
  startDate: string;
  endDate: string;
  timezone?: string;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  rosterLockAt?: string | null;
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
      leagueId: input.leagueId,
      orgId: input.orgId,
      name: input.name,
      sportCode: input.sportCode,
      startDate: input.startDate,
      endDate: input.endDate,
      timezone: input.timezone,
      createdByUserId: input.createdByUserId ?? null
    });
    if (
      input.registrationOpensAt !== undefined ||
      input.registrationClosesAt !== undefined
    ) {
      season.setRegistrationWindow(
        input.registrationOpensAt ? new Date(input.registrationOpensAt) : null,
        input.registrationClosesAt ? new Date(input.registrationClosesAt) : null
      );
    }
    if (input.rosterLockAt !== undefined) {
      season.setRosterLock(
        input.rosterLockAt ? new Date(input.rosterLockAt) : null
      );
    }
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
  constructor(
    @Inject(SEASON_REPOSITORY) private readonly seasons: SeasonRepository,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  async execute(input: ChangeSeasonStatusInput): Promise<SeasonDto> {
    const season = await this.seasons.findById(SeasonId.of(input.id));
    if (!season) throw new NotFoundError("Season", input.id);
    season.changeStatus(assertSeasonStatus(input.status));
    await this.seasons.save(season);

    // Side effect: when a season is opened for registration, flip every
    // configured pricing tier under it to is_active=true. Tiers are
    // created in 'draft' (is_active=false) by the form builder so admins
    // can configure them privately; the status flip is the publish
    // signal. Without this, captains see "No pricing tier configured"
    // even though the season is live.
    if (input.status === "registration_open") {
      await this.db
        .update(schema.pricingTiers)
        .set({ isActive: true, updatedAt: new Date() })
        .where(
          and(
            eq(schema.pricingTiers.seasonId, input.id),
            eq(schema.pricingTiers.isActive, false)
          )
        );
    }

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
