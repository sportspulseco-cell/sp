import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
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
import {
  MEMBERSHIP_TYPES,
  MOVE_TYPES
} from "../../domain/value-objects/move-type.vo";

export class MoveBodyDto {
  @ApiProperty() @IsUUID() teamId!: string;
  @ApiProperty() @IsUUID() personId!: string;
  @ApiProperty() @IsUUID() seasonId!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveAt?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(999)
  jerseyNumber?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(8)
  positionCode?: string | null;
  @ApiPropertyOptional({ enum: MEMBERSHIP_TYPES })
  @IsOptional() @IsIn(MEMBERSHIP_TYPES as unknown as string[])
  membershipType?: (typeof MEMBERSHIP_TYPES)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string | null;
  @ApiPropertyOptional({ description: "Idempotency key" })
  @IsOptional() @IsString()
  sourceEventId?: string | null;
}

export class TradeBodyDto {
  @ApiProperty() @IsUUID() fromTeamId!: string;
  @ApiProperty() @IsUUID() toTeamId!: string;
  @ApiProperty() @IsUUID() personId!: string;
  @ApiProperty() @IsUUID() seasonId!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveAt?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(999)
  jerseyNumber?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() positionCode?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceEventId?: string | null;
}

export class ListMovesQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() teamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() personId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() seasonId?: string;
  @ApiPropertyOptional({ enum: MOVE_TYPES })
  @IsOptional() @IsIn(MOVE_TYPES as unknown as string[])
  moveType?: string;
}

export class ListMembershipsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() teamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() personId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() seasonId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  activeOnly?: boolean;
}

export class RosterSnapshotQueryDto {
  @ApiProperty() @IsUUID() teamId!: string;
  @ApiProperty() @IsUUID() seasonId!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() asOf?: string;
}
