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
import { Inject, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { SeasonDto, SeasonPageDto } from "../application/dtos/season.dto";
import {
  CreateSeasonHandler,
  GetSeasonHandler,
  ListSeasonsHandler,
  UpdateSeasonHandler,
  ChangeSeasonStatusHandler,
  ArchiveSeasonHandler
} from "../application/seasons/handlers";
import {
  ChangeSeasonStatusBodyDto,
  CreateSeasonBodyDto,
  ListSeasonsQueryDto,
  UpdateSeasonBodyDto
} from "./dto/season.dto";

@ApiTags("league-management/seasons")
@ApiBearerAuth()
@Controller("league/seasons")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class SeasonsController {
  constructor(
    private readonly listH: ListSeasonsHandler,
    private readonly getH: GetSeasonHandler,
    private readonly createH: CreateSeasonHandler,
    private readonly updateH: UpdateSeasonHandler,
    private readonly statusH: ChangeSeasonStatusHandler,
    private readonly archiveH: ArchiveSeasonHandler,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  @Get() @ApiOperation({ summary: "List seasons" })
  list(@Query() q: ListSeasonsQueryDto): Promise<SeasonPageDto> {
    return this.listH.execute(q);
  }

  @Get(":id") @ApiOperation({ summary: "Get a season" })
  getOne(@Param("id") id: string): Promise<SeasonDto> {
    return this.getH.execute({ id });
  }

  @Post() @ApiOperation({ summary: "Create a season" })
  async create(
    @Body() body: CreateSeasonBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<SeasonDto> {
    // Resolve the parent league's orgId so the handler can store the
    // denormalised value on the season row. Trigger in migration 0015
    // is the safety net but we set it explicitly here for clarity.
    const [league] = await this.db
      .select({ orgId: schema.leagues.orgId })
      .from(schema.leagues)
      .where(eq(schema.leagues.id, body.leagueId))
      .limit(1);
    if (!league) throw new NotFoundException("League not found");
    return this.createH.execute({
      leagueId: body.leagueId,
      orgId: league.orgId,
      name: body.name,
      sportCode: body.sportCode,
      startDate: body.startDate,
      endDate: body.endDate,
      timezone: body.timezone,
      createdByUserId: user.userId
    });
  }

  @Patch(":id") @ApiOperation({ summary: "Update a season" })
  update(
    @Param("id") id: string,
    @Body() body: UpdateSeasonBodyDto
  ): Promise<SeasonDto> {
    return this.updateH.execute({ id, ...body });
  }

  @Post(":id/status") @ApiOperation({ summary: "Change season status" })
  changeStatus(
    @Param("id") id: string,
    @Body() body: ChangeSeasonStatusBodyDto
  ): Promise<SeasonDto> {
    return this.statusH.execute({ id, status: body.status });
  }

  @Delete(":id") @ApiOperation({ summary: "Archive a season (soft delete)" })
  archive(@Param("id") id: string): Promise<SeasonDto> {
    return this.archiveH.execute({ id });
  }
}
