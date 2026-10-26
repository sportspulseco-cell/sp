import {
  Body,
  ConflictException,
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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags
} from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";

export class RegionDto {
  @ApiProperty() id!: string;
  @ApiProperty() orgId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ["active", "archived"] }) status!: "active" | "archived";
  @ApiProperty() sortOrder!: number;
  /** Divisions currently pointing at this region (all seasons). */
  @ApiProperty() divisionCount!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

class ListRegionsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional({ enum: ["active", "archived"] })
  @IsOptional() @IsIn(["active", "archived"]) status?: "active" | "archived";
}

class CreateRegionBodyDto {
  @ApiProperty() @IsUUID() orgId!: string;
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

class UpdateRegionBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional({ enum: ["active", "archived"] })
  @IsOptional() @IsIn(["active", "archived"]) status?: "active" | "archived";
}

/**
 * Regions: the structural tier between a season and its divisions
 * (PPHL: Org -> Season -> Region -> Division -> Team). One list per org,
 * reused every season; divisions point at a region through
 * `divisions.region_id`. Super admins see every org; scoped users see
 * and manage the regions of their own orgs (404, not 403, outside scope).
 */
@ApiTags("league-management/regions")
@ApiBearerAuth()
@Controller("league/regions")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class RegionsController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private assertOrgInScope(scope: UserScopeType, orgId: string) {
    if (scope.isSuperAdmin) return;
    if (scope.orgIds === null) return;
    if (!scope.orgIds.includes(orgId)) throw new NotFoundException("Organization not found");
  }

  private async load(id: string, scope: UserScopeType) {
    const [r] = await this.db
      .select()
      .from(schema.regions)
      .where(eq(schema.regions.id, id))
      .limit(1);
    if (!r) throw new NotFoundException("Region not found");
    this.assertOrgInScope(scope, r.orgId);
    return r;
  }

  private async toDto(rows: Array<typeof schema.regions.$inferSelect>): Promise<RegionDto[]> {
    if (rows.length === 0) return [];
    const counts = await this.db
      .select({
        regionId: schema.divisions.regionId,
        n: sql<number>`count(*)::int`
      })
      .from(schema.divisions)
      .where(
        and(
          inArray(schema.divisions.regionId, rows.map((r) => r.id)),
          sql`${schema.divisions.deletedAt} IS NULL`
        )
      )
      .groupBy(schema.divisions.regionId);
    const byRegion = new Map(counts.map((c) => [c.regionId, c.n]));
    return rows.map((r) => ({
      id: r.id,
      orgId: r.orgId,
      name: r.name,
      status: r.status as "active" | "archived",
      sortOrder: r.sortOrder,
      divisionCount: byRegion.get(r.id) ?? 0,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    }));
  }

  @Get()
  @ApiOperation({ summary: "List regions, optionally for one org (active only by default)" })
  async list(
    @Query() q: ListRegionsQueryDto,
    @UserScope() scope: UserScopeType
  ): Promise<{ items: RegionDto[] }> {
    const cs = [eq(schema.regions.status, q.status ?? "active")];
    if (q.orgId) {
      this.assertOrgInScope(scope, q.orgId);
      cs.push(eq(schema.regions.orgId, q.orgId));
    } else if (!scope.isSuperAdmin && scope.orgIds !== null) {
      if (scope.orgIds.length === 0) return { items: [] };
      cs.push(inArray(schema.regions.orgId, scope.orgIds));
    }
    const rows = await this.db
      .select()
      .from(schema.regions)
      .where(and(...cs))
      .orderBy(asc(schema.regions.sortOrder), asc(schema.regions.name));
    return { items: await this.toDto(rows) };
  }

  @Post()
  @AllowScopedWrite()
  @ApiOperation({ summary: "Create a region for an org (name unique per org, case-insensitive)" })
  async create(
    @Body() body: CreateRegionBodyDto,
    @UserScope() scope: UserScopeType
  ): Promise<RegionDto> {
    this.assertOrgInScope(scope, body.orgId);
    const name = body.name.trim();
    if (!name) throw new ConflictException("Region name is required");
    const [dup] = await this.db
      .select({ id: schema.regions.id, status: schema.regions.status })
      .from(schema.regions)
      .where(
        and(eq(schema.regions.orgId, body.orgId), sql`lower(${schema.regions.name}) = lower(${name})`)
      )
      .limit(1);
    if (dup) {
      throw new ConflictException(
        dup.status === "archived"
          ? `A region named "${name}" exists but is archived. Restore it instead.`
          : `A region named "${name}" already exists in this organization.`
      );
    }
    const [row] = await this.db
      .insert(schema.regions)
      .values({ orgId: body.orgId, name, sortOrder: body.sortOrder ?? 0 })
      .returning();
    return (await this.toDto([row!]))[0]!;
  }

  @Patch(":id")
  @AllowScopedWrite()
  @ApiOperation({ summary: "Rename, reorder, archive or restore a region" })
  async update(
    @Param("id") id: string,
    @Body() body: UpdateRegionBodyDto,
    @UserScope() scope: UserScopeType
  ): Promise<RegionDto> {
    const r = await this.load(id, scope);
    const name = body.name?.trim();
    if (name !== undefined && !name) throw new ConflictException("Region name is required");
    if (name && name.toLowerCase() !== r.name.toLowerCase()) {
      const [dup] = await this.db
        .select({ id: schema.regions.id })
        .from(schema.regions)
        .where(
          and(eq(schema.regions.orgId, r.orgId), sql`lower(${schema.regions.name}) = lower(${name})`)
        )
        .limit(1);
      if (dup) throw new ConflictException(`A region named "${name}" already exists in this organization.`);
    }
    const [row] = await this.db
      .update(schema.regions)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        updatedAt: new Date()
      })
      .where(eq(schema.regions.id, id))
      .returning();
    return (await this.toDto([row!]))[0]!;
  }

  @Delete(":id")
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Archive a region. Refused while any live division points at it, so nothing is orphaned."
  })
  async archive(@Param("id") id: string, @UserScope() scope: UserScopeType): Promise<RegionDto> {
    const r = await this.load(id, scope);
    const [used] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.divisions)
      .where(and(eq(schema.divisions.regionId, id), sql`${schema.divisions.deletedAt} IS NULL`));
    const n = used?.n ?? 0;
    if (n > 0) {
      throw new ConflictException(
        `${n} division(s) still use this region. Move them to another region first.`
      );
    }
    const [row] = await this.db
      .update(schema.regions)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(schema.regions.id, r.id))
      .returning();
    return (await this.toDto([row!]))[0]!;
  }
}
