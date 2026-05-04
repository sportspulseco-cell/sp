import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { Team } from "../../domain/entities/team.entity";

export class TeamDto {
  @ApiProperty() id!: string;
  @ApiProperty() orgId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) shortName!: string | null;
  @ApiProperty() sportCode!: string;
  @ApiPropertyOptional({ nullable: true }) logoUrl!: string | null;
  @ApiProperty({ enum: ["active", "dissolved"] }) status!: "active" | "dissolved";
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromDomain(t: Team): TeamDto {
    const x = t.toSnapshot();
    return {
      id: x.id,
      orgId: x.orgId,
      name: x.name,
      shortName: x.shortName,
      sportCode: x.sportCode,
      logoUrl: x.logoUrl,
      status: x.status,
      createdAt: x.createdAt.toISOString(),
      updatedAt: x.updatedAt.toISOString()
    };
  }
}

export class TeamPageDto {
  @ApiProperty({ type: [TeamDto] }) items!: TeamDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}
