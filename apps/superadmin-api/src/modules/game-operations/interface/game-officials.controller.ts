import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Logger,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { IsArray, ArrayMaxSize, IsDateString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { officialUnavailableAt } from "@sportspulse/kernel";
import { GAME_DAY_ROLE_CODES, GAME_OFFICIAL_ROLE_LABELS, type GameOfficialRoleCode } from "@sportspulse/kernel";
import { NotificationService } from "../../communications/application/notification.service";
import { gameNoticeContext, gameTimeLabel } from "../application/games/game-notifications";
import type { GameOfficialRow } from "../domain/repositories/game-official.repository";
import { activeRoleAssignment } from "../../../shared/auth/active-role";

const log = new Logger("GameOfficials");
class AvailabilityPeriod {
  @IsDateString() startTsUtc!:string;
  @IsDateString() endTsUtc!:string;
}
class AvailabilityBody {
  @IsArray() @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>AvailabilityPeriod) periods!:AvailabilityPeriod[];
}
import type { AuthPrincipal } from "@sportspulse/auth";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
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
import { personForAccountEmail } from "../../../shared/auth/person-by-email";
import { resolveEntityNames } from "../../../shared/display/entity-names";
import {
  AssignGameOfficialHandler,
  GameOfficialDto,
  ListGameOfficialsHandler,
  ListPersonOfficialAssignmentsHandler,
  RevokeGameOfficialHandler,
  UpdateOfficialStatusHandler
} from "../application/officials/handlers";
import {
  AssignGameOfficialBodyDto,
  UpdateOfficialStatusBodyDto
} from "./dto/game-official.dto";

/**
 * Game officials. Reads follow the game's visibility; assigning and
 * revoking need `game.assign_officials` on the game (league and org
 * admins: PPHL 7.1 "Assign refs"). Officials can read their own history,
 * maintain private availability and confirm or decline their own invitation.
 */
