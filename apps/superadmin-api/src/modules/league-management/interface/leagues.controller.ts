import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { LeagueDto, LeaguePageDto } from "../application/dtos/league.dto";
import {
  CreateLeagueHandler,
  GetLeagueHandler,
  ListLeaguesHandler,
  UpdateLeagueHandler,
  ChangeLeagueStatusHandler
} from "../application/leagues/handlers";
import {
  ChangeLeagueStatusBodyDto,
  CreateLeagueBodyDto,
  ListLeaguesQueryDto,
  UpdateLeagueBodyDto
} from "./dto/league.dto";

@ApiTags("league-management/leagues")
@ApiBearerAuth()
@Controller("league/leagues")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class LeaguesController {
  constructor(
    private readonly listH: ListLeaguesHandler,
    private readonly getH: GetLeagueHandler,
    private readonly createH: CreateLeagueHandler,
    private readonly updateH: UpdateLeagueHandler,
    private readonly statusH: ChangeLeagueStatusHandler,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  @Get() @ApiOperation({ summary: "List leagues" })
  list(
    @Query() q: ListLeaguesQueryDto,
    @UserScope() scope: UserScopeType
  ): Promise<LeaguePageDto> {
    return this.listH.execute({ ...q, leagueIdsFilter: scope.leagueIds ?? undefined });
  }

  @Get(":id") @ApiOperation({ summary: "Get a league" })
  getOne(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType
  ): Promise<LeagueDto> {
    return this.getH.execute({ id, leagueIdsFilter: scope.leagueIds ?? undefined });
  }

  @Post()
  @AllowScopedWrite()
  @ApiOperation({ summary: "Create a league" })
  create(
    @Body() body: CreateLeagueBodyDto,
    @UserScope() scope: UserScopeType
  ): Promise<LeagueDto> {
    // Org-scope check — super_admin / unrestricted callers pass; org
    // admins can only create leagues under orgs they hold.
    if (!scope.isSuperAdmin && scope.orgIds !== null) {
      if (!scope.orgIds.includes(body.orgId)) {
        throw new NotFoundException("Org not found");
      }
    }
    return this.createH.execute(body);
  }

  @Patch(":id") @ApiOperation({ summary: "Update a league" })
  update(
    @Param("id") id: string,
    @Body() body: UpdateLeagueBodyDto
  ): Promise<LeagueDto> {
    return this.updateH.execute({ id, ...body });
  }

  @Post(":id/status")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Change league status" })
  async changeStatus(
    @Param("id") id: string,
    @Body() body: ChangeLeagueStatusBodyDto,
    @UserScope() scope: UserScopeType
  ): Promise<LeagueDto> {
    if (!scope.isSuperAdmin && scope.orgIds !== null) {
      const [row] = await this.db
        .select({ orgId: schema.leagues.orgId })
        .from(schema.leagues)
        .where(eq(schema.leagues.id, id))
        .limit(1);
      if (!row || !scope.orgIds.includes(row.orgId)) {
        throw new NotFoundException("League not found");
      }
    }
    return this.statusH.execute({ id, status: body.status });
  }
}
