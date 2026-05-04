import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min
} from "class-validator";

export class CreateDivisionBodyDto {
  @ApiProperty() @IsUUID() leagueId!: string;
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tier?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() ageGroupId?: string | null;
  @ApiPropertyOptional({ enum: ["male", "female", "mixed", "open"] })
  @IsOptional() @IsIn(["male", "female", "mixed", "open"])
  genderEligibility?: "male" | "female" | "mixed" | "open";
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(2)
  maxTeams?: number | null;
}

export class UpdateDivisionBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() tier?: string | null;
  @ApiPropertyOptional() @IsOptional() ageGroupId?: string | null;
  @ApiPropertyOptional({ enum: ["male", "female", "mixed", "open"] })
  @IsOptional() @IsIn(["male", "female", "mixed", "open"])
  genderEligibility?: "male" | "female" | "mixed" | "open";
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(2)
  maxTeams?: number | null;
}

export class ListDivisionsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() leagueId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}
