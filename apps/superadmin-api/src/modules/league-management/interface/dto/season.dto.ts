import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min
} from "class-validator";

export class CreateSeasonBodyDto {
  /** Post-flip — seasons live under a league. */
  @ApiProperty() @IsUUID() leagueId!: string;
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiProperty() @IsString() sportCode!: string;
  @ApiProperty({ description: "ISO date YYYY-MM-DD" }) @IsDateString() startDate!: string;
  @ApiProperty({ description: "ISO date YYYY-MM-DD" }) @IsDateString() endDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;
}

export class UpdateSeasonBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;
  @ApiPropertyOptional() @IsOptional() registrationOpensAt?: string | null;
  @ApiPropertyOptional() @IsOptional() registrationClosesAt?: string | null;
  @ApiPropertyOptional() @IsOptional() rosterLockAt?: string | null;
}

export class ChangeSeasonStatusBodyDto {
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

export class ListSeasonsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() leagueId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sportCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}
