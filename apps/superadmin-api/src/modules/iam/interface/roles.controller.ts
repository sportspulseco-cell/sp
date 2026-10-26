import {
  Body,
  Inject,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthPrincipal } from "@sportspulse/auth";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { ScopedAdminGuard } from "../../../shared/auth/guards/scoped-admin.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { userVisible } from "../../../shared/auth/visibility";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import {
  assertCanManageRole,
  assignmentTarget,
  systemRoleCodeOf
} from "../../../shared/auth/role-grant-access";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { resolveEntityNames } from "../../../shared/display/entity-names";
import type { Database } from "@sportspulse/db";
import {
  RoleAssignmentDto,
  RoleAssignmentPageDto,
  RoleDto,
  RolePageDto
} from "../application/dtos/role.dto";
import {
  ActiveAssignmentsForUserHandler,
  AssignRoleHandler,
  CreateRoleHandler,
  DeleteRoleHandler,
  GetRoleHandler,
  ListAssignmentsHandler,
  ListRolesHandler,
  RevokeAssignmentHandler,
  UpdateRoleHandler
} from "../application/roles/handlers";
import {
  AssignRoleBodyDto,
  CreateRoleBodyDto,
  ListAssignmentsQueryDto,
  ListRolesQueryDto,
  UpdateRoleBodyDto
} from "./dto/role.dto";

@ApiTags("iam/roles")
@ApiBearerAuth()
@Controller("iam")
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(
    private readonly listRolesH: ListRolesHandler,
    private readonly getRoleH: GetRoleHandler,
    private readonly createRoleH: CreateRoleHandler,
    private readonly updateRoleH: UpdateRoleHandler,
    private readonly deleteRoleH: DeleteRoleHandler,
    private readonly listAssignmentsH: ListAssignmentsHandler,
    private readonly assignH: AssignRoleHandler,
    private readonly revokeH: RevokeAssignmentHandler,
    private readonly activeForUserH: ActiveAssignmentsForUserHandler,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  /** Add scopeName + userDisplayName so screens never print raw ids. */
  private async withNames(items: RoleAssignmentDto[]): Promise<RoleAssignmentDto[]> {
    const names = await resolveEntityNames(this.db, [
      ...items.map((a) => ({ type: a.scopeType, id: a.scopeId })),
      ...items.map((a) => ({ type: "user", id: a.userId }))
    ]);
    return items.map((a) => ({
      ...a,
      scopeName: a.scopeId ? names.get(`${a.scopeType}:${a.scopeId}`) ?? null : null,
      userDisplayName: names.get(`user:${a.userId}`) ?? null
    }));
  }

  // ---- Self ----
  @Get("me/roles")
  @ApiOperation({
    summary:
      "Active role assignments for the current principal (no super_admin required)"
  })
  async myRoles(
    @CurrentUser() user: AuthPrincipal
  ): Promise<RoleAssignmentDto[]> {
    return this.withNames(await this.activeForUserH.execute({ userId: user.userId }));
  }

  // ---- Roles: the catalogue is readable by any signed-in role holder
  // (the user pages need it to name roles); changes stay super_admin. ----
  @Get("roles")
  @UseGuards(AuthorizedAccessGuard)
  listRoles(@Query() q: ListRolesQueryDto): Promise<RolePageDto> {
    return this.listRolesH.execute(q);
  }
  @Get("roles/:id")
  @UseGuards(AuthorizedAccessGuard)
  getRole(@Param("id") id: string): Promise<RoleDto> {
    return this.getRoleH.execute({ id });
  }
  @Post("roles")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Create a custom (non-system) role" })
  createRole(@Body() body: CreateRoleBodyDto): Promise<RoleDto> {
    return this.createRoleH.execute({
      orgId: body.orgId ?? null,
      code: body.code,
      name: body.name,
      description: body.description ?? null,
      permissions: body.permissions ?? []
    });
  }
  @Patch("roles/:id")
  @UseGuards(SuperAdminGuard)
  updateRole(
    @Param("id") id: string,
    @Body() body: UpdateRoleBodyDto
  ): Promise<RoleDto> {
    return this.updateRoleH.execute({ id, ...body });
  }
  @Delete("roles/:id")
  @UseGuards(SuperAdminGuard)
  deleteRole(@Param("id") id: string) {
    return this.deleteRoleH.execute({ id });
  }

  // ---- Role assignments: scoped admins see assignments of people
  // inside their scope. Org and league admins grant and revoke inside
  // their own org or league, never above their own level (kernel
  // role-grants.ts + shared/auth/role-grant-access.ts). ----
  @Get("role-assignments")
  @UseGuards(ScopedAdminGuard)
  async listAssignments(
    @Query() q: ListAssignmentsQueryDto,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<RoleAssignmentPageDto> {
    const page = await this.listAssignmentsH.execute({
      ...q,
      visibleTo: scope.isSuperAdmin ? undefined : { scope, userId: user.userId }
    });
    return { ...page, items: await this.withNames(page.items) };
  }
  @Post("role-assignments")
  @UseGuards(ScopedAdminGuard)
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Assign a role to a user (idempotent on active match). Super admin: any role. Org / league admin: system roles at or below their own level, inside their own org or league; 404 outside it, 403 above their level."
  })
  async assign(
    @Body() body: AssignRoleBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<RoleAssignmentDto> {
    await assertCanManageRole(
      this.db,
      user.userId,
      {
        roleCode: await systemRoleCodeOf(this.db, body.roleId),
        scopeType: body.scopeType,
        scopeId: body.scopeId ?? null
      },
      "grant"
    );
    return this.assignH.execute({
      ...body,
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : null,
      effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
      grantedByUserId: user.userId
    });
  }
  @Post("role-assignments/:id/revoke")
  @UseGuards(ScopedAdminGuard)
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Revoke a role assignment. Same rule as assign. Takes effect on the user's next request: every guard reads live assignments."
  })
  async revoke(
    @Param("id") id: string,
    @CurrentUser() user: AuthPrincipal
  ): Promise<RoleAssignmentDto> {
    await assertCanManageRole(this.db, user.userId, await assignmentTarget(this.db, id), "revoke");
    return this.revokeH.execute({ id, revokedByUserId: user.userId });
  }
  @Get("users/:id/roles")
  @UseGuards(ScopedAdminGuard)
  @ApiOperation({ summary: "Active role assignments for a user (with role joined); 404 outside the caller's scope" })
  async activeForUser(
    @Param("id") userId: string,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<RoleAssignmentDto[]> {
    if (!scope.isSuperAdmin && !(await userVisible(this.db, { scope, userId: user.userId }, userId))) {
      throw new NotFoundException("User not found");
    }
    return this.withNames(await this.activeForUserH.execute({ userId }));
  }
}
