import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { TeamDto, TeamPageDto } from "../application/dtos/team.dto";
import {
  CreateTeamHandler,
  GetTeamHandler,
  ListTeamsHandler,
  UpdateTeamHandler,
  DissolveTeamHandler
} from "../application/teams/handlers";
import {
  CreateTeamBodyDto,
  ListTeamsQueryDto,
  UpdateTeamBodyDto
} from "./dto/team.dto";

@ApiTags("league-management/teams")
@ApiBearerAuth()
@Controller("league/teams")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class TeamsController {
  constructor(
    private readonly listH: ListTeamsHandler,
    private readonly getH: GetTeamHandler,
    private readonly createH: CreateTeamHandler,
    private readonly updateH: UpdateTeamHandler,
    private readonly dissolveH: DissolveTeamHandler
  ) {}

  @Get() list(
    @Query() q: ListTeamsQueryDto,
    @UserScope() scope: UserScopeType
  ): Promise<TeamPageDto> {
    // Team-scoped users have leagueIds=[] but their team is still in
    // direct scope — let them list it by skipping the league filter
    // when teamIds is the only signal.
    const filter =
      scope.leagueIds && scope.leagueIds.length === 0 && (scope.teamIds?.length ?? 0) > 0
        ? undefined
        : (scope.leagueIds ?? undefined);
    return this.listH.execute({ ...q, leagueIdsFilter: filter });
  }
  @Get(":id") getOne(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType
  ): Promise<TeamDto> {
    // If the team is in the user's direct team scope, bypass the
    // league-based filter — the assignment grants access by id.
    const inDirectTeamScope = scope.teamIds?.includes(id) ?? false;
    return this.getH.execute({
      id,
      leagueIdsFilter: inDirectTeamScope ? undefined : (scope.leagueIds ?? undefined)
    });
  }
  @Post() create(@Body() body: CreateTeamBodyDto): Promise<TeamDto> {
    return this.createH.execute(body);
  }
  @Patch(":id")
  @AllowScopedWrite()
  update(
    @Param("id") id: string,
    @Body() body: UpdateTeamBodyDto,
    @UserScope() scope: UserScopeType
  ): Promise<TeamDto> {
    // Team profile updates: league/org/super admins always pass.
    // Team-scoped users (team_admin, captain) pass only if the team
    // is in their direct teamIds — this is the dual-role hand-off
    // captains use to edit their own team's name, colors, logo.
    const allowed =
      scope.isSuperAdmin ||
      scope.leagueIds === null ||
      (scope.teamIds?.includes(id) ?? false);
    if (!allowed) throw new ForbiddenException("Cannot edit this team");
    return this.updateH.execute({ id, ...body });
  }
  @Delete(":id") dissolve(@Param("id") id: string): Promise<TeamDto> {
    // Dissolve stays super_admin-only — captains shouldn't blow
    // away their own team. AuthorizedAccessGuard already enforces
    // super_admin for non-bypass writes via the controller-level
    // guard, so no extra check needed here.
    return this.dissolveH.execute({ id });
  }
}
