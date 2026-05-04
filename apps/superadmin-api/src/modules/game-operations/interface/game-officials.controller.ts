import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthPrincipal } from "@sportspulse/auth";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
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

@ApiTags("game-operations/officials")
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class GameOfficialsController {
  constructor(
    private readonly listH: ListGameOfficialsHandler,
    private readonly forPersonH: ListPersonOfficialAssignmentsHandler,
    private readonly assignH: AssignGameOfficialHandler,
    private readonly statusH: UpdateOfficialStatusHandler,
    private readonly revokeH: RevokeGameOfficialHandler
  ) {}

  @Get("games/:gameId/officials")
  list(@Param("gameId") gameId: string): Promise<GameOfficialDto[]> {
    return this.listH.execute({ gameId });
  }

  @Get("game-officials/for-person/:personId")
  forPerson(@Param("personId") personId: string): Promise<GameOfficialDto[]> {
    return this.forPersonH.execute({ personId });
  }

  @Post("games/:gameId/officials")
  @ApiOperation({ summary: "Assign an official to a game" })
  assign(
    @Param("gameId") gameId: string,
    @Body() body: AssignGameOfficialBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<GameOfficialDto> {
    return this.assignH.execute({
      gameId,
      ...body,
      assignedByUserId: user.userId
    });
  }

  @Patch("game-officials/:id/status")
  status(
    @Param("id") id: string,
    @Body() body: UpdateOfficialStatusBodyDto
  ): Promise<GameOfficialDto> {
    return this.statusH.execute({ id, status: body.status });
  }

  @Delete("game-officials/:id")
  @ApiOperation({ summary: "Revoke an official assignment (soft revoke)" })
  revoke(@Param("id") id: string): Promise<GameOfficialDto> {
    return this.revokeH.execute({ id });
  }
}
