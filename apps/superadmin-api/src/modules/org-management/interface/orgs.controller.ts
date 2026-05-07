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
import { ForbiddenException, NotFoundException } from "@nestjs/common";
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
    private readonly archiveH: ArchiveOrgHandler
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
  @Patch(":id") @ApiOperation({ summary: "Update an organization" })
  async update(
    @Param("id") id: string,
    @Body() body: UpdateOrgBodyDto,
    @UserScope() scope: UserScopeType
  ): Promise<OrgDto> {
    // org_admin can edit their own org's display fields; everyone
    // else needs super_admin.
    if (!scope.isSuperAdmin) {
      if (scope.orgIds === null || !scope.orgIds.includes(id)) {
        throw new ForbiddenException("Cannot edit this org");
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
