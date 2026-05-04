import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import {
  TEAM_REPOSITORY,
  type TeamRepository
} from "../../league-management/domain/repositories/team.repository";
import { TeamId } from "../../league-management/domain/identifiers";
import { TeamMembershipPageDto } from "../application/dtos/roster.dto";
import {
  ListMembershipsHandler,
  RosterSnapshotHandler
} from "../application/rosters/handlers";
import {
  ListMembershipsQueryDto,
  RosterSnapshotQueryDto
} from "./dto/roster.dto";

@ApiTags("roster/memberships")
@ApiBearerAuth()
@Controller("roster")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class RostersController {
  constructor(
    private readonly listMembershipsH: ListMembershipsHandler,
    private readonly snapshotH: RosterSnapshotHandler,
    @Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository
  ) {}

  @Get("memberships")
  @ApiOperation({
    summary: "List team memberships (current state projection)"
  })
  list(
    @Query() q: ListMembershipsQueryDto,
    @UserScope() scope: UserScopeType
  ): Promise<TeamMembershipPageDto> {
    return this.listMembershipsH.execute({
      ...q,
      leagueIdsFilter: scope.leagueIds ?? undefined
    });
  }

  @Get("snapshot")
  @ApiOperation({
    summary: "Roster snapshot at a point in time (event-replay projection)"
  })
  async snapshot(
    @Query() q: RosterSnapshotQueryDto,
    @UserScope() scope: UserScopeType
  ) {
    if (scope.leagueIds) {
      const inScope = await this.teams.existsInLeagues(
        TeamId.of(q.teamId),
        scope.leagueIds
      );
      if (!inScope) throw new NotFoundException(`Team ${q.teamId} not found`);
    }
    return this.snapshotH.execute(q);
  }
}