@ApiTags("game-operations/officials")
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class GameOfficialsController {
  constructor(
    private readonly listH: ListGameOfficialsHandler,
    private readonly forPersonH: ListPersonOfficialAssignmentsHandler,
    private readonly assignH: AssignGameOfficialHandler,
    private readonly statusH: UpdateOfficialStatusHandler,
    private readonly revokeH: RevokeGameOfficialHandler,
    private readonly notify: NotificationService,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  @Get("game-officials/availability/me")
  async availability(@CurrentUser() user:AuthPrincipal) {
    const [profile]=await this.db.select({metadata:schema.profiles.metadata}).from(schema.profiles).where(eq(schema.profiles.id,user.userId)).limit(1);
    const data=(profile?.metadata as {officialAvailability?:{periods?:AvailabilityPeriod[]}}|undefined)?.officialAvailability;
    return {periods:Array.isArray(data?.periods)?data.periods:[]};
  }
  @Post("game-officials/availability/me") @AllowScopedWrite()
  async saveAvailability(@Body() body:AvailabilityBody,@CurrentUser() user:AuthPrincipal) {
    if(body.periods.some(p=>!/(Z|[+-]\d{2}:\d{2})$/.test(p.startTsUtc) || !/(Z|[+-]\d{2}:\d{2})$/.test(p.endTsUtc) || Date.parse(p.startTsUtc)>=Date.parse(p.endTsUtc)))throw new BadRequestException("Unavailable periods need explicit time zones, with end after start.");
    const data={periods:body.periods.map(p=>({startTsUtc:new Date(p.startTsUtc).toISOString(),endTsUtc:new Date(p.endTsUtc).toISOString()}))};
    await this.db.update(schema.profiles).set({metadata:sql`jsonb_set(coalesce(${schema.profiles.metadata},'{}'::jsonb),'{officialAvailability}',${JSON.stringify(data)}::jsonb,true)`,updatedAt:new Date()}).where(eq(schema.profiles.id,user.userId));
    return data;
  }

  @Get("games/:gameId/officials")
  async list(
    @Param("gameId") gameId: string,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<Array<GameOfficialDto & { personName: string | null }>> {
    const access = await gameAccessFor(this.db, user.userId, gameId);
    if (!access || !gameVisible(access, scope)) {
      throw new NotFoundException(`Game not found: ${gameId}`);
    }
    const rows = await this.listH.execute({ gameId });
    // Names, so a crew member whose scope is this one game (no people
    // list) still sees who else is on the crew.
    const names = await resolveEntityNames(
      this.db,
      rows.map((r) => ({ type: "person" as const, id: r.personId }))
    );
    return rows.map((r) => ({ ...r, personName: names.get(`person:${r.personId}`) ?? null }));
  }

  /**
   * Who may be put on this game's crew (FR-3.9): people holding a referee
   * or scorekeeper role whose scope covers the game (platform, the org,
   * league, season or division). Each says whether they already run
   * another game at an overlapping time.
   */
  @Get("games/:gameId/official-candidates")
  async candidates(
    @Param("gameId") gameId: string,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ) {
    const access = await requireGamePermission(this.db, user.userId, scope, gameId, "game.assign_officials", "assign officials");
    const g = access.game;
    const rows = await this.db
      .select({ personId: schema.persons.id, roleCode: schema.roles.code, first: schema.persons.legalFirstName, last: schema.persons.legalLastName, preferred: schema.persons.preferredName })
      .from(schema.userRoleAssignments)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoleAssignments.roleId))
      .innerJoin(schema.persons, eq(schema.persons.userId, schema.userRoleAssignments.userId))
      .where(
        and(
          inArray(schema.roles.code, [...GAME_DAY_ROLE_CODES]),
          activeRoleAssignment(),
          isNull(schema.persons.deletedAt),
          or(
            eq(schema.userRoleAssignments.scopeType, "platform"),
            and(eq(schema.userRoleAssignments.scopeType, "game"), eq(schema.userRoleAssignments.scopeId, g.id)),
            and(eq(schema.userRoleAssignments.scopeType, "org"), eq(schema.userRoleAssignments.scopeId, g.orgId)),
            and(eq(schema.userRoleAssignments.scopeType, "league"), eq(schema.userRoleAssignments.scopeId, g.leagueId)),
            ...(g.seasonId ? [and(eq(schema.userRoleAssignments.scopeType, "season"), eq(schema.userRoleAssignments.scopeId, g.seasonId))] : []),
            ...(g.divisionId ? [and(eq(schema.userRoleAssignments.scopeType, "division"), eq(schema.userRoleAssignments.scopeId, g.divisionId))] : [])
          )
        )
      );
    const byPerson = new Map<string, { personId: string; name: string; roles: string[] }>();
    for (const r of rows) {
      const cur = byPerson.get(r.personId) ?? { personId: r.personId, name: r.preferred?.trim() || `${r.first} ${r.last}`.trim(), roles: [] };
      if (!cur.roles.includes(r.roleCode)) cur.roles.push(r.roleCode);
      byPerson.set(r.personId, cur);
    }
    const busy = await this.clashes(gameId, [...byPerson.keys()]);
    return [...byPerson.values()]
      .map((c) => ({ ...c, busyWith: busy.get(c.personId) ?? null }))
      .sort((a, b) => Number(!!a.busyWith) - Number(!!b.busyWith) || a.name.localeCompare(b.name));
  }

  /** Other live crew spots of these people on games overlapping this one. */
  private async clashes(gameId: string, personIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (personIds.length === 0) return out;
    const [game] = await this.db
      .select({ start: schema.games.scheduledStartTsUtc, duration: schema.games.durationMin })
      .from(schema.games)
      .where(eq(schema.games.id, gameId))
      .limit(1);
    if (!game) return out;
    const rows = await this.db.execute(sql`
      select o.person_id, g.id, g.scheduled_start_ts_utc, g.tz, g.home_team_id, g.away_team_id
        from game_officials o
        join games g on g.id = o.game_id
       where o.revoked_at is null and o.status <> 'declined'
         and o.person_id in (${sql.join(personIds.map((id) => sql`${id}::uuid`), sql`, `)})
         and g.id <> ${gameId}
         and g.status not in ('cancelled', 'postponed')
         and g.scheduled_start_ts_utc < ${game.start.toISOString()}::timestamptz + make_interval(mins => ${game.duration})
         and ${game.start.toISOString()}::timestamptz < g.scheduled_start_ts_utc + make_interval(mins => g.duration_min)`);
    const list = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<{
      person_id: string; scheduled_start_ts_utc: Date | string; tz: string; home_team_id: string; away_team_id: string;
    }>;
    const names = await resolveEntityNames(this.db, list.flatMap((r) => [{ type: "team" as const, id: r.home_team_id }, { type: "team" as const, id: r.away_team_id }]));
    for (const r of list) {
      if (out.has(r.person_id)) continue;
      out.set(
        r.person_id,
        `${names.get(`team:${r.away_team_id}`) ?? "Away"} at ${names.get(`team:${r.home_team_id}`) ?? "Home"}, ${gameTimeLabel(new Date(r.scheduled_start_ts_utc), r.tz)}`
      );
    }
    const unavailable=await this.db.select({personId:schema.persons.id,metadata:schema.profiles.metadata}).from(schema.persons)
      .innerJoin(schema.profiles,eq(schema.profiles.id,schema.persons.userId)).where(inArray(schema.persons.id,personIds));
    for(const p of unavailable)if(!out.has(p.personId) && officialUnavailableAt(p.metadata,game.start,game.duration))out.set(p.personId,"Unavailable during this game.");
    return out;
  }

  @Get("game-officials/for-person/:personId")
  async forPerson(
    @Param("personId") personId: string,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<GameOfficialDto[]> {
    if (!scope.isSuperAdmin) {
      const [own]=await this.db.select({id:schema.persons.id}).from(schema.persons).where(and(eq(schema.persons.id,personId),eq(schema.persons.userId,user.userId),isNull(schema.persons.deletedAt))).limit(1);
      if(!own)throw new NotFoundException("Official assignments not found.");
    }
    return this.forPersonH.execute({ personId });
  }

  @Post("games/:gameId/officials")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Assign an official to a game" })
  async assign(
    @Param("gameId") gameId: string,
    @Body() body: AssignGameOfficialBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ): Promise<GameOfficialDto> {
    const access = await requireGamePermission(
      this.db,
      user.userId,
      scope,
      gameId,
      "game.assign_officials",
      "assign officials"
    );
    const { force, email, personId: givenPersonId, ...rest } = body;
    if (!!email === !!givenPersonId) {
      throw new BadRequestException("Give either a person or an account email.");
    }
    let personId = givenPersonId ?? null;
    if (email) {
      // Permission on this game is checked above, before any lookup.
      // Exact email only; nothing is listed or suggested (privacy).
      const found = await personForAccountEmail(this.db, email, "game-officials.add-by-email");
      if (!found) {
        log.warn(`add-by-email: no account game=${gameId} by=${user.userId}`);
        throw new NotFoundException(
          "No account uses that email. Check the spelling, or ask them to sign up first, then try again."
        );
      }
      personId = found.personId;
      log.log(`add-by-email: game=${gameId} person=${personId} created=${found.created} by=${user.userId}`);
    }
    const assign = { ...rest, personId: personId! };
    // Clash check (FR-3.9): one person cannot run two games at once.
    if (assign.status !== "declined") {
      const busy = (await this.clashes(gameId, [assign.personId])).get(assign.personId);
      if (busy && !force) {
        throw new ConflictException(`This person is already on the crew of ${busy}. Pick someone else, or assign anyway.`);
      }
    }
    const row = await this.assignH.execute({
      gameId,
      ...assign,
      assignedByUserId: user.userId
    });
    // Tell the official (email when they have an address, else in-app).
    try {
      const [gr] = await this.db
        .select({ start: schema.games.scheduledStartTsUtc, tz: schema.games.tz, venue: schema.games.venueName, surface: schema.games.surfaceLabel })
        .from(schema.games)
        .where(eq(schema.games.id, gameId))
        .limit(1);
      const names = await gameNoticeContext(this.db, {
        id: gameId,
        leagueId: access.game.leagueId,
        seasonId: access.game.seasonId,
        homeTeamId: access.game.homeTeamId,
        awayTeamId: access.game.awayTeamId
      });
      const ctx = gr
        ? {
            payload: {
              homeTeam: names.homeTeam,
              awayTeam: names.awayTeam,
              whenLabel: gameTimeLabel(gr.start, gr.tz),
              venueClause: gr.venue ? ` at ${gr.venue}${gr.surface ? `, ${gr.surface}` : ""}` : ""
            }
          }
        : null;
      const [person] = await this.db
        .select({ email: schema.profiles.email })
        .from(schema.persons)
        .leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId))
        .where(eq(schema.persons.id, assign.personId))
        .limit(1);
      if (ctx && assign.status !== "declined") {
        await this.notify.queue({
          orgId: access.game.orgId,
          templateCode: "game.official_assigned",
          channel: person?.email ? "email" : "in_app",
          idempotencyKey: `game.official_assigned:${row.id}`,
          recipientPersonId: assign.personId,
          recipientEmail: person?.email ?? null,
          payload: {
            ...ctx.payload,
            roleLabel: GAME_OFFICIAL_ROLE_LABELS[assign.role as GameOfficialRoleCode] ?? "Official",
            gameId
          },
          sourceEvent: "game.official_assigned"
        });
      }
    } catch (e) {
      log.error(`official notice failed game=${gameId} person=${assign.personId}: ${(e as Error).message}`);
    }
    return row;
  }

  @Patch("game-officials/:id/status")
  @AllowScopedWrite()
  async status(
    @Param("id") id: string,
    @Body() body: UpdateOfficialStatusBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ): Promise<GameOfficialDto> {
    const [assignment]=await this.db.select({gameId:schema.gameOfficials.gameId,personId:schema.gameOfficials.personId,revokedAt:schema.gameOfficials.revokedAt,status:schema.gameOfficials.status,assignedByUserId:schema.gameOfficials.assignedByUserId})
      .from(schema.gameOfficials).where(eq(schema.gameOfficials.id,id)).limit(1);
    if(!assignment || assignment.revokedAt)throw new NotFoundException("Official assignment not found.");
    const [self]=await this.db.select({id:schema.persons.id}).from(schema.persons).where(and(eq(schema.persons.id,assignment.personId),eq(schema.persons.userId,user.userId),isNull(schema.persons.deletedAt))).limit(1);
    if(!self)await requireGamePermission(this.db,user.userId,scope,assignment.gameId,"game.assign_officials","change official responses");
    const { result, changed }=await this.db.transaction(async tx => {
      // Same lock order as game-day mutations: game before assignment.
      const [game]=await tx.select({status:schema.games.status}).from(schema.games)
        .where(eq(schema.games.id,assignment.gameId)).for("update");
      const [current]=await tx.select().from(schema.gameOfficials).where(eq(schema.gameOfficials.id,id)).for("update");
      if(!current || current.revokedAt || current.personId!==assignment.personId || current.gameId!==assignment.gameId)
        throw new ConflictException("This assignment changed. Reload before responding.");
      if(self) {
        if(!game || game.status!=="scheduled")throw new ConflictException("Responses can only change before the game starts.");
        if(body.status!=="confirmed" && body.status!=="declined")throw new BadRequestException("Confirm or decline your assignment.");
      }
      if(current.status===body.status)return {result:GameOfficialDto.fromRow(current as GameOfficialRow),changed:false};
      const [updated]=await tx.update(schema.gameOfficials).set({status:body.status,updatedAt:sql`now()`})
        .where(and(eq(schema.gameOfficials.id,id),isNull(schema.gameOfficials.revokedAt))).returning();
      if(!updated)throw new ConflictException("This assignment changed. Reload before responding.");
      return {result:GameOfficialDto.fromRow(updated as GameOfficialRow),changed:true};
    });
    if(self && assignment.assignedByUserId && changed){
      const [recipient]=await this.db.select({personId:schema.persons.id,email:schema.profiles.email}).from(schema.persons).innerJoin(schema.profiles,eq(schema.profiles.id,schema.persons.userId)).where(eq(schema.persons.userId,assignment.assignedByUserId)).limit(1);
      const [game]=await this.db.select({home:schema.games.homeTeamId,away:schema.games.awayTeamId,at:schema.games.scheduledStartTsUtc,tz:schema.games.tz}).from(schema.games).where(eq(schema.games.id,assignment.gameId)).limit(1);
      if(recipient && game){
        const names=await resolveEntityNames(this.db,[{type:"person",id:assignment.personId},{type:"team",id:game.home},{type:"team",id:game.away}]);
        await this.notify.queue({templateCode:"game.official_replied",channel:recipient.email?"email":"in_app",recipientPersonId:recipient.personId,recipientEmail:recipient.email,
          idempotencyKey:`official-reply:${id}:${result.status}:${result.updatedAt}`,
          payload:{officialName:names.get(`person:${assignment.personId}`) ?? "An official",status:result.status,homeTeam:names.get(`team:${game.home}`) ?? "Home",awayTeam:names.get(`team:${game.away}`) ?? "Away",whenLabel:gameTimeLabel(game.at,game.tz),gameId:assignment.gameId},sourceEvent:"game.official_replied"});
      }
    }
    return result;
  }

  @Delete("game-officials/:id")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Revoke an official assignment (soft revoke)" })
  async revoke(
    @Param("id") id: string,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ): Promise<GameOfficialDto> {
    const [row] = await this.db
      .select({ gameId: schema.gameOfficials.gameId })
      .from(schema.gameOfficials)
      .where(eq(schema.gameOfficials.id, id))
      .limit(1);
    if (!row) throw new NotFoundException(`Official assignment not found: ${id}`);
    await requireGamePermission(
      this.db,
      user.userId,
      scope,
      row.gameId,
      "game.assign_officials",
      "change officials"
    );
    return this.revokeH.execute({ id });
  }
}
