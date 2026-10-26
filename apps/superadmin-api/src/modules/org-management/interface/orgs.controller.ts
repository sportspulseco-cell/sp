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
import { ForbiddenException, Inject, NotFoundException } from "@nestjs/common";
import type { AuthPrincipal } from "@sportspulse/auth";
import type { Database } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { userHasOrgAdminOnOrg } from "../../../shared/auth/org-admin";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { OrgDto, OrgPageDto } from "../application/dtos/org.dto";
import {
  CreateOrgHandler,
  GetOrgHandler,
  ListOrgsHandler,
  UpdateOrgHandler,
  SuspendOrgHandler,
  ReactivateOrgHandler,
  ArchiveOrgHandler
} from "../application/orgs/handlers";
import {
  CreateOrgBodyDto,
  ListOrgsQueryDto,
  UpdateOrgBodyDto
} from "./dto/org.dto";

/**
 * Reads (list + get) are open to any authenticated user with at least
 * one active assignment — the AuthorizedAccessGuard projects scope and
 * we filter results to the user's orgIds. This is what lets the
 * org-admin / league-admin / team-admin / player apps render their
 * own org's data on home. Writes still require super_admin.
 */
@ApiTags("org-management/orgs")
@ApiBearerAuth()
@Controller("orgs")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class OrgsController {
  constructor(
    private readonly listH: ListOrgsHandler,
    private readonly getH: GetOrgHandler,
    private readonly createH: CreateOrgHandler,
    private readonly updateH: UpdateOrgHandler,
    private readonly suspendH: SuspendOrgHandler,
    private readonly reactivateH: ReactivateOrgHandler,
    private readonly archiveH: ArchiveOrgHandler,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  @Get() @ApiOperation({ summary: "List organizations (scope-filtered)" })
  async list(
    @Query() q: ListOrgsQueryDto,
    @UserScope() scope: UserScopeType
  ): Promise<OrgPageDto> {
    const page = await this.listH.execute(q);
    if (scope.orgIds === null) return page;
    const allowed = new Set(scope.orgIds);
    return {
      ...page,
      items: page.items.filter((o) => allowed.has(o.id))
    };
  }
  @Get(":id") @ApiOperation({ summary: "Get an organization (scope-checked)" })
  async getOne(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType
  ): Promise<OrgDto> {
    if (scope.orgIds !== null && !scope.orgIds.includes(id)) {
      // 404 (not 403) so we don't leak existence to out-of-scope readers.
      throw new NotFoundException(`Org ${id} not found`);
    }
    return this.getH.execute({ id });
  }
  @Post() @ApiOperation({ summary: "Create an organization (super_admin)" })
  @UseGuards(SuperAdminGuard)
  create(@Body() body: CreateOrgBodyDto): Promise<OrgDto> {
    return this.createH.execute(body);
  }
  @Patch(":id") @ApiOperation({ summary: "Update an organization (super_admin, or org_admin of this org)" })
  @AllowScopedWrite()
  async update(
    @Param("id") id: string,
    @Body() body: UpdateOrgBodyDto,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<OrgDto> {
    // An org admin edits their own org. Scope alone is not enough: a
    // captain or league admin also reaches the org through their team or
    // league. Without @AllowScopedWrite the class guard refused every
    // org admin before this check ran.
    if (!scope.isSuperAdmin) {
      if (scope.orgIds !== null && !scope.orgIds.includes(id)) {
        throw new NotFoundException(`Org ${id} not found`);
      }
      if (!(await userHasOrgAdminOnOrg(this.db, user.userId, id))) {
        throw new ForbiddenException("Only this organization's org admins can edit it.");
      }
    }
    return this.updateH.execute({ id, ...body });
  }
  @Post(":id/suspend") @ApiOperation({ summary: "Suspend an org (super_admin)" })
  @UseGuards(SuperAdminGuard)
  suspend(@Param("id") id: string): Promise<OrgDto> {
    return this.suspendH.execute({ id });
  }
  @Post(":id/reactivate") @ApiOperation({ summary: "Reactivate an org (super_admin)" })
  @UseGuards(SuperAdminGuard)
  reactivate(@Param("id") id: string): Promise<OrgDto> {
    return this.reactivateH.execute({ id });
  }
  @Delete(":id") @ApiOperation({ summary: "Archive an org (super_admin)" })
  @UseGuards(SuperAdminGuard)
  archive(@Param("id") id: string): Promise<OrgDto> {
    return this.archiveH.execute({ id });
  }
}
