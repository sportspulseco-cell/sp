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
import type { AuthPrincipal } from "@sportspulse/auth";
import type { Database } from "@sportspulse/db";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import {
  gameAccessFor,
  gameVisible,
  requireGamePermission
} from "../../../shared/auth/game-access";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { loadAdminScope } from "../../../shared/auth/scope";
import { resolveEntityNames } from "../../../shared/display/entity-names";
import { schema } from "@sportspulse/db";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import {
  EJECTION_PENALTY_CLASSES,
  HOCKEY_INFRACTION_LABELS,
  HOCKEY_PENALTY_CLASS_LABELS,
  MISCONDUCT_PENALTY_CLASSES,
  penaltyClassOf
} from "@sportspulse/kernel";
import {
  GameEventDto,
  GameEventPageDto
} from "../application/dtos/game.dto";
import {
  AppendEventHandler,
  ListEventsHandler,
  ListGameEventsHandler
} from "../application/events/handlers";
import { AppendEventBodyDto, ListEventsQueryDto } from "./dto/game.dto";

/**
 * Game events. Was super-admin only, so a league admin's game page showed
 * an empty log and could not log events (SCH-12). Now: reads follow the
 * game's visibility, writes need `game_event.write` on the game.
 */
@ApiTags("game-operations/events")
@ApiBearerAuth()
@Controller("game-events")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class EventsController {
  constructor(
    private readonly appendH: AppendEventHandler,
    private readonly listH: ListEventsHandler,
    private readonly forGameH: ListGameEventsHandler,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  @Get() list(
    @Query() q: ListEventsQueryDto,
    @UserScope() scope: UserScopeType
  ): Promise<GameEventPageDto> {
    return this.listH.execute({
      ...q,
      leagueIdsFilter: scope.isSuperAdmin ? undefined : (scope.leagueIds ?? undefined)
    });
  }

  /**
   * Misconduct report (FR-3.5.4): every penalty of the season whose class is
   * misconduct, game misconduct or match penalty (the last two eject the
   * player), with the player, team, game and any suspension issued from it.
   * Admins only: the season's league must be in the caller's admin scope
   * (league, org, season admins); others get 404.
   */
  @Get("misconduct-report")
  @ApiOperation({ summary: "Misconduct, game misconduct and match penalties for a season" })
  async misconductReport(
    @Query("seasonId") seasonId: string,
    @CurrentUser() user: AuthPrincipal
  ) {
    if (!seasonId) throw new BadRequestException("Pick a season.");
    const [season] = await this.db
      .select({ id: schema.seasons.id, name: schema.seasons.name, leagueId: schema.seasons.leagueId, orgId: schema.seasons.orgId, tz: schema.seasons.timezone })
      .from(schema.seasons)
      .where(eq(schema.seasons.id, seasonId))
      .limit(1);
    const admin = await loadAdminScope(this.db, user.userId);
    const inScope =
      !!season &&
      (admin.isSuperAdmin ||
        admin.leagueIds === null ||
        admin.leagueIds.includes(season.leagueId) ||
        (admin.orgWideOrgIds ?? []).includes(season.orgId));
    if (!season || !inScope) throw new NotFoundException(`Season ${seasonId} not found`);

    const rows = await this.db
      .select({
        eventId: schema.gameEvents.id,
        gameId: schema.games.id,
        start: schema.games.scheduledStartTsUtc,
        tz: schema.games.tz,
        homeTeamId: schema.games.homeTeamId,
        awayTeamId: schema.games.awayTeamId,
        divisionId: schema.games.divisionId,
        period: schema.gameEvents.period,
        clock: schema.gameEvents.clockRemainingSec,
        teamId: schema.gameEvents.teamId,
        personId: schema.gameEvents.primaryPersonId,
        attributes: schema.gameEvents.attributes
      })
      .from(schema.gameEvents)
      .innerJoin(schema.games, eq(schema.games.id, schema.gameEvents.gameId))
      .leftJoin(schema.divisions, eq(schema.divisions.id, schema.games.divisionId))
      .where(
        and(
          eq(schema.gameEvents.eventType, "penalty"),
          or(eq(schema.games.seasonId, seasonId), eq(schema.divisions.seasonId, seasonId))
        )
      )
      .orderBy(asc(schema.games.scheduledStartTsUtc));
    const picked = rows
      .map((r) => ({ ...r, cls: penaltyClassOf(r.attributes as Record<string, unknown>) }))
      .filter((r) => r.cls && MISCONDUCT_PENALTY_CLASSES.includes(r.cls));
    const eventIds = picked.map((r) => r.eventId);
    const susp = eventIds.length
      ? await this.db
          .select({ id: schema.suspensions.id, sourceEventId: schema.suspensions.sourceEventId, status: schema.suspensions.status, kind: schema.suspensions.kind, nGames: schema.suspensions.nGames })
          .from(schema.suspensions)
          .where(inArray(schema.suspensions.sourceEventId, eventIds))
      : [];
    const names = await resolveEntityNames(this.db, [
      ...picked.map((r) => ({ type: "person" as const, id: r.personId ?? undefined })),
      ...picked.flatMap((r) => [
        { type: "team" as const, id: r.teamId ?? undefined },
        { type: "team" as const, id: r.homeTeamId },
        { type: "team" as const, id: r.awayTeamId }
      ]),
      ...picked.map((r) => ({ type: "division" as const, id: r.divisionId ?? undefined }))
    ]);
    const items = picked.map((r) => {
      const a = (r.attributes ?? {}) as Record<string, unknown>;
      const s = susp.find((x) => x.sourceEventId === r.eventId) ?? null;
      return {
        eventId: r.eventId,
        gameId: r.gameId,
        gameStartTsUtc: r.start.toISOString(),
        tz: r.tz,
        gameLabel: `${names.get(`team:${r.awayTeamId}`) ?? "Away"} at ${names.get(`team:${r.homeTeamId}`) ?? "Home"}`,
        divisionName: r.divisionId ? names.get(`division:${r.divisionId}`) ?? null : null,
        period: r.period,
        clockRemainingSec: r.clock,
        personId: r.personId,
        personName: r.personId ? names.get(`person:${r.personId}`) ?? null : null,
        teamId: r.teamId,
        teamName: r.teamId ? names.get(`team:${r.teamId}`) ?? null : null,
        infraction: typeof a.infraction === "string" ? a.infraction : null,
        infractionLabel: typeof a.infraction === "string" ? HOCKEY_INFRACTION_LABELS[a.infraction] ?? "Other" : null,
        minutes: typeof a.minutes === "number" ? a.minutes : null,
        penaltyClass: r.cls!,
        penaltyClassLabel: HOCKEY_PENALTY_CLASS_LABELS[r.cls!],
        ejection: EJECTION_PENALTY_CLASSES.includes(r.cls!),
        suspension: s ? { id: s.id, status: s.status, kind: s.kind, nGames: s.nGames } : null
      };
    });
    // Per-player count, most first.
    const byPlayer = new Map<string, { personId: string; personName: string | null; teamName: string | null; count: number; ejections: number }>();
    for (const i of items) {
      if (!i.personId) continue;
      const cur = byPlayer.get(i.personId) ?? { personId: i.personId, personName: i.personName, teamName: i.teamName, count: 0, ejections: 0 };
      cur.count++;
      if (i.ejection) cur.ejections++;
      byPlayer.set(i.personId, cur);
    }
    return {
      seasonId,
      seasonName: season.name,
      items,
      players: [...byPlayer.values()].sort((a, b) => b.count - a.count || b.ejections - a.ejections || (a.personName ?? "").localeCompare(b.personName ?? ""))
    };
  }

  @Get("for-game/:gameId")
  @ApiOperation({ summary: "Full ordered event log for a game" })
  async forGame(
    @Param("gameId") gameId: string,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<GameEventDto[]> {
    const access = await gameAccessFor(this.db, user.userId, gameId);
    if (!access || !gameVisible(access, scope)) {
      throw new NotFoundException(`Game not found: ${gameId}`);
    }
    return this.forGameH.execute({ gameId });
  }

  @Post()
  @AllowScopedWrite()
  @ApiOperation({ summary: "Append a game event (idempotent if key supplied)" })
  async append(
    @Body() body: AppendEventBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ): Promise<GameEventDto> {
    await requireGamePermission(
      this.db,
      user.userId,
      scope,
      body.gameId,
      "game_event.write",
      "log game events"
    );
    return this.appendH.execute({ ...body, loggedByUserId: user.userId });
  }
}
