import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthPrincipal } from "@sportspulse/auth";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import {
  AuditEventDto,
  AuditEventPageDto,
  AuditFacetsDto
} from "../application/dtos/audit.dto";
import {
  AuditFacetsHandler,
  GetAuditEventHandler,
  ListAuditEventsHandler
} from "../application/handlers/queries";
import { ListAuditQueryDto } from "./dto/audit.dto";

@ApiTags("audit")
@ApiBearerAuth()
@Controller("audit")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class AuditController {
  constructor(
    private readonly listH: ListAuditEventsHandler,
    private readonly getH: GetAuditEventHandler,
    private readonly facetsH: AuditFacetsHandler
  ) {}

  @Get()
  @ApiOperation({ summary: "List audit events (newest first)" })
  list(
    @Query() q: ListAuditQueryDto,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<AuditEventPageDto> {
    return this.listH.execute({
      ...q,
      orgIdsFilter: scope.orgIds ?? undefined,
      currentUserId: user.userId
    });
  }

  @Get("facets")
  @ApiOperation({ summary: "Distinct actions + resource types for filter UIs" })
  facets(): Promise<AuditFacetsDto> {
    return this.facetsH.execute();
  }

  @Get(":id")
  get(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<AuditEventDto> {
    return this.getH.execute({
      id,
      orgIdsFilter: scope.orgIds ?? undefined,
      currentUserId: user.userId
    });
  }
}
