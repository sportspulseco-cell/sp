import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
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
    private readonly activeForUserH: ActiveAssignmentsForUserHandler
  ) {}

  // ---- Self ----
  @Get("me/roles")
  @ApiOperation({
    summary:
      "Active role assignments for the current principal (no super_admin required)"
  })
  myRoles(
    @CurrentUser() user: AuthPrincipal
  ): Promise<RoleAssignmentDto[]> {
    return this.activeForUserH.execute({ userId: user.userId });
  }

  // ---- Roles (super_admin) ----
  @Get("roles")
  @UseGuards(SuperAdminGuard)
  listRoles(@Query() q: ListRolesQueryDto): Promise<RolePageDto> {
    return this.listRolesH.execute(q);
  }
  @Get("roles/:id")
  @UseGuards(SuperAdminGuard)
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

  // ---- Role assignments (super_admin) ----
  @Get("role-assignments")
  @UseGuards(SuperAdminGuard)
  listAssignments(
    @Query() q: ListAssignmentsQueryDto
  ): Promise<RoleAssignmentPageDto> {
    return this.listAssignmentsH.execute(q);
  }
  @Post("role-assignments")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Assign a role to a user (idempotent on active match)" })
  assign(
    @Body() body: AssignRoleBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<RoleAssignmentDto> {
    return this.assignH.execute({
      ...body,
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : null,
      effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
      grantedByUserId: user.userId
    });
  }
  @Post("role-assignments/:id/revoke")
  @UseGuards(SuperAdminGuard)
  revoke(
    @Param("id") id: string,
    @CurrentUser() user: AuthPrincipal
  ): Promise<RoleAssignmentDto> {
    return this.revokeH.execute({ id, revokedByUserId: user.userId });
  }
  @Get("users/:id/roles")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Active role assignments for a user (with role joined)" })
  activeForUser(@Param("id") userId: string): Promise<RoleAssignmentDto[]> {
    return this.activeForUserH.execute({ userId });
  }
}
