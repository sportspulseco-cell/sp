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
import { IsUUID } from "class-validator";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";

class ListOrgPersonsQueryDto {
  @IsUUID() orgId!: string;
}

/**
 * Org-scoped person directory. Powers the org-admin invoice composer's
 * "Individual" billing scope: the org admin picks one person to bill.
 *
 * A person is "in the org" if ANY of the following holds:
 *   1. They have an active team_membership in a team that belongs to
 *      the org.
 *   2. They've submitted a registration for any season in the org
 *      (subjectPersonId on registrations).
 *   3. Their user_id holds an active user_role_assignment with
 *      scope_type='org' and scope_id=:orgId.
 *
 * The union covers captains, players, and admins themselves —
 * basically anyone the org would reasonably want to invoice. We
 * intentionally do NOT return the entire persons table; that would
 * leak PII across orgs.
 */
@ApiTags("org-admin/persons")
@ApiBearerAuth()
@Controller("org-admin/persons")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class OrgAdminPersonsController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  @ApiOperation({
    summary:
      "List persons reachable from this org (memberships ∪ registrations ∪ org-scoped role assignments). Used by the org-admin invoice composer's individual-scope picker."
  })
  async list(
    @Query() q: ListOrgPersonsQueryDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ): Promise<
    Array<{
      id: string;
      orgId: string;
      displayName: string;
      email: string | null;
    }>
  > {
    // Scope check — super_admin passes; org_admin must hold an active
    // org-scope grant on the requested orgId. 404 (not 403) on
    // mismatch so we don't leak existence.
    if (!scope.isSuperAdmin) {
      if (scope.orgIds !== null && !scope.orgIds.includes(q.orgId)) {
        throw new NotFoundException("Org not found");
      }
      const ok = await this.userHasOrgAdminOnOrg(user.userId, q.orgId);
      if (!ok) {
        throw new ForbiddenException(
          "Requires org_admin (or super_admin) on this org"
        );
      }
    }

    // (1) persons via active membership in any team in the org.
    const viaMemberships = await this.db
      .selectDistinct({ personId: schema.teamMemberships.personId })
      .from(schema.teamMemberships)
      .innerJoin(
        schema.teams,
        eq(schema.teams.id, schema.teamMemberships.teamId)
      )
      .where(
        and(
          eq(schema.teams.orgId, q.orgId),
          eq(schema.teamMemberships.currentStatus, "active")
        )
      );

    // (2) persons via registrations against any season in the org.
    const viaRegistrations = await this.db
      .selectDistinct({ personId: schema.registrations.subjectPersonId })
      .from(schema.registrations)
      .where(eq(schema.registrations.orgId, q.orgId));

    // (3) persons via active org-scoped role assignment. Joins
    // user_role_assignments → persons by userId so admins/captains
    // without a roster footprint still show up.
    const viaRoles = await this.db
      .selectDistinct({ personId: schema.persons.id })
      .from(schema.userRoleAssignments)
      .innerJoin(
        schema.persons,
        eq(schema.persons.userId, schema.userRoleAssignments.userId)
      )
      .where(
        and(
          eq(schema.userRoleAssignments.scopeType, "org"),
          eq(schema.userRoleAssignments.scopeId, q.orgId),
          isNull(schema.userRoleAssignments.revokedAt)
        )
      );

    const personIds = Array.from(
      new Set([
        ...viaMemberships.map((r) => r.personId),
        ...viaRegistrations.map((r) => r.personId),
        ...viaRoles.map((r) => r.personId)
      ])
    );
    if (personIds.length === 0) return [];

    // Enrich with name + email (left-join on profiles via persons.userId).
    const rows = await this.db
      .select({
        id: schema.persons.id,
        firstName: schema.persons.legalFirstName,
        lastName: schema.persons.legalLastName,
        preferredName: schema.persons.preferredName,
        email: schema.profiles.email
      })
      .from(schema.persons)
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId))
      .where(inArray(schema.persons.id, personIds))
      .orderBy(sql`COALESCE(${schema.persons.legalFirstName}, '')`);

    return rows.map((r) => ({
      id: r.id,
      orgId: q.orgId,
      displayName:
        (r.preferredName && r.preferredName.trim()) ||
        [r.firstName, r.lastName].filter(Boolean).join(" ").trim() ||
        r.email ||
        r.id.slice(0, 8),
      email: r.email ?? null
    }));
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
