import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min
} from "class-validator";

const CHANNELS = ["email", "sms", "in_app"] as const;

export class ListTemplatesQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional({ enum: CHANNELS })
  @IsOptional()
  @IsIn(CHANNELS as unknown as string[])
  channel?: (typeof CHANNELS)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() locale?: string;
}

export class UpsertTemplateBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string | null;
  @ApiProperty() @IsString() code!: string;
  @ApiProperty({ enum: CHANNELS })
  @IsIn(CHANNELS as unknown as string[])
  channel!: (typeof CHANNELS)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() locale?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string | null;
  @ApiProperty() @IsString() bodyTemplate!: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
