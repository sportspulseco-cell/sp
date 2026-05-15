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
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min
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
import { CreateDivisionHandler } from "../../league-management/application/divisions/handlers";

type GenderEligibility = "male" | "female" | "mixed" | "open";

class CreateDivisionBodyDto {
  @IsUUID() seasonId!: string;
  @IsString() @Length(1, 200) name!: string;
  @IsOptional() @IsString() tier?: string;
  @IsOptional() @IsUUID() ageGroupId?: string;
  @IsOptional()
  @IsIn(["male", "female", "mixed", "open"])
  genderEligibility?: GenderEligibility;
  @IsOptional() @IsInt() @Min(2) maxTeams?: number;
}

/**
 * Backlog #6 follow-on — divisions live under a season; this lets an
 * org_admin add one without escalating to super_admin. Same scope-gate
 * pattern as the leagues/seasons controllers: resolve season → derive
 * orgId from the parent league → require org_admin on that org.
 */
@ApiTags("org-admin/divisions")
@ApiBearerAuth()
@Controller("org-admin/divisions")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class OrgAdminDivisionsController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly createDivisionH: CreateDivisionHandler
  ) {}

  @Post()
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Create a division under one of the caller's seasons. 404 when the season's parent league sits outside the caller's org scope."
  })
  async create(
    @Body() body: CreateDivisionBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    const [row] = await this.db
      .select({
        seasonId: schema.seasons.id,
        leagueId: schema.seasons.leagueId,
        orgId: schema.leagues.orgId
      })
      .from(schema.seasons)
      .innerJoin(
        schema.leagues,
        eq(schema.leagues.id, schema.seasons.leagueId)
      )
      .where(eq(schema.seasons.id, body.seasonId))
      .limit(1);
    if (!row) throw new NotFoundException("Season not found");

    if (!scope.isSuperAdmin) {
      if (scope.orgIds !== null && !scope.orgIds.includes(row.orgId)) {
        throw new NotFoundException("Season not found");
      }
      const ok = await this.userHasOrgAdminOnOrg(user.userId, row.orgId);
      if (!ok) {
        throw new ForbiddenException(
          "Requires org_admin (or super_admin) on this org"
        );
      }
    }

    const division = await this.createDivisionH.execute({
      seasonId: body.seasonId,
      name: body.name.trim(),
      tier: body.tier?.trim() || null,
      ageGroupId: body.ageGroupId ?? null,
      genderEligibility: body.genderEligibility,
      maxTeams: body.maxTeams ?? null
    });

    return { division };
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
