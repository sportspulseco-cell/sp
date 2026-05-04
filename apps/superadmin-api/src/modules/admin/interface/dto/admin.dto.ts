import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  Allow,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min
} from "class-validator";

export class UpsertSettingBodyDto {
  @ApiProperty() @IsString() key!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiProperty() @Allow() value!: unknown;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isEditable?: boolean;
}

export class UpsertFlagBodyDto {
  @ApiProperty() @IsString() key!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isEnabled?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  rolloutPct?: number;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  orgAllowlist?: string[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  variants?: Array<{ name: string; weight?: number; payload?: unknown }>;
}

export class UpdateSportBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  teamSizeDefault?: number | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  scoringModel?: Record<string, unknown>;
}

export class ListSettingsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
}
