import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min
} from "class-validator";

export class CreateLeagueBodyDto {
  @ApiProperty() @IsUUID() orgId!: string;
  @ApiProperty() @IsString() sportCode!: string;
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional({ enum: ["regular", "tournament", "pickup", "friendly"] })
  @IsOptional() @IsIn(["regular", "tournament", "pickup", "friendly"])
  format?: "regular" | "tournament" | "pickup" | "friendly";
  @ApiPropertyOptional() @IsOptional() @IsUUID() governingBodyId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() ruleSetId?: string | null;
  /** JSONB — wizard stores slug, branding (logo, primaryColor), privacy here. */
  @ApiPropertyOptional() @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class UpdateLeagueBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional({ enum: ["regular", "tournament", "pickup", "friendly"] })
  @IsOptional() @IsIn(["regular", "tournament", "pickup", "friendly"])
  format?: string;
  @ApiPropertyOptional() @IsOptional() governingBodyId?: string | null;
  @ApiPropertyOptional() @IsOptional() ruleSetId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class ChangeLeagueStatusBodyDto {
  @ApiProperty({
    enum: [
      "draft",
      "registration_open",
      "in_progress",
      "playoffs",
      "completed",
      "archived"
    ]
  })
  @IsIn([
    "draft",
    "registration_open",
    "in_progress",
    "playoffs",
    "completed",
    "archived"
  ])
  status!: string;
}

export class ListLeaguesQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sportCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}
