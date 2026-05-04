import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min
} from "class-validator";

export class CreatePersonBodyDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) legalFirstName!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) legalLastName!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() userId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) preferredName?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dobDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() genderSelfId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() pronouns?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 2) countryCode?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() photoUrl?: string | null;
}

export class UpdatePersonBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) legalFirstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) legalLastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) preferredName?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dobDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() genderSelfId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() pronouns?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 2) countryCode?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() photoUrl?: string | null;
}

export class LinkPersonUserBodyDto {
  @ApiProperty() @IsUUID() userId!: string;
}

export class ListPersonsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  hasUserAccount?: boolean;
}
