import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthPrincipal } from "@sportspulse/auth";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { GameDto, GamePageDto } from "../application/dtos/game.dto";
import {
  ApplyScoreHandler,
  CancelGameHandler,
  CreateGameHandler,
  FinalizeGameHandler,
  ForfeitGameHandler,
  GetGameHandler,
  ListGamesHandler,
  PostponeGameHandler,
  StartPlayHandler
} from "../application/games/handlers";
import {
  ApplyScoreBodyDto,
  CreateGameBodyDto,
  ForfeitGameBodyDto,
  ListGamesQueryDto
} from "./dto/game.dto";

@ApiTags("game-operations/games")
@ApiBearerAuth()
@Controller("games")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class GamesController {
  constructor(
    private readonly listH: ListGamesHandler,
    private readonly getH: GetGameHandler,
    private readonly createH: CreateGameHandler,
    private readonly startH: StartPlayHandler,
    private readonly scoreH: ApplyScoreHandler,
    private readonly postponeH: PostponeGameHandler,
    private readonly cancelH: CancelGameHandler,
    private readonly forfeitH: ForfeitGameHandler,
    private readonly finalizeH: FinalizeGameHandler
  ) {}

  @Get() list(
    @Query() q: ListGamesQueryDto,
    @UserScope() scope: UserScopeType
  ): Promise<GamePageDto> {
    // Same team-scope bypass as rosters/teams: when the query narrows
    // to a team the user holds directly, drop the league filter so
    // team_admin / coach / player sessions can read their own schedule.
    const inDirectTeamScope =
      q.teamId && (scope.teamIds?.includes(q.teamId) ?? false);
    return this.listH.execute({
      ...q,
      leagueIdsFilter: inDirectTeamScope ? undefined : (scope.leagueIds ?? undefined)
    });
  }
  @Get(":id") getOne(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType
  ): Promise<GameDto> {
    return this.getH.execute({ id, leagueIdsFilter: scope.leagueIds ?? undefined });
  }
  @Post() create(@Body() body: CreateGameBodyDto): Promise<GameDto> {
    return this.createH.execute(body);
  }
  @Post(":id/start") @ApiOperation({ summary: "Transition to in_play" })
  start(@Param("id") id: string): Promise<GameDto> {
    return this.startH.execute({ id });
  }
  @Post(":id/score") @ApiOperation({ summary: "Apply score / period (in_play only)" })
  score(
    @Param("id") id: string,
    @Body() body: ApplyScoreBodyDto
  ): Promise<GameDto> {
    return this.scoreH.execute({ id, ...body });
  }
  @Post(":id/postpone") postpone(@Param("id") id: string): Promise<GameDto> {
    return this.postponeH.execute({ id });
  }
  @Post(":id/cancel") cancel(@Param("id") id: string): Promise<GameDto> {
    return this.cancelH.execute({ id });
  }
  @Post(":id/forfeit") forfeit(
    @Param("id") id: string,
    @Body() body: ForfeitGameBodyDto
  ): Promise<GameDto> {
    return this.forfeitH.execute({ id, winningTeamId: body.winningTeamId });
  }
  @Post(":id/finalize")
  @ApiOperation({ summary: "Finalize the game (terminal completion)" })
  finalize(
    @Param("id") id: string,
    @CurrentUser() user: AuthPrincipal
  ): Promise<GameDto> {
    return this.finalizeH.execute({ id, userId: user.userId });
  }
}
