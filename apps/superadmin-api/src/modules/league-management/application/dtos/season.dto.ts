import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { Season } from "../../domain/entities/season.entity";
import { SEASON_STATUSES } from "../../domain/value-objects/season-status.vo";

export class SeasonDto {
  @ApiProperty() id!: string;
  @ApiProperty() leagueId!: string;
  @ApiProperty() orgId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() sportCode!: string;
  @ApiProperty() startDate!: string;
  @ApiProperty() endDate!: string;
  @ApiPropertyOptional({ nullable: true }) registrationOpensAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) registrationClosesAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) rosterLockAt!: string | null;
  @ApiProperty() timezone!: string;
  @ApiProperty({ enum: SEASON_STATUSES }) status!: (typeof SEASON_STATUSES)[number];
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromDomain(s: Season): SeasonDto {
    const x = s.toSnapshot();
    return {
      id: x.id,
      leagueId: x.leagueId,
      orgId: x.orgId,
      name: x.name,
      sportCode: x.sportCode,
      startDate: x.startDate,
      endDate: x.endDate,
      registrationOpensAt: x.registrationOpensAt?.toISOString() ?? null,
      registrationClosesAt: x.registrationClosesAt?.toISOString() ?? null,
      rosterLockAt: x.rosterLockAt?.toISOString() ?? null,
      timezone: x.timezone,
      status: x.status,
      createdAt: x.createdAt.toISOString(),
      updatedAt: x.updatedAt.toISOString()
    };
  }
}

export class SeasonPageDto {
  @ApiProperty({ type: [SeasonDto] }) items!: SeasonDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}
