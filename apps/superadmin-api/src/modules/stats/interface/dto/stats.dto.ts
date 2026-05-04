import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min
} from "class-validator";

export class ListStatLinesQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() personId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() teamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() leagueId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() seasonId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() gameId?: string;
}

export class ProjectStatsBodyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  allowInProgress?: boolean;
}

export class RecomputeStandingsBodyDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() ppw?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() ppl?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() ppt?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() ppotl?: number;
}

export class ListStandingsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() divisionId?: string;
}

export class BuildLeaderboardBodyDto {
  @ApiProperty({ enum: ["platform", "org", "league", "division"] })
  @IsIn(["platform", "org", "league", "division"])
  scopeType!: "platform" | "org" | "league" | "division";
  @ApiPropertyOptional() @IsOptional() @IsUUID() scopeId?: string | null;
  @ApiProperty({ description: "core metric key (e.g. goals, points, saves, runs)" })
  @IsString()
  metric!: string;
  @ApiPropertyOptional({ enum: ["season", "last_n", "all_time"] })
  @IsOptional() @IsIn(["season", "last_n", "all_time"])
  windowKind?: "season" | "last_n" | "all_time";
  @ApiProperty() @IsString() sportCode!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  topN?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() leagueId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() divisionId?: string;
}
