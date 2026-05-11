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

export class CreateTeamBodyDto {
  @ApiProperty() @IsUUID() orgId!: string;
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiProperty() @IsString() sportCode!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20)
  shortName?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() colors?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120)
  homeRink?: string | null;
  /** Optional initial captain — creates team + captain role in one tx. */
  @ApiPropertyOptional() @IsOptional() @IsUUID() captainUserId?: string;
  /** Minimum deposit cents to flip a division entry to confirmed. 0 = auto. */
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  confirmationThresholdCents?: number;
}

export class UpdateTeamBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() shortName?: string | null;
  @ApiPropertyOptional() @IsOptional() logoUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() colors?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120)
  homeRink?: string | null;
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  confirmationThresholdCents?: number;
}

export class AssignCaptainBodyDto {
  @ApiProperty() @IsUUID() userId!: string;
}

export class SetTeamStatusBodyDto {
  @ApiProperty({ enum: ["active", "dissolved"] })
  @IsString() @IsIn(["active", "dissolved"])
  status!: "active" | "dissolved";
}

export class ListTeamsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sportCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}
