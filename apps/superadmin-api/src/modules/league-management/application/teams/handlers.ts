import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  clampLimit,
  NotFoundError,
  type CommandHandler,
  type QueryHandler
} from "@sportspulse/kernel";
import {
  TEAM_REPOSITORY,
  type TeamRepository
} from "../../domain/repositories/team.repository";
import { TeamId } from "../../domain/identifiers";
import { Team } from "../../domain/entities/team.entity";
import { TeamDto, TeamPageDto } from "../dtos/team.dto";

export interface ListTeamsInput {
  limit?: number;
  cursor?: string;
  orgId?: string;
  sportCode?: string;
  status?: string;
  search?: string;
  leagueIdsFilter?: string[];
  /**
   * Org-scope whitelist. Honoured *together with* `leagueIdsFilter` —
   * a team is in scope if its org_id ∈ orgIdsFilter OR it has an
   * active DTE under a league in leagueIdsFilter. Lets org_admin see
   * orphan teams (no division entry yet) that still belong to their
   * org.
   */
  orgIdsFilter?: string[];
}

@Injectable()
export class ListTeamsHandler
  implements QueryHandler<ListTeamsInput, TeamPageDto>
{
  constructor(@Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository) {}
  async execute(input: ListTeamsInput): Promise<TeamPageDto> {
    // Zero visibility on *both* dimensions → empty page. Empty on just
    // one is fine: the union may still surface rows.
    const leagueEmpty =
      input.leagueIdsFilter !== undefined &&
      input.leagueIdsFilter.length === 0;
    const orgEmpty =
      input.orgIdsFilter !== undefined && input.orgIdsFilter.length === 0;
    if (leagueEmpty && orgEmpty) {
      return { items: [], nextCursor: null };
    }
    const page = await this.teams.list({
      limit: clampLimit(input.limit),
      cursor: input.cursor,
      orgId: input.orgId,
      sportCode: input.sportCode,
      status: input.status,
      search: input.search,
      leagueIdsFilter: input.leagueIdsFilter,
      orgIdsFilter: input.orgIdsFilter
    });
    return {
      items: page.items.map(TeamDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetTeamHandler
  implements
    QueryHandler<
      { id: string; leagueIdsFilter?: string[]; orgIdsFilter?: string[] },
      TeamDto
    >
{
  constructor(@Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository) {}
  async execute(input: {
    id: string;
    leagueIdsFilter?: string[];
    orgIdsFilter?: string[];
  }): Promise<TeamDto> {
    const t = await this.teams.findById(TeamId.of(input.id));
    if (!t) throw new NotFoundError("Team", input.id);

    // Scope check: pass when either filter accepts. Org-level visibility
    // covers orphan teams (no division entry yet); the league check
    // covers teams reached via active DTE.
    const hasLeagueFilter = input.leagueIdsFilter !== undefined;
    const hasOrgFilter = input.orgIdsFilter !== undefined;
    if (hasLeagueFilter || hasOrgFilter) {
      const inOrgScope =
        hasOrgFilter &&
        input.orgIdsFilter!.includes(t.toSnapshot().orgId);
      const inLeagueScope =
        hasLeagueFilter &&
        input.leagueIdsFilter!.length > 0 &&
        (await this.teams.existsInLeagues(
          TeamId.of(input.id),
          input.leagueIdsFilter!
        ));
      if (!inOrgScope && !inLeagueScope) {
        throw new NotFoundError("Team", input.id);
      }
    }
    return TeamDto.fromDomain(t);
  }
}

export interface CreateTeamInput {
  orgId: string;
  name: string;
  sportCode: string;
  shortName?: string | null;
  logoUrl?: string | null;
  colors?: Record<string, unknown>;
}

@Injectable()
export class CreateTeamHandler
  implements CommandHandler<CreateTeamInput, TeamDto>
{
  constructor(@Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository) {}
  async execute(input: CreateTeamInput): Promise<TeamDto> {
    const team = Team.create({
      id: TeamId.of(randomUUID()),
      orgId: input.orgId,
      name: input.name,
      sportCode: input.sportCode,
      shortName: input.shortName,
      logoUrl: input.logoUrl,
      colors: input.colors
    });
    await this.teams.insert(team);
    return TeamDto.fromDomain(team);
  }
}

export interface UpdateTeamInput {
  id: string;
  name?: string;
  shortName?: string | null;
  logoUrl?: string | null;
  colors?: Record<string, unknown>;
}

@Injectable()
export class UpdateTeamHandler
  implements CommandHandler<UpdateTeamInput, TeamDto>
{
  constructor(@Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository) {}
  async execute(input: UpdateTeamInput): Promise<TeamDto> {
    const t = await this.teams.findById(TeamId.of(input.id));
    if (!t) throw new NotFoundError("Team", input.id);
    if (input.name !== undefined) t.rename(input.name, input.shortName);
    if (input.logoUrl !== undefined) t.setLogo(input.logoUrl);
    if (input.colors !== undefined) t.setColors(input.colors);
    await this.teams.save(t);
    return TeamDto.fromDomain(t);
  }
}

@Injectable()
export class DissolveTeamHandler
  implements CommandHandler<{ id: string }, TeamDto>
{
  constructor(@Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository) {}
  async execute(input: { id: string }): Promise<TeamDto> {
    const t = await this.teams.findById(TeamId.of(input.id));
    if (!t) throw new NotFoundError("Team", input.id);
    t.dissolve();
    await this.teams.save(t);
    return TeamDto.fromDomain(t);
  }
}
