import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
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
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID
} from "class-validator";
import { eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { RegistrationV2Service } from "../application/registration-v2.service";

class UpsertFreeAgentBodyDto {
  @ApiProperty() @IsUUID() playerPersonId!: string;
  @ApiProperty() @IsUUID() seasonId!: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true })
  positions!: string[];
  @ApiPropertyOptional() @IsOptional() availability?: Record<string, unknown>;
  @ApiProperty({ enum: ["A", "B", "C", "D"] })
  @IsIn(["A", "B", "C", "D"])
  levelPrimary!: "A" | "B" | "C" | "D";
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  levelFlexibility?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

class PlaceFreeAgentBodyDto {
  @ApiProperty() @IsUUID() teamId!: string;
}

class ListFreeAgentsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() seasonId?: string;
}

@ApiTags("registration-v2/free-agent-pool")
@ApiBearerAuth()
@Controller("registration-v2/free-agent-pool")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class FreeAgentPoolController {
  constructor(
    private readonly svc: RegistrationV2Service,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  @Get()
  @ApiOperation({ summary: "List active free agents (filter by season)" })
  async list(
    @Query() q: ListFreeAgentsQueryDto,
    @UserScope() scope: UserScopeType
  ) {
    // Require seasonId for non-super-admin callers so we can scope-check
    // the result set. The free-agent pool exposes player PII + skill
    // levels; without a seasonId we'd return the entire platform pool.
    if (!scope.isSuperAdmin) {
      if (!q.seasonId) {
        throw new BadRequestException(
          "seasonId is required for non-super-admin callers"
        );
      }
      const [season] = await this.db
        .select({
          leagueId: schema.seasons.leagueId,
          orgId: schema.seasons.orgId
        })
        .from(schema.seasons)
        .where(eq(schema.seasons.id, q.seasonId))
        .limit(1);
      if (!season) {
        throw new NotFoundException(`Season not found: ${q.seasonId}`);
      }
      const inLeagueScope =
        scope.leagueIds === null || scope.leagueIds.includes(season.leagueId);
      const inOrgScope =
        scope.orgIds === null || scope.orgIds.includes(season.orgId);
      if (!inLeagueScope && !inOrgScope) {
        throw new NotFoundException(`Season not found: ${q.seasonId}`);
      }
    }
    return this.svc.listFreeAgentPool({ seasonId: q.seasonId });
  }

  @Post()
  @AllowScopedWrite()
  @ApiOperation({ summary: "Upsert a free agent entry (one per player+season)" })
  upsert(@Body() body: UpsertFreeAgentBodyDto) {
    // Self-write: a player creates a free-agent entry for themselves.
    // We don't have a fast user→person lookup at this layer, so we
    // accept the body's playerPersonId as-is and let the unique
    // constraint (player_id, season_id) prevent abuse. League/org
    // admins can create on behalf of others as before.
    return this.svc.upsertFreeAgentEntry({
      playerPersonId: body.playerPersonId,
      seasonId: body.seasonId,
      positions: body.positions,
      availability: body.availability ?? {},
      levelPrimary: body.levelPrimary,
      levelFlexibility: body.levelFlexibility,
      note: body.note
    });
  }

  @Patch(":id/place")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Captain places a free agent on a team" })
  place(
    @Param("id") id: string,
    @Body() body: PlaceFreeAgentBodyDto,
    @UserScope() scope: UserScopeType
  ) {
    // Captains place free agents only on their own team. League/org/
    // super admins always pass.
    const allowed =
      scope.isSuperAdmin ||
      scope.leagueIds === null ||
      (scope.teamIds?.includes(body.teamId) ?? false);
    if (!allowed) {
      throw new ForbiddenException("Cannot place free agents on this team");
    }
    return this.svc.placeFreeAgent(id, { teamId: body.teamId });
  }
}
