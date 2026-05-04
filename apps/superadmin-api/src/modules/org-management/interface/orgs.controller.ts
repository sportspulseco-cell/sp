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
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
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

@ApiTags("org-management/orgs")
@ApiBearerAuth()
@Controller("orgs")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
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

  @Get() @ApiOperation({ summary: "List organizations" })
  list(@Query() q: ListOrgsQueryDto): Promise<OrgPageDto> {
    return this.listH.execute(q);
  }
  @Get(":id") @ApiOperation({ summary: "Get an organization" })
  getOne(@Param("id") id: string): Promise<OrgDto> {
    return this.getH.execute({ id });
  }
  @Post() @ApiOperation({ summary: "Create an organization" })
  create(@Body() body: CreateOrgBodyDto): Promise<OrgDto> {
    return this.createH.execute(body);
  }
  @Patch(":id") @ApiOperation({ summary: "Update an organization" })
  update(
    @Param("id") id: string,
    @Body() body: UpdateOrgBodyDto
  ): Promise<OrgDto> {
    return this.updateH.execute({ id, ...body });
  }
  @Post(":id/suspend") @ApiOperation({ summary: "Suspend an org" })
  suspend(@Param("id") id: string): Promise<OrgDto> {
    return this.suspendH.execute({ id });
  }
  @Post(":id/reactivate") @ApiOperation({ summary: "Reactivate an org" })
  reactivate(@Param("id") id: string): Promise<OrgDto> {
    return this.reactivateH.execute({ id });
  }
  @Delete(":id") @ApiOperation({ summary: "Archive an org" })
  archive(@Param("id") id: string): Promise<OrgDto> {
    return this.archiveH.execute({ id });
  }
}
