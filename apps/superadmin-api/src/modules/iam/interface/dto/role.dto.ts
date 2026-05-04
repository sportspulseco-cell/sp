import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
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

const SCOPE_TYPES = [
  "platform",
  "org",
  "league",
  "season",
  "division",
  "team",
  "game"
] as const;

export class ListRolesQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Boolean) @IsBoolean()
  isSystem?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

export class CreateRoleBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string | null;
  @ApiProperty() @IsString() @MaxLength(64) code!: string;
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class UpdateRoleBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class ListAssignmentsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() roleId?: string;
  @ApiPropertyOptional({ enum: SCOPE_TYPES })
  @IsOptional()
  @IsIn(SCOPE_TYPES as unknown as string[])
  scopeType?: (typeof SCOPE_TYPES)[number];
  @ApiPropertyOptional() @IsOptional() @IsUUID() scopeId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Boolean) @IsBoolean()
  activeOnly?: boolean;
}

export class AssignRoleBodyDto {
  @ApiProperty() @IsUUID() userId!: string;
  @ApiProperty() @IsUUID() roleId!: string;
  @ApiProperty({ enum: SCOPE_TYPES })
  @IsIn(SCOPE_TYPES as unknown as string[])
  scopeType!: (typeof SCOPE_TYPES)[number];
  @ApiPropertyOptional() @IsOptional() @IsUUID() scopeId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveFrom?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveTo?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
