import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min
} from "class-validator";
import { ORG_TYPES } from "../../domain/value-objects/org-status.vo";

export class CreateOrgBodyDto {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9-]{2,60}$/) slug!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(160) legalName!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) displayName!: string;
  @ApiProperty({ enum: ORG_TYPES }) @IsIn(ORG_TYPES as unknown as string[])
  orgType!: (typeof ORG_TYPES)[number];
  @ApiProperty({ description: "ISO-3166-1 alpha-2" }) @IsString() @Length(2, 2)
  countryCode!: string;
  @ApiProperty() @IsString() defaultLocale!: string;
  @ApiProperty({ description: "ISO-4217" }) @IsString() @Length(3, 3) defaultCurrency!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultTimezone?: string;
}

export class UpdateOrgBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) legalName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) displayName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 2) countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultLocale?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3, 3) defaultCurrency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultTimezone?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() branding?: Record<string, unknown>;
}

export class ListOrgsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() orgType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

export class LinkOrgsBodyDto {
  @ApiProperty() @IsUUID() parentOrgId!: string;
  @ApiProperty() @IsUUID() childOrgId!: string;
  @ApiProperty({ enum: ["sanctions", "member_of", "owns"] })
  @IsIn(["sanctions", "member_of", "owns"])
  relation!: "sanctions" | "member_of" | "owns";
}

export class IssueCrossOrgGrantBodyDto {
  @ApiProperty() @IsUUID() userId!: string;
  @ApiProperty() @IsUUID() fromOrgId!: string;
  @ApiProperty() @IsUUID() toOrgId!: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() permissions?: string[];
}
