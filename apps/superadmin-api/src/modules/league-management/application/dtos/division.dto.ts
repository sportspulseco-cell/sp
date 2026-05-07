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
