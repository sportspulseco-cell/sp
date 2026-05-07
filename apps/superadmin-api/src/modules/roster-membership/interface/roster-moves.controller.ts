import {
  Body,
  Controller,
  ForbiddenException,
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
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
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
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class RosterMovesController {
  constructor(
    private readonly listH: ListRosterMovesHandler,
    private readonly getH: GetRosterMoveHandler,
    private readonly addH: AddPlayerHandler,
    private readonly dropH: DropPlayerHandler,
    private readonly tradeH: TradePlayerHandler,
    private readonly callupH: CallUpPlayerHandler,
    private readonly senddownH: SendDownPlayerHandler
  ) {}

  @Get() @ApiOperation({ summary: "List roster moves (event log)" })
  list(@Query() q: ListMovesQueryDto): Promise<RosterMovePageDto> {
    return this.listH.execute(q);
  }
  @Get(":id") @ApiOperation({ summary: "Get a roster move" })
  getOne(@Param("id") id: string): Promise<RosterMoveDto> {
    return this.getH.execute({ id });
  }

  @Post("add")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Add player to team roster" })
  add(
    @Body() body: MoveBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ): Promise<RosterMoveDto> {
    assertCanWriteTeam(scope, body.teamId);
    return this.addH.execute({ ...body, createdByUserId: user.userId });
  }

  @Post("drop")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Drop player from team roster" })
  drop(
    @Body() body: MoveBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ): Promise<RosterMoveDto> {
    assertCanWriteTeam(scope, body.teamId);
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
}

function assertCanWriteTeam(scope: UserScopeType, teamId: string): void {
  // League/org/super admins always pass. Captains + team_admins pass
  // only when the move targets a team in their direct teamIds.
  const allowed =
    scope.isSuperAdmin ||
    scope.leagueIds === null ||
    (scope.teamIds?.includes(teamId) ?? false);
  if (!allowed) {
    throw new ForbiddenException("Cannot write roster moves for this team");
  }
}
