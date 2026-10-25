import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { eq } from "drizzle-orm";
import type { AuthPrincipal } from "@sportspulse/auth";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import { loadAdminScope, type UserScope as UserScopeType } from "../../../shared/auth/scope";
import { userIsPeopleAdmin } from "../../../shared/auth/org-admin";
import { seasonVisible } from "../../../shared/auth/visibility";
import { TeamMovementService, type MovementResult } from "../application/team-movement.service";

class MoveBaseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

class PlaceBodyDto extends MoveBaseDto {
  @ApiProperty() @IsUUID() divisionId!: string;
}

class RolloverBodyDto extends MoveBaseDto {
  @ApiProperty() @IsUUID() targetDivisionId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sourceEntryId?: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() copyRoster?: boolean;
}

class DivisionShiftBodyDto extends MoveBaseDto {
  @ApiProperty() @IsUUID() entryId!: string;
  @ApiProperty() @IsUUID() targetDivisionId!: string;
  @ApiProperty({ description: "true: start 0-0-0 in the new division; false: carry played games over" })
  @IsBoolean()
  resetStandings!: boolean;
}

class LeagueMigrationBodyDto extends MoveBaseDto {
  @ApiProperty() @IsUUID() entryId!: string;
  @ApiProperty() @IsUUID() targetDivisionId!: string;
}

class OrgMoveBodyDto extends MoveBaseDto {
  @ApiProperty() @IsUUID() targetOrgId!: string;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() force?: boolean;
}

/**
 * Team movement (PPHL item 8). Routes hang off /league/teams/:id so the
 * audit interceptor labels them teams.rollover, teams.division-shift,
 * teams.league-migration, teams.org-move. Org admins may move teams of
 * their own org; moving a team to another org is super admin only.
 */
@ApiTags("league-management/team-movement")
@ApiBearerAuth()
@Controller("league/teams")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class TeamMovementController {
  constructor(
    private readonly svc: TeamMovementService,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  /** 404 outside scope; never leaks existence. */
  private async assertTeamInScope(teamId: string, scope: UserScopeType) {
    const [t] = await this.db
      .select({ orgId: schema.teams.orgId })
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    if (!t) throw new NotFoundException("Team not found");
    if (scope.isSuperAdmin || scope.orgIds === null) return;
    if (!scope.orgIds.includes(t.orgId)) throw new NotFoundException("Team not found");
  }

  /**
   * Movement writes are for admins: super admin, or an org / league /
   * season / division admin. Team scope alone (captains, players) is not
   * enough even when the team is in the caller's organisation.
   */
  private async assertAdmin(user: AuthPrincipal, scope: UserScopeType) {
    if (scope.isSuperAdmin) return;
    if (!(await userIsPeopleAdmin(this.db, user.userId))) {
      throw new ForbiddenException("Only league or organisation admins can move teams.");
    }
  }

  /** The division must sit in a season the admin may manage; 404 otherwise. */
  private async assertDivisionInScope(divisionId: string, scope: UserScopeType, userId: string) {
    const [d] = await this.db
      .select({ seasonId: schema.divisions.seasonId })
      .from(schema.divisions)
      .where(eq(schema.divisions.id, divisionId))
      .limit(1);
    // Writes use the admin-only scope: a roster spot never widens it.
    const adminScope = scope.isSuperAdmin ? scope : await loadAdminScope(this.db, userId);
    if (!d || !(await seasonVisible(this.db, adminScope, d.seasonId))) {
      throw new NotFoundException("Division not found");
    }
  }

  private actor(user: AuthPrincipal, key: string | undefined, reason?: string) {
    return { userId: user.userId, idempotencyKey: key?.trim() || null, reason: reason ?? null };
  }

  @Post(":id/place")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Admin puts a team into a division (no previous entry needed); the entry is accepted" })
  async place(
    @Param("id") id: string,
    @Body() body: PlaceBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    await this.assertAdmin(user, scope);
    await this.assertDivisionInScope(body.divisionId, scope, user.userId);
    return this.svc.placeInDivision({
      teamId: id,
      divisionId: body.divisionId,
      actor: this.actor(user, undefined, body.reason)
    });
  }

  @Get(":id/entries")
  @ApiOperation({ summary: "Every season/division instance of the team, newest season first" })
  async entries(@Param("id") id: string, @UserScope() scope: UserScopeType) {
    await this.assertTeamInScope(id, scope);
    return { items: await this.svc.listEntries(id) };
  }

  @Get(":id/movements")
  @ApiOperation({ summary: "Movement history of the team, newest first" })
  async movements(@Param("id") id: string, @UserScope() scope: UserScopeType) {
    await this.assertTeamInScope(id, scope);
    return { items: await this.svc.history(id) };
  }

  @Post(":id/rollover")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Rule A: clone the team into a division of a later season" })
  async rollover(
    @Param("id") id: string,
    @Body() body: RolloverBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType,
    @Headers("x-idempotency-key") key?: string
  ): Promise<MovementResult> {
    await this.assertAdmin(user, scope);
    await this.assertTeamInScope(id, scope.isSuperAdmin ? scope : await loadAdminScope(this.db, user.userId));
    return this.svc.rollover({
      teamId: id,
      sourceEntryId: body.sourceEntryId ?? null,
      targetDivisionId: body.targetDivisionId,
      copyRoster: body.copyRoster ?? true,
      actor: this.actor(user, key, body.reason)
    });
  }

  @Post(":id/division-shift")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Rule B: move the team to another division of the same season" })
  async divisionShift(
    @Param("id") id: string,
    @Body() body: DivisionShiftBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType,
    @Headers("x-idempotency-key") key?: string
  ): Promise<MovementResult> {
    await this.assertAdmin(user, scope);
    await this.assertTeamInScope(id, scope.isSuperAdmin ? scope : await loadAdminScope(this.db, user.userId));
    return this.svc.divisionShift({
      teamId: id,
      entryId: body.entryId,
      targetDivisionId: body.targetDivisionId,
      resetStandings: body.resetStandings,
      actor: this.actor(user, key, body.reason)
    });
  }

  @Post(":id/league-migration")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Rule C: move the team to a division of another league in the same org" })
  async leagueMigration(
    @Param("id") id: string,
    @Body() body: LeagueMigrationBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType,
    @Headers("x-idempotency-key") key?: string
  ): Promise<MovementResult> {
    await this.assertAdmin(user, scope);
    await this.assertTeamInScope(id, scope.isSuperAdmin ? scope : await loadAdminScope(this.db, user.userId));
    return this.svc.leagueMigration({
      teamId: id,
      entryId: body.entryId,
      targetDivisionId: body.targetDivisionId,
      actor: this.actor(user, key, body.reason)
    });
  }

  @Post(":id/org-move")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Rule D: move the master team to another organisation (super admin)" })
  async orgMove(
    @Param("id") id: string,
    @Body() body: OrgMoveBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @Headers("x-idempotency-key") key?: string
  ): Promise<MovementResult> {
    return this.svc.orgMove({
      teamId: id,
      targetOrgId: body.targetOrgId,
      force: body.force ?? false,
      actor: this.actor(user, key, body.reason)
    });
  }
}
