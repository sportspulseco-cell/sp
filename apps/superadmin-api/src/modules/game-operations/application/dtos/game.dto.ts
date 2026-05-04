import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { Game } from "../../domain/entities/game.entity";
import type { GameEvent } from "../../domain/entities/game-event.entity";
import type { Suspension } from "../../domain/entities/suspension.entity";
import {
  GAME_STATUSES,
  SUSPENSION_KINDS,
  SUSPENSION_STATUSES
} from "../../domain/value-objects/game-status.vo";

export class GameDto {
  @ApiProperty() id!: string;
  @ApiProperty() leagueId!: string;
  @ApiPropertyOptional({ nullable: true }) divisionId!: string | null;
  @ApiProperty() homeTeamId!: string;
  @ApiProperty() awayTeamId!: string;
  @ApiProperty() sportCode!: string;
  @ApiProperty() scheduledStartTsUtc!: string;
  @ApiProperty() tz!: string;
  @ApiProperty() durationMin!: number;
  @ApiPropertyOptional({ nullable: true }) venueName!: string | null;
  @ApiPropertyOptional({ nullable: true }) surfaceLabel!: string | null;
  @ApiProperty({ enum: GAME_STATUSES }) status!: (typeof GAME_STATUSES)[number];
  @ApiProperty() homeScore!: number;
  @ApiProperty() awayScore!: number;
  @ApiProperty() period!: number;
  @ApiPropertyOptional({ nullable: true }) finalizedAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromDomain(g: Game): GameDto {
    const x = g.toSnapshot();
    return {
      id: x.id,
      leagueId: x.leagueId,
      divisionId: x.divisionId,
      homeTeamId: x.homeTeamId,
      awayTeamId: x.awayTeamId,
      sportCode: x.sportCode,
      scheduledStartTsUtc: x.scheduledStartTsUtc.toISOString(),
      tz: x.tz,
      durationMin: x.durationMin,
      venueName: x.venueName,
      surfaceLabel: x.surfaceLabel,
      status: x.status,
      homeScore: x.homeScore,
      awayScore: x.awayScore,
      period: x.period,
      finalizedAt: x.finalizedAt?.toISOString() ?? null,
      createdAt: x.createdAt.toISOString(),
      updatedAt: x.updatedAt.toISOString()
    };
  }
}

export class GamePageDto {
  @ApiProperty({ type: [GameDto] }) items!: GameDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class GameEventDto {
  @ApiProperty() id!: string;
  @ApiProperty() gameId!: string;
  @ApiProperty() sportCode!: string;
  @ApiProperty() eventType!: string;
  @ApiProperty() tsUtc!: string;
  @ApiPropertyOptional({ nullable: true }) period!: number | null;
  @ApiPropertyOptional({ nullable: true }) clockRemainingSec!: number | null;
  @ApiPropertyOptional({ nullable: true }) teamId!: string | null;
  @ApiPropertyOptional({ nullable: true }) primaryPersonId!: string | null;
  @ApiProperty({ type: [String] }) secondaryPersonIds!: string[];
  @ApiProperty() attributes!: Record<string, unknown>;
  @ApiProperty() source!: string;
  @ApiPropertyOptional({ nullable: true }) idempotencyKey!: string | null;
  @ApiPropertyOptional({ nullable: true }) correctionOfEventId!: string | null;
  @ApiProperty() createdAt!: string;

  static fromDomain(e: GameEvent): GameEventDto {
    const x = e.toSnapshot();
    return {
      id: x.id,
      gameId: x.gameId,
      sportCode: x.sportCode,
      eventType: x.eventType,
      tsUtc: x.tsUtc.toISOString(),
      period: x.period,
      clockRemainingSec: x.clockRemainingSec,
      teamId: x.teamId,
      primaryPersonId: x.primaryPersonId,
      secondaryPersonIds: x.secondaryPersonIds,
      attributes: x.attributes,
      source: x.source,
      idempotencyKey: x.idempotencyKey,
      correctionOfEventId: x.correctionOfEventId,
      createdAt: x.createdAt.toISOString()
    };
  }
}

export class GameEventPageDto {
  @ApiProperty({ type: [GameEventDto] }) items!: GameEventDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class SuspensionDto {
  @ApiProperty() id!: string;
  @ApiProperty() personId!: string;
  @ApiPropertyOptional({ nullable: true }) sourceEventId!: string | null;
  @ApiProperty({ enum: SUSPENSION_KINDS })
  kind!: (typeof SUSPENSION_KINDS)[number];
  @ApiPropertyOptional({ nullable: true }) nGames!: number | null;
  @ApiPropertyOptional({ nullable: true }) nDays!: number | null;
  @ApiProperty() servedCount!: number;
  @ApiProperty({ enum: SUSPENSION_STATUSES })
  status!: (typeof SUSPENSION_STATUSES)[number];
  @ApiPropertyOptional({ nullable: true }) reason!: string | null;
  @ApiProperty() startAt!: string;
  @ApiPropertyOptional({ nullable: true }) endAt!: string | null;

  static fromDomain(s: Suspension): SuspensionDto {
    const x = s.toSnapshot();
    return {
      id: x.id,
      personId: x.personId,
      sourceEventId: x.sourceEventId,
      kind: x.kind,
      nGames: x.nGames,
      nDays: x.nDays,
      servedCount: x.servedCount,
      status: x.status,
      reason: x.reason,
      startAt: x.startAt.toISOString(),
      endAt: x.endAt?.toISOString() ?? null
    };
  }
}

export class SuspensionPageDto {
  @ApiProperty({ type: [SuspensionDto] }) items!: SuspensionDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}
