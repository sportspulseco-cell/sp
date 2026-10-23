import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthPrincipal } from "@sportspulse/auth";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { resolveEntityNames } from "../../../shared/display/entity-names";
import type { Database } from "@sportspulse/db";
import { CrossOrgGrantDto } from "../application/dtos/org.dto";
import {
  IssueCrossOrgGrantHandler,
  RevokeCrossOrgGrantHandler,
  ListGrantsByUserHandler,
  ListGrantsByOrgHandler
} from "../application/cross-org-grants/handlers";
import { IssueCrossOrgGrantBodyDto } from "./dto/org.dto";

@ApiTags("org-management/cross-org-grants")
@ApiBearerAuth()
@Controller("cross-org-grants")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class CrossOrgGrantsController {
  constructor(
    private readonly issueH: IssueCrossOrgGrantHandler,
    private readonly revokeH: RevokeCrossOrgGrantHandler,
    private readonly byUserH: ListGrantsByUserHandler,
    private readonly byOrgH: ListGrantsByOrgHandler,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  /** Add userDisplayName so screens never print raw ids. */
  private async withNames(items: CrossOrgGrantDto[]): Promise<CrossOrgGrantDto[]> {
    const names = await resolveEntityNames(
      this.db,
      items.map((g) => ({ type: "user", id: g.userId }))
    );
    return items.map((g) => ({
      ...g,
      userDisplayName: names.get(`user:${g.userId}`) ?? null
    }));
  }

  @Post() @ApiOperation({ summary: "Issue a cross-org grant" })
  issue(
    @Body() body: IssueCrossOrgGrantBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<CrossOrgGrantDto> {
    return this.issueH.execute({ ...body, grantedByUserId: user.userId });
  }

  @Delete(":id") @ApiOperation({ summary: "Revoke a cross-org grant" })
  revoke(@Param("id") id: string): Promise<CrossOrgGrantDto> {
    return this.revokeH.execute({ id });
  }

  @Get() @ApiOperation({ summary: "List by user or by org" })
  async list(
    @Query("userId") userId?: string,
    @Query("orgId") orgId?: string
  ): Promise<CrossOrgGrantDto[]> {
    if (userId) return this.withNames(await this.byUserH.execute({ userId }));
    if (orgId) return this.withNames(await this.byOrgH.execute({ orgId }));
    return [];
  }
}
