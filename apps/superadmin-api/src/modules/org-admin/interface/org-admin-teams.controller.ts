import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, Length } from "class-validator";
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
import { AssignRoleHandler } from "../../iam/application/roles/handlers";
import { CreateTeamHandler } from "../../league-management/application/teams/handlers";

class AssignCaptainBodyDto {
  @IsUUID() userId!: string;
}

class CreateTeamBodyDto {
  @IsUUID() orgId!: string;
  @IsString() @Length(2, 200) name!: string;
  @IsString() @Length(2, 32) sportCode!: string;
  @IsOptional() @IsString() @Length(1, 16) shortName?: string;
  @IsOptional() @IsString() logoUrl?: string;
}

/**
 * Backlog #17a — org-admin extended actions. The org-admin app today
 * is read-only; this controller adds the first mutation: granting the
 * captain role to a user on one of the org's teams, plus revoking it.
 *
 * Authorization model:
 *   - super_admin always passes (handled by AuthorizedAccessGuard
 *     when isSuperAdmin = true).
 *   - org_admin must be scoped to the team's parent org.
 *   - Anyone else → 403.
 *
 * On grant we also sync `teams.captain_user_id` so legacy reads that
 * check the column still work; revoke clears it if it points at the
 * revoked user.
 */
@ApiTags("org-admin/teams")
@ApiBearerAuth()
@Controller("org-admin/teams")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class OrgAdminTeamsController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly assignRoleH: AssignRoleHandler,
    private readonly createTeamH: CreateTeamHandler
  ) {}

  // -------------------------------------------------------------------
  // POST /org-admin/teams — create a team under an org
  // -------------------------------------------------------------------
  @Post()
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Create a team under one of the caller's orgs. Caller must hold org_admin (or super_admin) on the target org."
  })
  async create(
    @Body() body: CreateTeamBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    if (!scope.isSuperAdmin) {
      if (scope.orgIds !== null && !scope.orgIds.includes(body.orgId)) {
        throw new NotFoundException("Org not found");
      }
      const ok = await this.userHasOrgAdminOnOrg(user.userId, body.orgId);
      if (!ok) {
        throw new ForbiddenException(
          "Requires org_admin (or super_admin) on this org"
        );
      }
    }
    const team = await this.createTeamH.execute({
      orgId: body.orgId,
      name: body.name.trim(),
      sportCode: body.sportCode,
      shortName: body.shortName?.trim() || null,
      logoUrl: body.logoUrl?.trim() || null
    });
    return { team };
  }

  // -------------------------------------------------------------------
  // GET /org-admin/teams/:teamId — team detail + current captain(s)
  // -------------------------------------------------------------------
  @Get(":teamId")
  @ApiOperation({
    summary:
      "Org-scoped team detail including the active captain assignment(s). 404 when the team isn't in scope."
  })
  async detail(
    @Param("teamId") teamId: string,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    const team = await this.requireTeamInScope(teamId, user.userId, scope);

    const [captainRole] = await this.db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.code, "captain"))
      .limit(1);

    const assignments = captainRole
      ? await this.db
          .select({
            id: schema.userRoleAssignments.id,
            userId: schema.userRoleAssignments.userId,
            grantedAt: schema.userRoleAssignments.effectiveFrom,
            displayName: schema.profiles.displayName,
            email: schema.profiles.email
          })
          .from(schema.userRoleAssignments)
          .innerJoin(
            schema.profiles,
            eq(schema.profiles.id, schema.userRoleAssignments.userId)
          )
          .where(
            and(
              eq(schema.userRoleAssignments.roleId, captainRole.id),
              eq(schema.userRoleAssignments.scopeType, "team"),
              eq(schema.userRoleAssignments.scopeId, teamId),
              isNull(schema.userRoleAssignments.revokedAt)
            )
          )
      : [];

    return {
      team: {
        id: team.id,
        name: team.name,
        shortName: team.shortName,
        sportCode: team.sportCode,
        status: team.status,
        orgId: team.orgId,
        captainUserId: team.captainUserId
      },
      captains: assignments.map((a) => ({
        assignmentId: a.id,
        userId: a.userId,
        displayName: a.displayName,
        email: a.email,
        grantedAt: a.grantedAt?.toISOString() ?? null
      }))
    };
  }

  // -------------------------------------------------------------------
  // POST /org-admin/teams/:teamId/captain — grant the captain role
  // -------------------------------------------------------------------
  @Post(":teamId/captain")
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Grant the captain role to a user, scoped to this team. Also syncs teams.captain_user_id."
  })
  async assignCaptain(
    @Param("teamId") teamId: string,
    @Body() body: AssignCaptainBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    const team = await this.requireTeamInScope(teamId, user.userId, scope);

    const [profile] = await this.db
      .select({ id: schema.profiles.id })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, body.userId))
      .limit(1);
    if (!profile) throw new BadRequestException("Target user not found");

    const [captainRole] = await this.db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.code, "captain"))
      .limit(1);
    if (!captainRole) {
      throw new BadRequestException(
        "Captain role not seeded in this environment"
      );
    }

    const assignment = await this.assignRoleH.execute({
      userId: body.userId,
      roleId: captainRole.id,
      scopeType: "team",
      scopeId: teamId,
      effectiveFrom: null,
      effectiveTo: null,
      grantedByUserId: user.userId
    });

    // Sync the legacy column so anything that still reads it stays correct.
    if (team.captainUserId !== body.userId) {
      await this.db
        .update(schema.teams)
        .set({ captainUserId: body.userId, updatedAt: new Date() })
        .where(eq(schema.teams.id, teamId));
    }

    return { assignment };
  }

  // -------------------------------------------------------------------
  // POST /org-admin/teams/:teamId/captain/:assignmentId/revoke
  // -------------------------------------------------------------------
  @Post(":teamId/captain/:assignmentId/revoke")
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Revoke a captain assignment. Also clears teams.captain_user_id when it points at the revoked user."
  })
  async revokeCaptain(
    @Param("teamId") teamId: string,
    @Param("assignmentId") assignmentId: string,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    const team = await this.requireTeamInScope(teamId, user.userId, scope);

    const [assignment] = await this.db
      .select()
      .from(schema.userRoleAssignments)
      .where(
        and(
          eq(schema.userRoleAssignments.id, assignmentId),
          eq(schema.userRoleAssignments.scopeType, "team"),
          eq(schema.userRoleAssignments.scopeId, teamId)
        )
      )
      .limit(1);
    if (!assignment) throw new NotFoundException("Assignment not found");
    if (assignment.revokedAt) {
      return { id: assignmentId, alreadyRevoked: true };
    }

    await this.db
      .update(schema.userRoleAssignments)
      .set({
        revokedAt: new Date(),
        revokedByUserId: user.userId
      })
      .where(eq(schema.userRoleAssignments.id, assignmentId));

    if (team.captainUserId === assignment.userId) {
      await this.db
        .update(schema.teams)
        .set({ captainUserId: null, updatedAt: new Date() })
        .where(eq(schema.teams.id, teamId));
    }

    return { id: assignmentId, revoked: true };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private async requireTeamInScope(
    teamId: string,
    userId: string,
    scope: UserScopeType
  ) {
    const [team] = await this.db
      .select({
        id: schema.teams.id,
        name: schema.teams.name,
        shortName: schema.teams.shortName,
        sportCode: schema.teams.sportCode,
        status: schema.teams.status,
        orgId: schema.teams.orgId,
        captainUserId: schema.teams.captainUserId
      })
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    // 404 (not 403) when out of scope, per the project's no-leak rule.
    if (!team) throw new NotFoundException("Team not found");

    if (scope.isSuperAdmin) return team;
    if (scope.orgIds === null) return team;
    if (!scope.orgIds.includes(team.orgId)) {
      throw new NotFoundException("Team not found");
    }
    // Caller has org access — but ensure they're at least org_admin (not
    // just a player). We re-read role codes from assignments to confirm.
    const hasOrgAdminRole = await this.userHasOrgAdminOnOrg(userId, team.orgId);
    if (!hasOrgAdminRole) {
      throw new ForbiddenException(
        "Requires org_admin (or higher) on this org"
      );
    }
    return team;
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
    return rows.some((r) =>
      ["super_admin", "org_admin"].includes(r.code)
    );
  }
}
