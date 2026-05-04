import {
  Body,
  Controller,
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
import { LeagueDto, LeaguePageDto } from "../application/dtos/league.dto";
import {
  CreateLeagueHandler,
  GetLeagueHandler,
  ListLeaguesHandler,
  UpdateLeagueHandler,
  ChangeLeagueStatusHandler
} from "../application/leagues/handlers";
import {
  ChangeLeagueStatusBodyDto,
  CreateLeagueBodyDto,
  ListLeaguesQueryDto,
  UpdateLeagueBodyDto
} from "./dto/league.dto";

@ApiTags("league-management/leagues")
@ApiBearerAuth()
@Controller("league/leagues")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class LeaguesController {
  constructor(
    private readonly listH: ListLeaguesHandler,
    private readonly getH: GetLeagueHandler,
    private readonly createH: CreateLeagueHandler,
    private readonly updateH: UpdateLeagueHandler,
    private readonly statusH: ChangeLeagueStatusHandler
  ) {}

  @Get() @ApiOperation({ summary: "List leagues" })
  list(
    @Query() q: ListLeaguesQueryDto,
    @UserScope() scope: UserScopeType
  ): Promise<LeaguePageDto> {
    return this.listH.execute({ ...q, leagueIdsFilter: scope.leagueIds ?? undefined });
  }

  @Get(":id") @ApiOperation({ summary: "Get a league" })
  getOne(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType
  ): Promise<LeagueDto> {
    return this.getH.execute({ id, leagueIdsFilter: scope.leagueIds ?? undefined });
  }

  @Post() @ApiOperation({ summary: "Create a league" })
  create(@Body() body: CreateLeagueBodyDto): Promise<LeagueDto> {
    return this.createH.execute(body);
  }

  @Patch(":id") @ApiOperation({ summary: "Update a league" })
  update(
    @Param("id") id: string,
    @Body() body: UpdateLeagueBodyDto
  ): Promise<LeagueDto> {
    return this.updateH.execute({ id, ...body });
  }

  @Post(":id/status") @ApiOperation({ summary: "Change league status" })
  changeStatus(
    @Param("id") id: string,
    @Body() body: ChangeLeagueStatusBodyDto
  ): Promise<LeagueDto> {
    return this.statusH.execute({ id, status: body.status });
  }
}
