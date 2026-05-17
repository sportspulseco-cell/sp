import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";

class ListFormsQueryDto {
  @IsUUID() orgId!: string;
  @IsOptional() @IsUUID() seasonId?: string;
}

/**
 * BUG-043 follow-up — read-only forms surface for org_admin.
 *
 * The main `/registration/forms` controller is super_admin-only, so
 * org-admin-web's /forms page used to dead-end on an external link
 * to sp-superadmin/forms (which bounces org_admin via wrong_role).
 * This endpoint lets the org-admin app render a forms list scoped to
 * the caller's active org. No write actions — those still flow
 * through the super_admin builder.
 */
@ApiTags("org-admin/forms")
@ApiBearerAuth()
@Controller("org-admin/forms")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class OrgAdminFormsController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  @ApiOperation({
    summary:
      "List registration forms for an org. Caller must hold super_admin or org_admin on the orgId. Read-only — writes go through /registration/forms (super_admin)."
  })
  async list(
    @Query() q: ListFormsQueryDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    // Inline scope check — caller has super_admin OR active org_admin on this org.
    const callerRoles = await this.db
      .select({ code: schema.roles.code, scopeId: schema.userRoleAssignments.scopeId })
      .from(schema.userRoleAssignments)
      .innerJoin(
        schema.roles,
        eq(schema.roles.id, schema.userRoleAssignments.roleId)
      )
      .where(
        and(
          eq(schema.userRoleAssignments.userId, user.userId),
          isNull(schema.userRoleAssignments.revokedAt)
        )
      );
    const allowed = callerRoles.some(
      (r) =>
        r.code === "super_admin" ||
        (r.code === "org_admin" && r.scopeId === q.orgId)
    );
    if (!allowed) {
      // 404 not 403 to avoid leaking org existence (per ARCH §3.4).
      throw new NotFoundException("Org not found");
    }

    const where = q.seasonId
      ? and(
          eq(schema.registrationForms.orgId, q.orgId),
          eq(schema.registrationForms.seasonId, q.seasonId)
        )
      : eq(schema.registrationForms.orgId, q.orgId);

    const items = await this.db
      .select({
        id: schema.registrationForms.id,
        orgId: schema.registrationForms.orgId,
        seasonId: schema.registrationForms.seasonId,
        name: schema.registrationForms.name,
        description: schema.registrationForms.description,
        purpose: schema.registrationForms.purpose,
        createdAt: schema.registrationForms.createdAt,
        updatedAt: schema.registrationForms.updatedAt,
        seasonName: schema.seasons.name
      })
      .from(schema.registrationForms)
      .leftJoin(
        schema.seasons,
        eq(schema.seasons.id, schema.registrationForms.seasonId)
      )
      .where(where)
      .orderBy(desc(schema.registrationForms.createdAt))
      .limit(100);

    return { items };
  }
}
