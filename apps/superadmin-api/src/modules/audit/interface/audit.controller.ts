import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthPrincipal } from "@sportspulse/auth";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { resolveEntityNames } from "../../../shared/display/entity-names";
import type { Database } from "@sportspulse/db";
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

/**
 * Audit resource types come from the URL segment ("teams", "orgs").
 * Map the ones resolveEntityNames knows; the rest stay unnamed.
 */
function entityTypeFor(resourceType: string): string {
  const t = resourceType.toLowerCase();
  const map: Record<string, string> = {
    orgs: "org",
    organizations: "org",
    leagues: "league",
    seasons: "season",
    divisions: "division",
    teams: "team",
    persons: "person",
    users: "user",
    profiles: "user"
  };
  return map[t] ?? t;
}

@ApiTags("audit")
@ApiBearerAuth()
@Controller("audit")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class AuditController {
  constructor(
    private readonly listH: ListAuditEventsHandler,
    private readonly getH: GetAuditEventHandler,
    private readonly facetsH: AuditFacetsHandler,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  /** Add actorName + resourceName so screens never print raw ids. */
  private async withNames(items: AuditEventDto[]): Promise<AuditEventDto[]> {
    const names = await resolveEntityNames(this.db, [
      ...items.map((e) => ({ type: "user", id: e.actorUserId })),
      ...items.map((e) => ({ type: entityTypeFor(e.resourceType), id: e.resourceId }))
    ]);
    return items.map((e) => ({
      ...e,
      actorName: e.actorUserId ? names.get(`user:${e.actorUserId}`) ?? null : null,
      resourceName: e.resourceId
        ? names.get(`${entityTypeFor(e.resourceType)}:${e.resourceId}`) ?? null
        : null
    }));
  }

  @Get()
  @ApiOperation({ summary: "List audit events (newest first)" })
  async list(
    @Query() q: ListAuditQueryDto,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<AuditEventPageDto> {
    const page = await this.listH.execute({
      ...q,
      orgIdsFilter: scope.orgIds ?? undefined,
      currentUserId: user.userId
    });
    return { ...page, items: await this.withNames(page.items) };
  }

  @Get("facets")
  @ApiOperation({ summary: "Distinct actions + resource types for filter UIs" })
  facets(): Promise<AuditFacetsDto> {
    return this.facetsH.execute();
  }

  @Get(":id")
  async get(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType,
    @CurrentUser() user: AuthPrincipal
  ): Promise<AuditEventDto> {
    const event = await this.getH.execute({
      id,
      orgIdsFilter: scope.orgIds ?? undefined,
      currentUserId: user.userId
    });
    const [named] = await this.withNames([event]);
    return named ?? event;
  }
}
