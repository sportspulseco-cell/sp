import {
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
