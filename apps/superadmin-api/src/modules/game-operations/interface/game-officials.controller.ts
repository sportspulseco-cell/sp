import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { eq } from "drizzle-orm";
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
 * admins: PPHL 7.1 "Assign refs"). Person-wide lists and the official's
 * own confirm/decline stay platform-admin only until a referee surface
 * exists (UC-30 not built).
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
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

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

  @Get("game-officials/for-person/:personId")
  forPerson(
    @Param("personId") personId: string,
    @UserScope() scope: UserScopeType
  ): Promise<GameOfficialDto[]> {
    if (!scope.isSuperAdmin) throw new ForbiddenException("Only a platform admin can list a person's assignments.");
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
    await requireGamePermission(
      this.db,
      user.userId,
      scope,
      gameId,
      "game.assign_officials",
      "assign officials"
    );
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
