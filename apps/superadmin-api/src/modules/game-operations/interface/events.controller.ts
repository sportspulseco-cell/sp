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
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
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

@ApiTags("game-operations/events")
@ApiBearerAuth()
@Controller("game-events")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class EventsController {
  constructor(
    private readonly appendH: AppendEventHandler,
    private readonly listH: ListEventsHandler,
    private readonly forGameH: ListGameEventsHandler
  ) {}

  @Get() list(@Query() q: ListEventsQueryDto): Promise<GameEventPageDto> {
    return this.listH.execute(q);
  }

  @Get("for-game/:gameId")
  @ApiOperation({ summary: "Full ordered event log for a game" })
  forGame(@Param("gameId") gameId: string): Promise<GameEventDto[]> {
    return this.forGameH.execute({ gameId });
  }

  @Post() @ApiOperation({ summary: "Append a game event (idempotent if key supplied)" })
  append(
    @Body() body: AppendEventBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<GameEventDto> {
    return this.appendH.execute({ ...body, loggedByUserId: user.userId });
  }
}
