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
  /**
   * Scope whitelist from the principal. A season is in scope if its
   * league_id ∈ leagueIdsFilter OR its org_id ∈ orgIdsFilter. Union
   * mirrors the teams scope fix (ba73ee2). Pass undefined when the
   * caller is unrestricted (super_admin / platform-scoped).
   */
  leagueIdsFilter?: string[];
  orgIdsFilter?: string[];
}

@Injectable()
export class ListSeasonsHandler
  implements QueryHandler<ListSeasonsInput, SeasonPageDto>
{
  constructor(@Inject(SEASON_REPOSITORY) private readonly seasons: SeasonRepository) {}

  async execute(input: ListSeasonsInput): Promise<SeasonPageDto> {
    // Zero visibility on both scope dimensions → empty page.
    const leagueEmpty =
      input.leagueIdsFilter !== undefined && input.leagueIdsFilter.length === 0;
    const orgEmpty =
      input.orgIdsFilter !== undefined && input.orgIdsFilter.length === 0;
    if (leagueEmpty && orgEmpty) {
      return { items: [], nextCursor: null };
    }
    const page = await this.seasons.list({
      limit: clampLimit(input.limit),
      cursor: input.cursor,
      leagueId: input.leagueId,
      orgId: input.orgId,
      sportCode: input.sportCode,
      status: input.status,
      search: input.search,
      leagueIdsFilter: input.leagueIdsFilter,
      orgIdsFilter: input.orgIdsFilter
    });
    return {
      items: page.items.map(SeasonDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetSeasonHandler
  implements
    QueryHandler<
      { id: string; leagueIdsFilter?: string[]; orgIdsFilter?: string[] },
      SeasonDto
    >
{
  constructor(@Inject(SEASON_REPOSITORY) private readonly seasons: SeasonRepository) {}

  async execute(input: {
    id: string;
    leagueIdsFilter?: string[];
    orgIdsFilter?: string[];
  }): Promise<SeasonDto> {
    const season = await this.seasons.findById(SeasonId.of(input.id));
    if (!season) throw new NotFoundError("Season", input.id);

    // Scope check: accept if either filter accepts. 404 (not 403) on
    // miss so we never leak existence across orgs.
    const hasLeagueFilter = input.leagueIdsFilter !== undefined;
    const hasOrgFilter = input.orgIdsFilter !== undefined;
    if (hasLeagueFilter || hasOrgFilter) {
      const snap = season.toSnapshot();
      const inLeagueScope =
        hasLeagueFilter && input.leagueIdsFilter!.includes(snap.leagueId);
      const inOrgScope =
        hasOrgFilter && input.orgIdsFilter!.includes(snap.orgId);
      if (!inLeagueScope && !inOrgScope) {
        throw new NotFoundError("Season", input.id);
      }
    }
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

    // Side effect: pricing tiers track the season's open/closed state.
    //   • registration_open → flip every is_active=false tier to true
    //     (publish signal — tiers are created draft so admins can
    //     configure them privately).
    //   • anything else (draft / scheduled / completed / cancelled /
    //     archived) → flip every is_active=true tier back to false
    //     (P0-4 / audit §4.4: demoting to draft left tiers live, so a
    //     captain could still hit the wizard against a closed season).
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
    } else {
      await this.db
        .update(schema.pricingTiers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(schema.pricingTiers.seasonId, input.id),
            eq(schema.pricingTiers.isActive, true)
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
