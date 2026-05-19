import {
  Body,
  Controller,
  Delete,
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
import { DivisionDto, DivisionPageDto } from "../application/dtos/division.dto";
import {
  CreateDivisionHandler,
  GetDivisionHandler,
  ListDivisionsHandler,
  UpdateDivisionHandler,
  ArchiveDivisionHandler
} from "../application/divisions/handlers";
import {
  CreateDivisionBodyDto,
  ListDivisionsQueryDto,
  UpdateDivisionBodyDto
} from "./dto/division.dto";

@ApiTags("league-management/divisions")
@ApiBearerAuth()
@Controller("league/divisions")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class DivisionsController {
  constructor(
    private readonly listH: ListDivisionsHandler,
    private readonly getH: GetDivisionHandler,
    private readonly createH: CreateDivisionHandler,
    private readonly updateH: UpdateDivisionHandler,
    private readonly archiveH: ArchiveDivisionHandler,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  @Get() list(
    @Query() q: ListDivisionsQueryDto,
    @UserScope() scope: UserScopeType
  ): Promise<DivisionPageDto> {
    return this.listH.execute({ ...q, leagueIdsFilter: scope.leagueIds ?? undefined });
  }
  @Get(":id") getOne(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType
  ): Promise<DivisionDto> {
    return this.getH.execute({
      id,
      leagueIdsFilter: scope.leagueIds ?? undefined,
      orgIdsFilter: scope.orgIds ?? undefined
    });
  }
  @Post()
  @AllowScopedWrite()
  async create(
    @Body() body: CreateDivisionBodyDto,
    @UserScope() scope: UserScopeType
  ): Promise<DivisionDto> {
    // Scope check: division creation lives under a season → league →
    // org. Org admins must hold the parent league's org. Look up via
    // the season → league join. 404 not 403 — don't leak existence.
    if (!scope.isSuperAdmin && scope.orgIds !== null) {
      const [row] = await this.db
        .select({ orgId: schema.leagues.orgId })
        .from(schema.seasons)
        .innerJoin(
          schema.leagues,
          eq(schema.leagues.id, schema.seasons.leagueId)
        )
        .where(eq(schema.seasons.id, body.seasonId))
        .limit(1);
      if (!row || !scope.orgIds.includes(row.orgId)) {
        throw new NotFoundException("Season not found");
      }
    }
    return this.createH.execute(body);
  }
  @Patch(":id") update(
    @Param("id") id: string,
    @Body() body: UpdateDivisionBodyDto
  ): Promise<DivisionDto> {
    return this.updateH.execute({ id, ...body });
  }
  @Delete(":id") archive(@Param("id") id: string): Promise<DivisionDto> {
    return this.archiveH.execute({ id });
  }
}
