import {
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, IsUUID, Length } from "class-validator";
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
import { CreateLeagueHandler } from "../../league-management/application/leagues/handlers";

type LeagueFormat = "regular" | "tournament" | "pickup" | "friendly";

class CreateLeagueBodyDto {
  @IsUUID() orgId!: string;
  @IsString() @Length(2, 200) name!: string;
  @IsString() @Length(2, 32) sportCode!: string;
  @IsOptional()
  @IsIn(["regular", "tournament", "pickup", "friendly"])
  format?: LeagueFormat;
  @IsOptional() @IsUUID() governingBodyId?: string;
}

/**
 * Backlog #17b — org-admin kicks off setup.
 *
 * The full org-setup wizard in superadmin-web is god-app territory.
 * For now an org_admin can at least bootstrap the first thing — a
 * league under their org — without escalating. Seasons + divisions
 * still happen in superadmin-web until #6 mirrors those mutations.
 */
@ApiTags("org-admin/leagues")
@ApiBearerAuth()
@Controller("org-admin/leagues")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class OrgAdminLeaguesController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly createLeagueH: CreateLeagueHandler
  ) {}

  @Post()
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Create a league under one of the caller's orgs. Caller must hold org_admin (or super_admin) on the target org."
  })
  async create(
    @Body() body: CreateLeagueBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    if (!scope.isSuperAdmin) {
      const ok = await this.userHasOrgAdminOnOrg(user.userId, body.orgId);
      if (!ok) {
        throw new ForbiddenException(
          "Requires org_admin (or super_admin) on this org"
        );
      }
    }
    const league = await this.createLeagueH.execute({
      orgId: body.orgId,
      name: body.name.trim(),
      sportCode: body.sportCode,
      format: body.format,
      governingBodyId: body.governingBodyId ?? null
    });
    return { league };
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
