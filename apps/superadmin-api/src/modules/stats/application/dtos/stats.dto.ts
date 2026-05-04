import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type {
  LeaderboardRow,
  StandingRow,
  StatLineRow
} from "../../domain/repositories/stats.repository";

export class StatLineDto {
  @ApiProperty() id!: string;
  @ApiProperty() gameId!: string;
  @ApiProperty() personId!: string;
  @ApiProperty() teamId!: string;
  @ApiProperty() sportCode!: string;
  @ApiPropertyOptional({ nullable: true }) seasonId!: string | null;
  @ApiPropertyOptional({ nullable: true }) leagueId!: string | null;
  @ApiPropertyOptional({ nullable: true }) divisionId!: string | null;
  @ApiProperty() gpIncrement!: number;
  @ApiPropertyOptional({ nullable: true }) minutesPlayed!: number | null;
  @ApiProperty() core!: Record<string, number>;
  @ApiProperty() extended!: Record<string, unknown>;
  @ApiProperty() derivedAt!: string;

  static fromRow(r: StatLineRow): StatLineDto {
    return {
      id: r.id,
      gameId: r.gameId,
      personId: r.personId,
      teamId: r.teamId,
      sportCode: r.sportCode,
      seasonId: r.seasonId,
      leagueId: r.leagueId,
      divisionId: r.divisionId,
      gpIncrement: r.gpIncrement,
      minutesPlayed: r.minutesPlayed,
      core: r.core,
      extended: r.extended,
      derivedAt: r.derivedAt.toISOString()
    };
  }
}

export class StatLinePageDto {
  @ApiProperty({ type: [StatLineDto] }) items!: StatLineDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class StandingDto {
  @ApiProperty() id!: string;
  @ApiProperty() leagueId!: string;
  @ApiPropertyOptional({ nullable: true }) divisionId!: string | null;
  @ApiProperty() teamId!: string;
  @ApiProperty() gp!: number;
  @ApiProperty() w!: number;
  @ApiProperty() l!: number;
  @ApiProperty() t!: number;
  @ApiProperty() otl!: number;
  @ApiProperty() points!: number;
  @ApiProperty() gf!: number;
  @ApiProperty() ga!: number;
  @ApiProperty() gd!: number;
  @ApiPropertyOptional({ nullable: true }) rank!: number | null;
  @ApiProperty() derivedAt!: string;

  static fromRow(r: StandingRow): StandingDto {
    return {
      id: r.id,
      leagueId: r.leagueId,
      divisionId: r.divisionId,
      teamId: r.teamId,
      gp: r.gp,
      w: r.w,
      l: r.l,
      t: r.t,
      otl: r.otl,
      points: r.points,
      gf: r.gf,
      ga: r.ga,
      gd: r.gd,
      rank: r.rank,
      derivedAt: r.derivedAt.toISOString()
    };
  }
}

export class LeaderboardDto {
  @ApiProperty() id!: string;
  @ApiProperty() scopeType!: string;
  @ApiPropertyOptional({ nullable: true }) scopeId!: string | null;
  @ApiProperty() metric!: string;
  @ApiProperty() windowKind!: string;
  @ApiProperty() sportCode!: string;
  @ApiProperty() entries!: LeaderboardRow["entries"];
  @ApiProperty() rankedAt!: string;

  static fromRow(r: LeaderboardRow): LeaderboardDto {
    return {
      id: r.id,
      scopeType: r.scopeType,
      scopeId: r.scopeId,
      metric: r.metric,
      windowKind: r.windowKind,
      sportCode: r.sportCode,
      entries: r.entries,
      rankedAt: r.rankedAt.toISOString()
    };
  }
}
