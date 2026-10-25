import {
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
import type { AuthPrincipal } from "@sportspulse/auth";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import {
  accessCan,
  accessForScope,
  gameAccessFor,
  gameVisible,
  requireGamePermission,
  userCanSeeDraftGamesAnywhere,
  viewerGamePermissions
} from "../../../shared/auth/game-access";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { resolveEntityNames } from "../../../shared/display/entity-names";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { eq, inArray } from "drizzle-orm";
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
  PreviewRescheduleHandler,
  PublishGameHandler,
  RescheduleGameHandler,
  StartPlayHandler
} from "../application/games/handlers";
import {
  ApplyScoreBodyDto,
  CreateGameBodyDto,
  FinalizeGameBodyDto,
  ForfeitGameBodyDto,
  ListGamesQueryDto,
  RescheduleGameBodyDto,
  ReschedulePreviewQueryDto
} from "./dto/game.dto";

/**
 * Games. Reads: any active role assignment (AuthorizedAccessGuard), rows
 * filtered here. Writes: super admin, or a scoped caller whose role
 * assignment covers the game and grants the permission
 * (shared/auth/game-access.ts, SCH-12). Out of scope = 404, in scope but
 * not allowed = 403 in plain words.
 */
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
    private readonly finalizeH: FinalizeGameHandler,
    private readonly publishH: PublishGameHandler,
    private readonly previewMoveH: PreviewRescheduleHandler,
    private readonly moveH: RescheduleGameHandler,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  /**
   * Add homeTeamName + awayTeamName so screens never print raw ids, and
   * fill `seasonId` from the division when the row has none (games
   * created before migration 0046, or by the New game dialog before it
   * required a division, SCH-5). Readers such as the captain lineup
   * editor need the game's season to show the right roster (SCH-23).
   */
  private async withNames<T extends GameDto>(games: T[]): Promise<T[]> {
    const [names, seasonByDivision] = await Promise.all([
      resolveEntityNames(this.db, [
        ...games.map((g) => ({ type: "team", id: g.homeTeamId })),
        ...games.map((g) => ({ type: "team", id: g.awayTeamId }))
      ]),
      this.seasonIdsByDivision(
        games
          .filter((g) => !g.seasonId && g.divisionId)
          .map((g) => g.divisionId as string)
      )
    ]);
    return games.map((g) => ({
      ...g,
      seasonId:
        g.seasonId ??
        (g.divisionId ? seasonByDivision.get(g.divisionId) ?? null : null),
      homeTeamName: names.get(`team:${g.homeTeamId}`) ?? null,
      awayTeamName: names.get(`team:${g.awayTeamId}`) ?? null
    }));
  }

  private async seasonIdsByDivision(
    divisionIds: string[]
  ): Promise<Map<string, string>> {
    const ids = [...new Set(divisionIds)];
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: schema.divisions.id, seasonId: schema.divisions.seasonId })
      .from(schema.divisions)
      .where(inArray(schema.divisions.id, ids));
    return new Map(rows.map((r) => [r.id, r.seasonId]));
  }

  private async one<T extends GameDto>(dto: T): Promise<T> {
    const [named] = await this.withNames([dto]);
    return named!;
  }

  @Get() async list(
    @Query() q: ListGamesQueryDto,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<GamePageDto> {
    // Same team-scope bypass as rosters/teams: when the query narrows
    // to a team the user holds directly, drop the league filter so
    // captain / coach / player sessions can read their own schedule.
    const inDirectTeamScope =
      q.teamId && (scope.teamIds?.includes(q.teamId) ?? false);
    // Drafts are for admins, officials and schedulers. Everyone else
    // (captains, players) only ever gets published games, whatever the
    // client asks for, so schedule, lineups, stats and the dashboard
    // all agree (SCH-7).
    const publishedOnly =
      q.publishedOnly === true ||
      !(scope.isSuperAdmin || (await userCanSeeDraftGamesAnywhere(this.db, user.userId)));
    const page = await this.listH.execute({
      ...q,
      publishedOnly,
      leagueIdsFilter: inDirectTeamScope ? undefined : (scope.leagueIds ?? undefined)
    });
    return { ...page, items: await this.withNames(page.items) };
  }

  @Get(":id") async getOne(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<GameDto> {
    // Visible when the league or either team is in scope (captains
    // never have leagues, BUG-029), or a role assignment covers the game
    // (season / game scoped officials). Unpublished games only for
    // callers who may see drafts. Otherwise 404, never 403.
    const access = await gameAccessFor(this.db, user.userId, id);
    if (!access || !gameVisible(access, scope)) {
      throw new NotFoundException(`Game not found: ${id}`);
    }
    const dto = await this.getH.execute({ id });
    return this.one({ ...dto, viewerPermissions: viewerGamePermissions(access) });
  }

  @Get(":id/reschedule-preview")
  @ApiOperation({
    summary:
      "Where and when the game would be after a move, and what it would clash with (rink double-booking, team double-booking). Writes nothing."
  })
  async previewMove(
    @Param("id") id: string,
    @Query() q: ReschedulePreviewQueryDto,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ) {
    await requireGamePermission(this.db, user.userId, scope, id, "game.reschedule", "move games");
    return this.previewMoveH.execute({
      id,
      startLocal: q.startLocal,
      surfaceId: q.surfaceId,
      userId: user.userId
    });
  }

  @Post()
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Create a hand-made game in a division at a rink (draft unless publish=true). Both teams must be entered in the division; a rink or team clash is refused (409) unless force=true with a reason."
  })
  async create(
    @Body() body: CreateGameBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<GameDto> {
    const [league] = await this.db
      .select({ orgId: schema.leagues.orgId })
      .from(schema.leagues)
      .where(eq(schema.leagues.id, body.leagueId))
      .limit(1);
    if (!league) throw new NotFoundException(`League not found: ${body.leagueId}`);
    // Scope from the stored division, never from the client: a season-
    // or division-scoped admin is covered by the division's own season.
    const [division] = await this.db
      .select({ seasonId: schema.divisions.seasonId })
      .from(schema.divisions)
      .where(eq(schema.divisions.id, body.divisionId))
      .limit(1);
    if (!division) throw new NotFoundException(`Division not found: ${body.divisionId}`);
    const access = await accessForScope(this.db, user.userId, {
      id: "",
      orgId: league.orgId,
      leagueId: body.leagueId,
      seasonId: division.seasonId,
      divisionId: body.divisionId,
      homeTeamId: body.homeTeamId,
      awayTeamId: body.awayTeamId
    });
    if (!access.superAdmin && !access.covered) {
      throw new NotFoundException(`League not found: ${body.leagueId}`);
    }
    if (!accessCan(access, "game.create")) {
      throw new ForbiddenException("Your role cannot create games in this league. Ask your league admin.");
    }
    if (body.publish && !accessCan(access, "game.publish")) {
      throw new ForbiddenException("Your role cannot publish games. Save it as a draft or ask your league admin.");
    }
    return this.one(await this.createH.execute({ ...body, userId: user.userId }));
  }

  @Post(":id/start")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Transition to in_play" })
  async start(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<GameDto> {
    await requireGamePermission(this.db, user.userId, scope, id, "game.start", "start games");
    return this.one(await this.startH.execute({ id }));
  }

  @Post(":id/score")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Apply score / period (in_play only)" })
  async score(
    @Param("id") id: string,
    @Body() body: ApplyScoreBodyDto,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<GameDto> {
    await requireGamePermission(this.db, user.userId, scope, id, "score.write", "change the score");
    return this.one(await this.scoreH.execute({ id, ...body }));
  }

  @Post(":id/postpone")
  @AllowScopedWrite()
  async postpone(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<GameDto> {
    await requireGamePermission(this.db, user.userId, scope, id, "game.postpone", "postpone games");
    return this.one(await this.postponeH.execute({ id }));
  }

  @Post(":id/cancel")
  @AllowScopedWrite()
  async cancel(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<GameDto> {
    await requireGamePermission(this.db, user.userId, scope, id, "game.cancel", "cancel games");
    return this.one(await this.cancelH.execute({ id }));
  }

  @Post(":id/forfeit")
  @AllowScopedWrite()
  async forfeit(
    @Param("id") id: string,
    @Body() body: ForfeitGameBodyDto,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<GameDto> {
    await requireGamePermission(this.db, user.userId, scope, id, "game.forfeit", "award forfeits");
    return this.one(await this.forfeitH.execute({ id, winningTeamId: body.winningTeamId }));
  }

  @Post(":id/finalize")
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Finalize the game: lock the result, rebuild its stat lines and the league standings in one transaction, then notify both teams"
  })
  async finalize(
    @Param("id") id: string,
    @Body() body: FinalizeGameBodyDto,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ) {
    await requireGamePermission(this.db, user.userId, scope, id, "game.finalize", "finalize games");
    return this.one(
      await this.finalizeH.execute({ id, userId: user.userId, endedIn: body.endedIn ?? null })
    );
  }

  @Post(":id/publish")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Show a hand-made game on team schedules and notify both teams" })
  async publish(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ) {
    await requireGamePermission(this.db, user.userId, scope, id, "game.publish", "publish games");
    return this.one(await this.publishH.execute({ id }));
  }

  @Post(":id/reschedule")
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Move a game's time and/or rink. Refuses clashes unless force=true with a reason; records the move and notifies both teams when published."
  })
  async reschedule(
    @Param("id") id: string,
    @Body() body: RescheduleGameBodyDto,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ) {
    await requireGamePermission(this.db, user.userId, scope, id, "game.reschedule", "move games");
    return this.one(
      await this.moveH.execute({
        id,
        startLocal: body.startLocal,
        surfaceId: body.surfaceId,
        force: body.force,
        reason: body.reason,
        userId: user.userId
      })
    );
  }
}
