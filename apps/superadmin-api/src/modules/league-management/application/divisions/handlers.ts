import { Inject, Injectable } from "@nestjs/common";
import { STANDINGS_TIEBREAKERS, ValidationError, parseTiebreakers, pointsRuleProblem } from "@sportspulse/kernel";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  clampLimit,
  DomainError,
  NotFoundError,
  type CommandHandler,
  type QueryHandler
} from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import {
  DIVISION_REPOSITORY,
  type DivisionRepository
} from "../../domain/repositories/division.repository";
import { DivisionId, SeasonId, AgeGroupId, RegionId } from "../../domain/identifiers";
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
  regionId?: string;
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
      regionId: input.regionId,
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
    QueryHandler<
      { id: string; leagueIdsFilter?: string[]; orgIdsFilter?: string[] },
      DivisionDto
    >
{
  constructor(@Inject(DIVISION_REPOSITORY) private readonly divisions: DivisionRepository) {}
  async execute(input: {
    id: string;
    leagueIdsFilter?: string[];
    orgIdsFilter?: string[];
  }): Promise<DivisionDto> {
    const d = await this.divisions.findById(DivisionId.of(input.id));
    if (!d) throw new NotFoundError("Division", input.id);

    // Scope check: division → parent season has leagueId + orgId.
    // Accept when either filter accepts; 404 (not 403) on miss so we
    // never leak existence. Previously this was an explicit TODO
    // skip — every authenticated user could read every division.
    const hasLeagueFilter = input.leagueIdsFilter !== undefined;
    const hasOrgFilter = input.orgIdsFilter !== undefined;
    if (hasLeagueFilter || hasOrgFilter) {
      const ctx = await this.divisions.loadScopeContext(
        DivisionId.of(input.id)
      );
      if (!ctx) throw new NotFoundError("Division", input.id);
      const inLeagueScope =
        hasLeagueFilter && input.leagueIdsFilter!.includes(ctx.leagueId);
      const inOrgScope =
        hasOrgFilter && input.orgIdsFilter!.includes(ctx.orgId);
      if (!inLeagueScope && !inOrgScope) {
        throw new NotFoundError("Division", input.id);
      }
    }
    return DivisionDto.fromDomain(d);
  }
}

/**
 * A division's region must be an active region of the org that owns the
 * division's season. Shared by create and update so the two paths can
 * never drift (DomainError -> 422 through the exception filter).
 */
async function assertRegionInSeasonOrg(
  db: Database,
  seasonId: string,
  regionId: string
): Promise<void> {
  const [season] = await db
    .select({ orgId: schema.seasons.orgId })
    .from(schema.seasons)
    .where(eq(schema.seasons.id, seasonId))
    .limit(1);
  if (!season) throw new NotFoundError("Season", seasonId);
  const [region] = await db
    .select({ id: schema.regions.id })
    .from(schema.regions)
    .where(
      and(
        eq(schema.regions.id, regionId),
        eq(schema.regions.orgId, season.orgId),
        eq(schema.regions.status, "active")
      )
    )
    .limit(1);
  if (!region) {
    throw new DomainError(
      "REGION_NOT_IN_ORG",
      "Region must be an active region of the organization that owns this season"
    );
  }
}

export interface CreateDivisionInput {
  seasonId: string;
  name: string;
  tier?: string | null;
  ageGroupId?: string | null;
  regionId?: string | null;
  genderEligibility?: GenderEligibility;
  maxTeams?: number | null;
  ruleSetOverrides?: Record<string, unknown>;
  playoffConfig?: Record<string, unknown>;
}

@Injectable()
export class CreateDivisionHandler
  implements CommandHandler<CreateDivisionInput, DivisionDto>
{
  constructor(
    @Inject(DIVISION_REPOSITORY) private readonly divisions: DivisionRepository,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}
  async execute(input: CreateDivisionInput): Promise<DivisionDto> {
    assertRuleSet(input.ruleSetOverrides);
    if (input.regionId) await assertRegionInSeasonOrg(this.db, input.seasonId, input.regionId);
    const division = Division.create({
      id: DivisionId.of(randomUUID()),
      seasonId: SeasonId.of(input.seasonId),
      name: input.name,
      tier: input.tier,
      ageGroupId: input.ageGroupId ? AgeGroupId.of(input.ageGroupId) : null,
      regionId: input.regionId ? RegionId.of(input.regionId) : null,
      genderEligibility: input.genderEligibility,
      maxTeams: input.maxTeams,
      ruleSetOverrides: input.ruleSetOverrides,
      playoffConfig: input.playoffConfig
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
  regionId?: string | null;
  genderEligibility?: GenderEligibility;
  maxTeams?: number | null;
  ruleSetOverrides?: Record<string, unknown>;
  playoffConfig?: Record<string, unknown>;
}

@Injectable()
export class UpdateDivisionHandler
  implements CommandHandler<UpdateDivisionInput, DivisionDto>
{
  constructor(
    @Inject(DIVISION_REPOSITORY) private readonly divisions: DivisionRepository,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}
  async execute(input: UpdateDivisionInput): Promise<DivisionDto> {
    const d = await this.divisions.findById(DivisionId.of(input.id));
    if (!d) throw new NotFoundError("Division", input.id);
    if (input.regionId !== undefined) {
      if (input.regionId) await assertRegionInSeasonOrg(this.db, d.seasonId.value, input.regionId);
      d.setRegion(input.regionId ? RegionId.of(input.regionId) : null);
    }
    if (input.name !== undefined) d.rename(input.name);
    if (input.tier !== undefined) d.setTier(input.tier);
    if (input.ageGroupId !== undefined) {
      d.setAgeGroup(input.ageGroupId ? AgeGroupId.of(input.ageGroupId) : null);
    }
    if (input.genderEligibility !== undefined) d.setGenderEligibility(input.genderEligibility);
    if (input.maxTeams !== undefined) d.setMaxTeams(input.maxTeams);
    if (input.ruleSetOverrides !== undefined) {
      assertRuleSet(input.ruleSetOverrides);
      d.setRuleSetOverrides(input.ruleSetOverrides);
    }
    if (input.playoffConfig !== undefined) d.setPlayoffConfig(input.playoffConfig);
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

/**
 * Standings points and tie-break order are read by every recompute
 * (FR-3.13.1), so a bad value is refused here in words, never stored.
 */
function assertRuleSet(rules: Record<string, unknown> | undefined): void {
  if (!rules) return;
  const pr = rules.pointsRule;
  if (pr !== undefined && pr !== null) {
    if (typeof pr !== "object") throw new ValidationError("Standings points must be five whole numbers.");
    const problem = pointsRuleProblem(pr as Record<string, unknown>);
    if (problem) throw new ValidationError(problem);
  }
  const tb = rules.tiebreakers;
  if (tb !== undefined && tb !== null) {
    if (!Array.isArray(tb) || parseTiebreakers(tb).length !== tb.length) {
      throw new ValidationError(`Tiebreakers must be listed once each from: ${STANDINGS_TIEBREAKERS.join(", ")}.`);
    }
  }
}
