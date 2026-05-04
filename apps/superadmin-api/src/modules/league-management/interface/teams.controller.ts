import {
  Body,
  Controller,
  Delete,
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
    return this.listH.execute({ ...q, leagueIdsFilter: scope.leagueIds ?? undefined });
  }
  @Get(":id") getOne(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType
  ): Promise<TeamDto> {
    return this.getH.execute({ id, leagueIdsFilter: scope.leagueIds ?? undefined });
  }
  @Post() create(@Body() body: CreateTeamBodyDto): Promise<TeamDto> {
    return this.createH.execute(body);
  }
  @Patch(":id") update(
    @Param("id") id: string,
    @Body() body: UpdateTeamBodyDto
  ): Promise<TeamDto> {
    return this.updateH.execute({ id, ...body });
  }
  @Delete(":id") dissolve(@Param("id") id: string): Promise<TeamDto> {
    return this.dissolveH.execute({ id });
  }
}
