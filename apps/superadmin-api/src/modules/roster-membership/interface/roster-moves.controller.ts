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
import { ScopedAdminGuard } from "../../../shared/auth/guards/scoped-admin.guard";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { schema, type Database } from "@sportspulse/db";
import { and, eq, isNull } from "drizzle-orm";
import { accessForAnyScope, accessCan } from "../../../shared/auth/game-access";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import { ADMIN_SCOPE_ROLE_CODES, type UserScope as UserScopeType } from "../../../shared/auth/scope";
import { RosterMoveDto, RosterMovePageDto } from "../application/dtos/roster.dto";
import {
  AddPlayerHandler,
  CallUpPlayerHandler,
  DropPlayerHandler,
  GetRosterMoveHandler,
  ListRosterMovesHandler,
  SendDownPlayerHandler,
  TradePlayerHandler
} from "../application/moves/handlers";
import { ListMovesQueryDto, MoveBodyDto, TradeBodyDto } from "./dto/roster.dto";

@ApiTags("roster/moves")
@ApiBearerAuth()
@Controller("roster/moves")
// Captains use /captain/roster, which enforces locks, limits and consent.
// A projected player team scope must never authorize these admin commands.
@UseGuards(JwtAuthGuard, ScopedAdminGuard)
export class RosterMovesController {
  constructor(
    private readonly listH: ListRosterMovesHandler,
    private readonly getH: GetRosterMoveHandler,
    private readonly addH: AddPlayerHandler,
    private readonly dropH: DropPlayerHandler,
    private readonly tradeH: TradePlayerHandler,
    private readonly callupH: CallUpPlayerHandler,
    private readonly senddownH: SendDownPlayerHandler,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  @Get() @ApiOperation({ summary: "List roster moves (event log)" })
  list(
    @Query() q: ListMovesQueryDto,
    @UserScope() scope: UserScopeType
  ): Promise<RosterMovePageDto> {
    return this.listH.execute({
      ...q,
      leagueIdsFilter: scope.leagueIds ?? undefined,
      orgIdsFilter: scope.orgIds ?? undefined,
      teamIdsFilter: scope.teamIds ?? undefined
    });
  }
  @Get(":id") @ApiOperation({ summary: "Get a roster move" })
  getOne(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType
  ): Promise<RosterMoveDto> {
    return this.getH.execute({
      id,
      leagueIdsFilter: scope.leagueIds ?? undefined,
      orgIdsFilter: scope.orgIds ?? undefined,
      teamIdsFilter: scope.teamIds ?? undefined
    });
  }

  @Post("add")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Add player to team roster" })
  async add(
    @Body() body: MoveBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ): Promise<RosterMoveDto> {
    await this.requireRosterWrite(user.userId, body);
    return this.addH.execute({ ...body, createdByUserId: user.userId });
  }

  @Post("drop")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Drop player from team roster" })
  async drop(
    @Body() body: MoveBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ): Promise<RosterMoveDto> {
    await this.requireRosterWrite(user.userId, body);
    return this.dropH.execute({ ...body, createdByUserId: user.userId });
  }

  @Post("trade") @ApiOperation({ summary: "Trade player between two teams" })
  trade(
    @Body() body: TradeBodyDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    return this.tradeH.execute({ ...body, createdByUserId: user.userId });
  }

  @Post("call-up") @ApiOperation({ summary: "Call player up from affiliate" })
  callUp(
    @Body() body: MoveBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<RosterMoveDto> {
    return this.callupH.execute({ ...body, createdByUserId: user.userId });
  }

  @Post("send-down") @ApiOperation({ summary: "Send player down to affiliate" })
  sendDown(
    @Body() body: MoveBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<RosterMoveDto> {
    return this.senddownH.execute({ ...body, createdByUserId: user.userId });
  }
  private async requireRosterWrite(userId: string, body: MoveBodyDto) {
    const [season] = await this.db.select({ orgId: schema.seasons.orgId, leagueId: schema.seasons.leagueId })
      .from(schema.seasons).where(and(eq(schema.seasons.id, body.seasonId), isNull(schema.seasons.deletedAt))).limit(1);
    const [team] = await this.db.select({ orgId: schema.teams.orgId }).from(schema.teams)
      .where(and(eq(schema.teams.id, body.teamId), isNull(schema.teams.deletedAt))).limit(1);
    if (!season || !team || team.orgId !== season.orgId) throw new NotFoundException("Team or season not found.");
    const entries = await this.db.select({ id: schema.divisions.id }).from(schema.divisions)
      .innerJoin(schema.divisionTeamEntries, eq(schema.divisionTeamEntries.divisionId, schema.divisions.id))
      .where(and(eq(schema.divisions.seasonId, body.seasonId), eq(schema.divisionTeamEntries.teamId, body.teamId), isNull(schema.divisions.deletedAt)));
    const shapes = (entries.length ? entries : [{ id: null }]).map(d => ({ id: "", orgId: team.orgId,
      leagueId: season.leagueId, seasonId: body.seasonId, divisionId: d.id,
      homeTeamId: body.teamId, awayTeamId: body.teamId }));
    const access = await accessForAnyScope(this.db, userId, shapes, ADMIN_SCOPE_ROLE_CODES);
    if (!accessCan(access, "roster.write")) throw new ForbiddenException("You do not have permission to manage this roster.");
  }
}
