import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import {
  LeaderboardDto,
  StandingDto,
  StatLineDto,
  StatLinePageDto
} from "../application/dtos/stats.dto";
import { ProjectStatsHandler } from "../application/handlers/project-stats.handler";
import { RecomputeStandingsHandler } from "../application/handlers/recompute-standings.handler";
import {
  BuildLeaderboardHandler,
  ListLinesForGameHandler,
  ListStandingsHandler,
  ListStatLinesHandler,
  TeamStandingHandler
} from "../application/handlers/queries";
import {
  BuildLeaderboardBodyDto,
  ListStandingsQueryDto,
  ListStatLinesQueryDto,
  ProjectStatsBodyDto,
  RecomputeStandingsBodyDto
} from "./dto/stats.dto";

@ApiTags("stats")
@ApiBearerAuth()
@Controller("stats")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class StatsController {
  constructor(
    private readonly listLinesH: ListStatLinesHandler,
    private readonly forGameH: ListLinesForGameHandler,
    private readonly projectH: ProjectStatsHandler,
    private readonly recomputeH: RecomputeStandingsHandler,
    private readonly listStandingsH: ListStandingsHandler,
    private readonly leaderboardH: BuildLeaderboardHandler,
    private readonly teamStandingH: TeamStandingHandler,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  // ---------- Stat lines ----------
  @Get("lines") @ApiOperation({ summary: "List per-(game, person) stat lines" })
  listLines(@Query() q: ListStatLinesQueryDto): Promise<StatLinePageDto> {
    return this.listLinesH.execute(q);
  }
  @Get("lines/for-game/:gameId")
  async forGame(
    @Param("gameId") gameId: string,
    @UserScope() scope: UserScopeType
  ): Promise<StatLineDto[]> {
    // Verify the caller can see this game before returning stats.
    // 404 (not 403) on miss — no-leak rule. Mirrors games.controller's
    // getOne scope check (league OR either-team match).
    if (!scope.isSuperAdmin) {
      const [game] = await this.db
        .select({
          leagueId: schema.games.leagueId,
          homeTeamId: schema.games.homeTeamId,
          awayTeamId: schema.games.awayTeamId
        })
        .from(schema.games)
        .where(eq(schema.games.id, gameId))
        .limit(1);
      if (!game) throw new NotFoundException(`Game not found: ${gameId}`);
      const inLeagueScope =
        scope.leagueIds === null || scope.leagueIds.includes(game.leagueId);
      const onEitherTeam =
        !!scope.teamIds &&
        (scope.teamIds.includes(game.homeTeamId) ||
          scope.teamIds.includes(game.awayTeamId));
      if (!inLeagueScope && !onEitherTeam) {
        throw new NotFoundException(`Game not found: ${gameId}`);
      }
    }
    return this.forGameH.execute({ gameId });
  }

  // ---------- Projection ----------
  @Post("games/:gameId/project")
  @ApiOperation({ summary: "Re-project stat lines from a game's events" })
  project(
    @Param("gameId") gameId: string,
    @Body() body: ProjectStatsBodyDto
  ) {
    return this.projectH.execute({
      gameId,
      allowInProgress: body.allowInProgress
    });
  }

  // ---------- Standings ----------
  @Get("standings/:leagueId")
  @ApiOperation({ summary: "Read standings for a league (optionally a division)" })
  standings(
    @Param("leagueId") leagueId: string,
    @Query() q: ListStandingsQueryDto,
    @UserScope() scope: UserScopeType
  ): Promise<StandingDto[]> {
    if (scope.leagueIds && !scope.leagueIds.includes(leagueId)) {
      throw new NotFoundException(`League ${leagueId} not found`);
    }
    return this.listStandingsH.execute({
      leagueId,
      divisionId: q.divisionId
    });
  }
  @Post("standings/:leagueId/recompute")
  @ApiOperation({ summary: "Recompute standings from completed games" })
  recompute(
    @Param("leagueId") leagueId: string,
    @Body() body: RecomputeStandingsBodyDto
  ) {
    return this.recomputeH.execute({ leagueId, ...body });
  }

  // ---------- Team standings row (Workflow 7C dashboard helper) ----------
  @Get("team/:teamId")
  @ApiOperation({
    summary:
      "Returns one team's standings row plus rank within the supplied league/division. Used by the captain dashboard's off-season + in-season metric cards."
  })
  teamStanding(
    @Param("teamId") teamId: string,
    @Query("leagueId") leagueId: string,
    @Query("divisionId") divisionId?: string
  ) {
    // Require leagueId at the boundary so a missing query doesn't
    // crash the downstream JOIN as a 500 (BUG-032). Returns a clean
    // 400 with the param name the caller forgot.
    if (!leagueId) {
      throw new BadRequestException("leagueId query parameter is required");
    }
    return this.teamStandingH.execute({ teamId, leagueId, divisionId });
  }

  // ---------- Leaderboards ----------
  @Post("leaderboards") @ApiOperation({ summary: "Build / refresh a leaderboard" })
  leaderboard(@Body() body: BuildLeaderboardBodyDto): Promise<LeaderboardDto> {
    return this.leaderboardH.execute(body);
  }
}
