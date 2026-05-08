import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";

interface GoverningBodyDto {
  id: string;
  code: string;
  name: string;
  sportCode: string;
  countryCode: string | null;
  scope: string;
  parentId: string | null;
}

interface AgeGroupDto {
  id: string;
  governingBodyId: string;
  code: string;
  label: string;
  birthYearMin: number | null;
  birthYearMax: number | null;
  genderEligibility: string;
}

/**
 * Reference data for the org-setup wizard's dropdowns. Read-only —
 * governing bodies + age groups are seed data managed by platform
 * super-admins through migrations / scripts, not user-editable here.
 */
@ApiTags("league-management/reference")
@ApiBearerAuth()
@Controller("league")
@UseGuards(JwtAuthGuard)
export class LeagueReferenceController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get("governing-bodies")
  @ApiOperation({ summary: "List governing bodies, optionally filtered by sport" })
  async listGoverningBodies(
    @Query("sportCode") sportCode?: string
  ): Promise<GoverningBodyDto[]> {
    const rows = sportCode
      ? await this.db
          .select()
          .from(schema.governingBodies)
          .where(eq(schema.governingBodies.sportCode, sportCode))
      : await this.db.select().from(schema.governingBodies);

    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      sportCode: r.sportCode,
      countryCode: r.countryCode,
      scope: r.scope,
      parentId: r.parentId
    }));
  }

  @Get("age-groups")
  @ApiOperation({ summary: "List age groups for a governing body" })
  async listAgeGroups(
    @Query("governingBodyId") governingBodyId?: string
  ): Promise<AgeGroupDto[]> {
    const rows = governingBodyId
      ? await this.db
          .select()
          .from(schema.ageGroups)
          .where(eq(schema.ageGroups.governingBodyId, governingBodyId))
      : await this.db.select().from(schema.ageGroups);

    return rows.map((r) => ({
      id: r.id,
      governingBodyId: r.governingBodyId,
      code: r.code,
      label: r.label,
      birthYearMin: r.birthYearMin,
      birthYearMax: r.birthYearMax,
      genderEligibility: r.genderEligibility
    }));
  }
}
