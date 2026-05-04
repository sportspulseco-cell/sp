import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { League } from "../../domain/entities/league.entity";
import {
  LEAGUE_FORMATS,
  LEAGUE_STATUSES
} from "../../domain/value-objects/league-status.vo";

export class LeagueDto {
  @ApiProperty() id!: string;
  @ApiProperty() seasonId!: string;
  @ApiProperty() sportCode!: string;
  @ApiPropertyOptional({ nullable: true }) governingBodyId!: string | null;
  @ApiPropertyOptional({ nullable: true }) ruleSetId!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: LEAGUE_FORMATS }) format!: (typeof LEAGUE_FORMATS)[number];
  @ApiProperty({ enum: LEAGUE_STATUSES }) status!: (typeof LEAGUE_STATUSES)[number];
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromDomain(l: League): LeagueDto {
    const x = l.toSnapshot();
    return {
      id: x.id,
      seasonId: x.seasonId,
      sportCode: x.sportCode,
      governingBodyId: x.governingBodyId,
      ruleSetId: x.ruleSetId,
      name: x.name,
      format: x.format,
      status: x.status,
      createdAt: x.createdAt.toISOString(),
      updatedAt: x.updatedAt.toISOString()
    };
  }
}

export class LeaguePageDto {
  @ApiProperty({ type: [LeagueDto] }) items!: LeagueDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}
