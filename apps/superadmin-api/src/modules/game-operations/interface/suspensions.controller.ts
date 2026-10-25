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
import { eq } from "drizzle-orm";
import type { AuthPrincipal } from "@sportspulse/auth";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { ScopedAdminGuard } from "../../../shared/auth/guards/scoped-admin.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { personVisible, visiblePersonIds } from "../../../shared/auth/visibility";
import {
  accessCan,
  gameAccessFor,
  gameVisible,
  requireGamePermission
} from "../../../shared/auth/game-access";
import { personPermissions, requirePersonPermission } from "../../../shared/auth/person-access";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import {
  SuspensionDto,
  SuspensionPageDto
} from "../application/dtos/game.dto";
import {
  IssueSuspensionHandler,
  ChangeSuspensionGamesHandler,
  LiftSuspensionHandler,
  ListSuspensionsHandler,
  ServeSuspensionHandler
} from "../application/suspensions/handlers";
import {
  IssueSuspensionBodyDto,
  ChangeSuspensionGamesBodyDto,
  LiftSuspensionBodyDto,
  ListSuspensionsQueryDto
} from "./dto/game.dto";

const DISCIPLINE_PERMISSIONS = ["suspension.issue", "suspension.lift"] as const;

/**
 * Game suspensions (UC-14, COMP-10). Admin console only
 * (ScopedAdminGuard): super admin everywhere; org / league admins (and
 * any role granting `suspension.*`) for players and games inside their
 * scope. A player or game outside the caller's scope is a 404; inside
 * it without the permission, a 403 in plain words.
 *
 * Scope of a suspension today = the source game (from a penalty) or the
 * teams the player has been rostered on. There is no league / season
 * column yet; see the migration note in the COMP-10 report.
 */
@ApiTags("game-operations/suspensions")
@ApiBearerAuth()
@Controller("suspensions")
@UseGuards(JwtAuthGuard, ScopedAdminGuard)
export class SuspensionsController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly listH: ListSuspensionsHandler,
    private readonly issueH: IssueSuspensionHandler,
    private readonly liftH: LiftSuspensionHandler,
    private readonly changeH: ChangeSuspensionGamesHandler,
    private readonly serveH: ServeSuspensionHandler
  ) {}

  @Get()
  @ApiOperation({ summary: "Suspensions the caller may see, newest first. Filter by person or by the game of the penalty." })
  async list(
    @Query() q: ListSuspensionsQueryDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ): Promise<SuspensionPageDto> {
    let viewerPermissions: string[] | undefined;
    if (q.personId) {
      if (!(await personVisible(this.db, { scope, userId: user.userId }, q.personId))) {
        throw new NotFoundException(`Person not found: ${q.personId}`);
      }
      viewerPermissions = await personPermissions(this.db, user.userId, q.personId, DISCIPLINE_PERMISSIONS);
    }
    if (q.gameId) {
      const access = await gameAccessFor(this.db, user.userId, q.gameId);
      if (!access || !gameVisible(access, scope)) {
        throw new NotFoundException(`Game not found: ${q.gameId}`);
      }
      viewerPermissions = DISCIPLINE_PERMISSIONS.filter((p) => accessCan(access, p));
    }
    const page = await this.listH.execute({
      ...q,
      visiblePersonIds: visiblePersonIds({ scope, userId: user.userId })
    });
    return viewerPermissions ? { ...page, viewerPermissions } : page;
  }

  @Post()
  @AllowScopedWrite()
  @ApiOperation({ summary: "Issue a suspension: games count, until a date, or until lifted. From a penalty when sourceEventId is set." })
  async issue(
    @Body() body: IssueSuspensionBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ): Promise<SuspensionDto> {
    if (body.sourceEventId) {
      const gameId = await this.gameOfEvent(body.sourceEventId);
      await requireGamePermission(this.db, user.userId, scope, gameId, "suspension.issue", "issue a suspension");
    } else {
      await requirePersonPermission(this.db, user.userId, scope, body.personId, "suspension.issue", "issue a suspension");
    }
    return this.issueH.execute({ ...body, issuedByUserId: user.userId });
  }

  @Post(":id/lift")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Lift a standing suspension. Reason required." })
  async lift(
    @Param("id") id: string,
    @Body() body: LiftSuspensionBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ): Promise<SuspensionDto> {
    await this.requireOnSuspension(id, user.userId, scope, "suspension.lift", "lift a suspension");
    return this.liftH.execute({ id, reason: body.reason, byUserId: user.userId });
  }

  @Post(":id/games")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Reduce or extend a standing suspension to a number of games (UC-14). Reason required." })
  async changeGames(
    @Param("id") id: string,
    @Body() body: ChangeSuspensionGamesBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ): Promise<SuspensionDto> {
    await this.requireOnSuspension(id, user.userId, scope, "suspension.lift", "change a suspension");
    return this.changeH.execute({ id, nGames: body.nGames, reason: body.reason, byUserId: user.userId });
  }

  @Post(":id/serve")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Manual correction: count one game served (finalized games count automatically)." })
  async serve(
    @Param("id") id: string,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ): Promise<SuspensionDto> {
    await this.requireOnSuspension(id, user.userId, scope, "suspension.lift", "change a suspension");
    return this.serveH.execute({ id, byUserId: user.userId });
  }

  private async gameOfEvent(eventId: string): Promise<string> {
    const [ev] = await this.db
      .select({ gameId: schema.gameEvents.gameId })
      .from(schema.gameEvents)
      .where(eq(schema.gameEvents.id, eventId))
      .limit(1);
    if (!ev) throw new NotFoundException(`Penalty not found: ${eventId}`);
    return ev.gameId;
  }

  /**
   * 404 unless the caller can see the player; then allowed when the
   * caller holds `permission` over the penalty's game or over one of
   * the player's teams.
   */
  private async requireOnSuspension(
    id: string,
    userId: string,
    scope: UserScopeType,
    permission: string,
    action: string
  ): Promise<void> {
    const [row] = await this.db
      .select({ personId: schema.suspensions.personId, sourceEventId: schema.suspensions.sourceEventId })
      .from(schema.suspensions)
      .where(eq(schema.suspensions.id, id))
      .limit(1);
    if (!row || !(await personVisible(this.db, { scope, userId }, row.personId))) {
      throw new NotFoundException(`Suspension not found: ${id}`);
    }
    if (row.sourceEventId) {
      const [ev] = await this.db
        .select({ gameId: schema.gameEvents.gameId })
        .from(schema.gameEvents)
        .where(eq(schema.gameEvents.id, row.sourceEventId))
        .limit(1);
      const access = ev ? await gameAccessFor(this.db, userId, ev.gameId) : null;
      if (access && gameVisible(access, scope) && accessCan(access, permission)) return;
    }
    const [held] = await personPermissions(this.db, userId, row.personId, [permission]);
    if (!held) throw new ForbiddenException(`Your role cannot ${action} for this player. Ask your league admin.`);
  }
}
