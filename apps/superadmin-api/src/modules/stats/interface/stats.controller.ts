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
import { and, eq, inArray, or, sql } from "drizzle-orm";
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
import { withEnteredTeams } from "@sportspulse/kernel";
import { enteredTeams } from "../application/entered-teams";
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

  // ---------- Season leaders + standings (FR-3.5.3) ----------
  /**
   * Points, goals and assists leaders per division for one season, with
   * each division's team standings. Computed on read from the stat lines
   * of finalized (completed or forfeited) games of that season only.
   * Visible to anyone whose league scope covers the season, or whose team
   * is entered in one of its divisions (captains, players); 404 otherwise.
   */
  @Get("seasons/:seasonId/leaders")
  @ApiOperation({ summary: "Season leaders (points, goals, assists) and standings per division" })
  async seasonLeaders(
    @Param("seasonId") seasonId: string,
    @Query("divisionId") divisionId: string | undefined,
    @Query("limit") limitRaw: string | undefined,
    @UserScope() scope: UserScopeType
  ) {
    const [season] = await this.db
      .select({ id: schema.seasons.id, name: schema.seasons.name, leagueId: schema.seasons.leagueId })
      .from(schema.seasons)
      .where(eq(schema.seasons.id, seasonId))
      .limit(1);
    if (!season) throw new NotFoundException(`Season ${seasonId} not found`);
    const divisions = await this.db
      .select({ id: schema.divisions.id, name: schema.divisions.name })
      .from(schema.divisions)
      .where(eq(schema.divisions.seasonId, seasonId));
    const divisionIds = divisions.map((d) => d.id).filter((id) => !divisionId || id === divisionId);
    if (divisionId && divisionIds.length === 0) throw new NotFoundException(`Division ${divisionId} not found`);
    const inLeague = scope.isSuperAdmin || scope.leagueIds === null || scope.leagueIds.includes(season.leagueId);
    if (!inLeague) {
      const myTeams = scope.teamIds ?? [];
      const entered = myTeams.length && divisionIds.length
        ? await this.db
            .select({ id: schema.divisionTeamEntries.id })
            .from(schema.divisionTeamEntries)
            .where(and(inArray(schema.divisionTeamEntries.divisionId, divisionIds), inArray(schema.divisionTeamEntries.teamId, myTeams)))
            .limit(1)
        : [];
      if (entered.length === 0) throw new NotFoundException(`Season ${seasonId} not found`);
    }
    const limit = Math.min(Math.max(Number(limitRaw ?? 10) || 10, 1), 50);
    if (divisionIds.length === 0) return { seasonId, seasonName: season.name, divisions: [] };

    const totals = (await this.db.execute(sql`
      select sl.division_id, sl.person_id,
             (array_agg(sl.team_id order by g.scheduled_start_ts_utc desc))[1] as team_id,
             count(distinct sl.game_id)::int as gp,
             coalesce(sum((sl.core->>'goals')::int), 0)::int as goals,
             coalesce(sum((sl.core->>'assists')::int), 0)::int as assists,
             coalesce(sum((sl.core->>'points')::int), 0)::int as points
        from stat_lines sl
        join games g on g.id = sl.game_id
       where sl.season_id = ${seasonId}
         and g.status in ('completed', 'forfeited')
         and sl.division_id in (${sql.join(divisionIds.map((id) => sql`${id}::uuid`), sql`, `)})
       group by sl.division_id, sl.person_id`)) as unknown;
    const rows = (Array.isArray(totals) ? totals : (totals as { rows?: unknown[] }).rows ?? []) as Array<{
      division_id: string; person_id: string; team_id: string; gp: number; goals: number; assists: number; points: number;
    }>;
    const stored = await this.db
      .select()
      .from(schema.standings)
      .where(inArray(schema.standings.divisionId, divisionIds));
    // Every entered team from day one, at zero until it plays (F-4).
    const standings = withEnteredTeams(
      stored.map((s) => ({
        divisionId: s.divisionId, teamId: s.teamId, rank: s.rank,
        gp: s.gp, w: s.w, l: s.l, t: s.t, otl: s.otl, points: s.points, gf: s.gf, ga: s.ga, gd: s.gd
      })),
      await enteredTeams(this.db, { divisionIds }),
      (t, rank) => ({
        divisionId: t.divisionId, teamId: t.teamId, rank,
        gp: 0, w: 0, l: 0, t: 0, otl: 0, points: 0, gf: 0, ga: 0, gd: 0
      })
    );
    const names = await resolveEntityNames(this.db, [
      ...rows.map((r) => ({ type: "person" as const, id: r.person_id })),
      ...rows.map((r) => ({ type: "team" as const, id: r.team_id })),
      ...standings.map((r) => ({ type: "team" as const, id: r.teamId }))
    ]);
    const entry = (r: (typeof rows)[number]) => ({
      personId: r.person_id,
      personName: names.get(`person:${r.person_id}`) ?? null,
      teamId: r.team_id,
      teamName: names.get(`team:${r.team_id}`) ?? null,
      gp: r.gp,
      goals: r.goals,
      assists: r.assists,
      points: r.points
    });
    const top = (list: typeof rows, key: "points" | "goals" | "assists") =>
      list
        .filter((r) => r[key] > 0)
        .sort((a, b) => b[key] - a[key] || a.gp - b.gp || (names.get(`person:${a.person_id}`) ?? "").localeCompare(names.get(`person:${b.person_id}`) ?? ""))
        .slice(0, limit)
        .map(entry);
    return {
      seasonId,
      seasonName: season.name,
      divisions: divisions
        .filter((d) => divisionIds.includes(d.id))
        .map((d) => {
          const mine = rows.filter((r) => r.division_id === d.id);
          return {
            divisionId: d.id,
            divisionName: d.name,
            leaders: { points: top(mine, "points"), goals: top(mine, "goals"), assists: top(mine, "assists") },
            standings: standings
              .filter((s) => s.divisionId === d.id)
              .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
              .map((s) => ({
                teamId: s.teamId,
                teamName: names.get(`team:${s.teamId}`) ?? null,
                rank: s.rank,
                gp: s.gp, w: s.w, l: s.l, t: s.t, otl: s.otl,
                points: s.points, gf: s.gf, ga: s.ga, gd: s.gd
              }))
          };
        })
    };
  }

  // ---------- Leaderboards ----------
  @Post("leaderboards") @ApiOperation({ summary: "Build / refresh a leaderboard" })
  async leaderboard(@Body() body: BuildLeaderboardBodyDto): Promise<LeaderboardDto> {
    const board = await this.leaderboardH.execute(body);
    return { ...board, entries: await this.withNames(board.entries) };
  }
}
