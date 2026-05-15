import {
  Body,
  Controller,
  ForbiddenException,
  Inject,
  NotFoundException,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Length
} from "class-validator";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { CreateSeasonHandler } from "../../league-management/application/seasons/handlers";

class CreateSeasonBodyDto {
  @IsUUID() leagueId!: string;
  @IsString() @Length(2, 200) name!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsDateString() registrationOpensAt?: string;
  @IsOptional() @IsDateString() registrationClosesAt?: string;
  @IsOptional() @IsDateString() rosterLockAt?: string;
}

/**
 * Backlog #17b / #6 follow-on — second org-admin setup write surface.
 * Lets an org_admin create a season under one of their leagues without
 * escalating. Derives sportCode + orgId from the league so the org-admin
 * doesn't need to repeat them, then delegates to CreateSeasonHandler.
 */
@ApiTags("org-admin/seasons")
@ApiBearerAuth()
@Controller("org-admin/seasons")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class OrgAdminSeasonsController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly createSeasonH: CreateSeasonHandler
  ) {}

  @Post()
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Create a season under one of the caller's leagues. Caller must hold org_admin (or super_admin) on the league's parent org."
  })
  async create(
    @Body() body: CreateSeasonBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    const [league] = await this.db
      .select({
        id: schema.leagues.id,
        orgId: schema.leagues.orgId,
        sportCode: schema.leagues.sportCode
      })
      .from(schema.leagues)
      .where(eq(schema.leagues.id, body.leagueId))
      .limit(1);
    // 404 (not 403) when not in scope, per the no-leak rule.
    if (!league) throw new NotFoundException("League not found");

    if (!scope.isSuperAdmin) {
      if (scope.orgIds !== null && !scope.orgIds.includes(league.orgId)) {
        throw new NotFoundException("League not found");
      }
      const ok = await this.userHasOrgAdminOnOrg(user.userId, league.orgId);
      if (!ok) {
        throw new ForbiddenException(
          "Requires org_admin (or super_admin) on this org"
        );
      }
    }

    const season = await this.createSeasonH.execute({
      leagueId: body.leagueId,
      orgId: league.orgId,
      sportCode: league.sportCode,
      name: body.name.trim(),
      startDate: body.startDate,
      endDate: body.endDate,
      timezone: body.timezone,
      registrationOpensAt: body.registrationOpensAt ?? null,
      registrationClosesAt: body.registrationClosesAt ?? null,
      rosterLockAt: body.rosterLockAt ?? null,
      createdByUserId: user.userId
    });

    return { season };
  }

  private async userHasOrgAdminOnOrg(
    userId: string,
    orgId: string
  ): Promise<boolean> {
    const rows = await this.db
      .select({ code: schema.roles.code })
      .from(schema.userRoleAssignments)
      .innerJoin(
        schema.roles,
        eq(schema.roles.id, schema.userRoleAssignments.roleId)
      )
      .where(
        and(
          eq(schema.userRoleAssignments.userId, userId),
          eq(schema.userRoleAssignments.scopeType, "org"),
          eq(schema.userRoleAssignments.scopeId, orgId),
          isNull(schema.userRoleAssignments.revokedAt)
        )
      );
    return rows.some((r) => ["super_admin", "org_admin"].includes(r.code));
  }
}
