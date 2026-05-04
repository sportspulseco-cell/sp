import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min
} from "class-validator";
import {
  GAME_STATUSES,
  SUSPENSION_KINDS
} from "../../domain/value-objects/game-status.vo";

// Games
export class CreateGameBodyDto {
  @ApiProperty() @IsUUID() leagueId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() divisionId?: string | null;
  @ApiProperty() @IsUUID() homeTeamId!: string;
  @ApiProperty() @IsUUID() awayTeamId!: string;
  @ApiProperty() @IsString() sportCode!: string;
  @ApiProperty() @IsDateString() scheduledStartTsUtc!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tz?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(15) @Max(360)
  durationMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() venueName?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() surfaceLabel?: string | null;
}

export class ApplyScoreBodyDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) home!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) away!: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  period?: number;
}

export class ForfeitGameBodyDto {
  @ApiProperty() @IsUUID() winningTeamId!: string;
}

export class ListGamesQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() leagueId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() divisionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() teamId?: string;
  @ApiPropertyOptional({ enum: GAME_STATUSES })
  @IsOptional() @IsIn(GAME_STATUSES as unknown as string[])
  status?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() fromTs?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() toTs?: string;
}

// Game events
export class AppendEventBodyDto {
  @ApiProperty() @IsUUID() gameId!: string;
  @ApiProperty() @IsString() eventType!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() tsUtc?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() period?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() clockRemainingSec?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() teamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() primaryPersonId?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() secondaryPersonIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsObject() attributes?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() idempotencyKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() correctionOfEventId?: string;
}

export class ListEventsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() gameId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() eventType?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() primaryPersonId?: string;
}

// Suspensions
export class IssueSuspensionBodyDto {
  @ApiProperty() @IsUUID() personId!: string;
  @ApiProperty({ enum: SUSPENSION_KINDS })
  @IsIn(SUSPENSION_KINDS as unknown as string[])
  kind!: (typeof SUSPENSION_KINDS)[number];
  @ApiPropertyOptional() @IsOptional() @IsUUID() sourceEventId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  nGames?: number | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  nDays?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string | null;
}

export class LiftSuspensionBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class ListSuspensionsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() personId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
}
