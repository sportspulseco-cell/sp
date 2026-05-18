import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { Division } from "../../domain/entities/division.entity";

export class DivisionDto {
  @ApiProperty() id!: string;
  @ApiProperty() seasonId!: string;
  @ApiPropertyOptional({ nullable: true }) ageGroupId!: string | null;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) tier!: string | null;
  @ApiProperty({ enum: ["male", "female", "mixed", "open"] })
  genderEligibility!: "male" | "female" | "mixed" | "open";
  @ApiPropertyOptional({ nullable: true }) maxTeams!: number | null;
  /**
   * JSONB knobs written by /org-setup Phase 3 (DivisionDetail wizard).
   * Conventional shape: { gameRules, tiebreakers, ageRange }.
   * Kept as Record<string, unknown> so additive schema changes don't
   * require a DTO bump.
   */
  @ApiProperty() ruleSetOverrides!: Record<string, unknown>;
  /**
   * Post-season config written by /org-setup Phase 3. Shape:
   * { enabled, playoffSpots, startDate, endDate, seriesFormat,
   *   bracketType, homeIceRule }.
   */
  @ApiProperty() playoffConfig!: Record<string, unknown>;
  @ApiProperty({ enum: ["active", "archived"] }) status!: "active" | "archived";
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromDomain(d: Division): DivisionDto {
    const x = d.toSnapshot();
    return {
      id: x.id,
      seasonId: x.seasonId,
      ageGroupId: x.ageGroupId,
      name: x.name,
      tier: x.tier,
      genderEligibility: x.genderEligibility,
      maxTeams: x.maxTeams,
      ruleSetOverrides: x.ruleSetOverrides,
      playoffConfig: x.playoffConfig,
      status: x.status,
      createdAt: x.createdAt.toISOString(),
      updatedAt: x.updatedAt.toISOString()
    };
  }
}

export class DivisionPageDto {
  @ApiProperty({ type: [DivisionDto] }) items!: DivisionDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}
