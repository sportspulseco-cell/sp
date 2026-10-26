import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, eq, inArray, or } from "drizzle-orm";
import type { AuthPrincipal } from "@sportspulse/auth";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { resolveEntityNames } from "../../../shared/display/entity-names";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import {
  accessCan,
  accessForScope,
  gameAccessFor,
  gameVisible,
  requireGamePermission
} from "../../../shared/auth/game-access";
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

  /** Add person, team and season names so screens never print raw ids. */
  private async withNames<
    T extends { personId?: string; teamId?: string; seasonId?: string | null }
  >(
    rows: T[]
  ): Promise<
    Array<T & { personName?: string | null; teamName?: string | null; seasonName?: string | null }>
  > {
    const names = await resolveEntityNames(this.db, [
      ...rows.map((r) => ({ type: "person", id: r.personId })),
      ...rows.map((r) => ({ type: "team", id: r.teamId })),
      ...rows.map((r) => ({ type: "season", id: r.seasonId }))
    ]);
    return rows.map((r) => ({
      ...r,
      ...(r.personId !== undefined
        ? { personName: names.get(`person:${r.personId}`) ?? null }
        : {}),
      ...(r.seasonId !== undefined
        ? { seasonName: r.seasonId ? names.get(`season:${r.seasonId}`) ?? null : null }
        : {}),
      ...(r.teamId !== undefined
        ? { teamName: names.get(`team:${r.teamId}`) ?? null }
        : {})
    }));
  }

  // ---------- Stat lines ----------
  @Get("lines") @ApiOperation({ summary: "List per-(game, person) stat lines" })
  async listLines(@Query() q: ListStatLinesQueryDto): Promise<StatLinePageDto> {
    const page = await this.listLinesH.execute(q);
    return { ...page, items: await this.withNames(page.items) };
  }
  @Get("lines/for-game/:gameId")
  async forGame(
    @Param("gameId") gameId: string,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<StatLineDto[]> {
    // Same visibility as the game itself (shared/auth/game-access): league
    // or team in scope, or a role or crew spot covering the game, so the
    // scorekeeper of one game sees its stat lines. 404 on miss (no leak).
    const access = await gameAccessFor(this.db, user.userId, gameId);
    if (!access || !gameVisible(access, scope)) {
      throw new NotFoundException(`Game not found: ${gameId}`);
    }
    return this.withNames(await this.forGameH.execute({ gameId }));
  }

  /**
   * Captains and players hold teams, not leagues (BUG-029). A team that is
   * entered in one of the league's divisions, or plays a game in it, may
   * read that league's standings (SCH-24).
   */
  private async teamsPlayInLeague(teamIds: string[], leagueId: string): Promise<boolean> {
    if (teamIds.length === 0) return false;
    const [entry] = await this.db
      .select({ id: schema.divisionTeamEntries.id })
      .from(schema.divisionTeamEntries)
      .innerJoin(schema.divisions, eq(schema.divisions.id, schema.divisionTeamEntries.divisionId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
      .where(
        and(
          inArray(schema.divisionTeamEntries.teamId, teamIds),
          eq(schema.seasons.leagueId, leagueId)
        )
      )
      .limit(1);
    if (entry) return true;
    const [game] = await this.db
      .select({ id: schema.games.id })
      .from(schema.games)
      .where(
        and(
          eq(schema.games.leagueId, leagueId),
          or(inArray(schema.games.homeTeamId, teamIds), inArray(schema.games.awayTeamId, teamIds))
        )
      )
      .limit(1);
    return !!game;
  }

  // ---------- Projection ----------
  // Finalize runs both projections itself (SCH-17); these are the manual
  // fallbacks, open to anyone with stats.recompute on the game or league.
  @Post("games/:gameId/project")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Re-project stat lines from a game's events" })
  async project(
    @Param("gameId") gameId: string,
    @Body() body: ProjectStatsBodyDto,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ) {
    await requireGamePermission(this.db, user.userId, scope, gameId, "stats.recompute", "rebuild stats");
    return this.projectH.execute({
      gameId,
      allowInProgress: body.allowInProgress
    });
  }

  // ---------- Standings ----------
  @Get("standings/:leagueId")
  @ApiOperation({ summary: "Read standings for a league (optionally a division)" })
  async standings(
    @Param("leagueId") leagueId: string,
    @Query() q: ListStandingsQueryDto,
    @UserScope() scope: UserScopeType
  ): Promise<StandingDto[]> {
    if (
      scope.leagueIds &&
      !scope.leagueIds.includes(leagueId) &&
      !(await this.teamsPlayInLeague(scope.teamIds ?? [], leagueId))
    ) {
      throw new NotFoundException(`League ${leagueId} not found`);
    }
    return this.withNames(
      await this.listStandingsH.execute({
        leagueId,
        divisionId: q.divisionId
      })
    );
  }
  @Post("standings/:leagueId/recompute")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Recompute standings from completed games" })
  async recompute(
    @Param("leagueId") leagueId: string,
    @Body() body: RecomputeStandingsBodyDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    const [league] = await this.db
      .select({ orgId: schema.leagues.orgId })
      .from(schema.leagues)
      .where(eq(schema.leagues.id, leagueId))
      .limit(1);
    if (!league) throw new NotFoundException(`League ${leagueId} not found`);
    const access = await accessForScope(this.db, user.userId, {
      id: "",
      orgId: league.orgId,
      leagueId,
      seasonId: null,
      divisionId: null,
      homeTeamId: "",
      awayTeamId: ""
    });
    if (!access.superAdmin && !access.covered) throw new NotFoundException(`League ${leagueId} not found`);
    if (!accessCan(access, "stats.recompute")) {
      throw new ForbiddenException("Your role cannot recompute standings. Ask your league admin.");
    }
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
  async leaderboard(@Body() body: BuildLeaderboardBodyDto): Promise<LeaderboardDto> {
    const board = await this.leaderboardH.execute(body);
    return { ...board, entries: await this.withNames(board.entries) };
  }
}
