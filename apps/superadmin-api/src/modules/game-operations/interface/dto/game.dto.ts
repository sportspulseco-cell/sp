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
  Matches,
  Max,
  MaxLength,
  Min
} from "class-validator";
import { GAME_ENDINGS } from "@sportspulse/kernel";
import { Transform } from "class-transformer";
import {
  GAME_STATUSES,
  SUSPENSION_KINDS
} from "../../domain/value-objects/game-status.vo";

// Games
export class CreateGameBodyDto {
  @ApiProperty() @IsUUID() leagueId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() seasonId?: string | null;
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
  /**
   * Show the game on team schedules now (SCH-7). Omitted or false keeps
   * it as a draft that only admins and officials see until Publish.
   */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() publish?: boolean;
}

export class FinalizeGameBodyDto {
  /**
   * How the game ended. Required when the score is not tied, so
   * standings can tell an overtime or shootout loss from a regulation
   * loss (kernel checkFinalResult).
   */
  @ApiPropertyOptional({ enum: GAME_ENDINGS })
  @IsOptional()
  @IsIn(GAME_ENDINGS as unknown as string[])
  endedIn?: (typeof GAME_ENDINGS)[number];
}

export class RescheduleGameBodyDto {
  /** New start as rink-local wall time "YYYY-MM-DDTHH:MM". Omit to keep the time. */
  @ApiPropertyOptional({ example: "2026-11-07T20:00" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, { message: "startLocal must look like 2026-11-07T20:00" })
  startLocal?: string;
  /** Rink (surface) to move to. Omit to keep the rink. */
  @ApiPropertyOptional() @IsOptional() @IsUUID() surfaceId?: string;
  /** Apply even when the move clashes with another game; needs a reason. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() force?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ReschedulePreviewQueryDto {
  @ApiPropertyOptional({ example: "2026-11-07T20:00" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, { message: "startLocal must look like 2026-11-07T20:00" })
  startLocal?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() surfaceId?: string;
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
  /**
   * When true, restrict to games with `published_at IS NOT NULL`.
   * Consumer apps (player-web, team-admin-web) pass this so a captain
   * never sees draft fixtures the admin hasn't released yet.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  publishedOnly?: boolean;
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
  @IsOptional() @IsArray() @IsUUID("all", { each: true }) secondaryPersonIds?: string[];
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
