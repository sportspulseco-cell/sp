import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { OrgRelationDto } from "../application/dtos/org.dto";
import {
  LinkOrgsHandler,
  UnlinkOrgsHandler,
  ListOrgChildrenHandler,
  ListOrgParentsHandler
} from "../application/org-relations/handlers";
import { LinkOrgsBodyDto } from "./dto/org.dto";

@ApiTags("org-management/relations")
@ApiBearerAuth()
@Controller("orgs")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class OrgRelationsController {
  constructor(
    private readonly linkH: LinkOrgsHandler,
    private readonly unlinkH: UnlinkOrgsHandler,
    private readonly childrenH: ListOrgChildrenHandler,
    private readonly parentsH: ListOrgParentsHandler
  ) {}

  @Post("relations") @ApiOperation({ summary: "Link two orgs (parent → child)" })
  link(@Body() body: LinkOrgsBodyDto): Promise<OrgRelationDto> {
    return this.linkH.execute(body);
  }

  @Delete("relations/:id") @ApiOperation({ summary: "End an org relation" })
  unlink(@Param("id") id: string): Promise<OrgRelationDto> {
    return this.unlinkH.execute({ id });
  }

  @Get(":orgId/children") @ApiOperation({ summary: "List child orgs" })
  children(@Param("orgId") orgId: string): Promise<OrgRelationDto[]> {
    return this.childrenH.execute({ orgId });
  }

  @Get(":orgId/parents") @ApiOperation({ summary: "List parent orgs" })
  parents(@Param("orgId") orgId: string): Promise<OrgRelationDto[]> {
    return this.parentsH.execute({ orgId });
  }
}
