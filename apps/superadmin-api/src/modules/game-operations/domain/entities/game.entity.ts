import { AggregateRoot, DomainError } from "@sportspulse/kernel";
import { GameId } from "../identifiers";
import {
  type GameStatus,
  assertGameStatus,
  canTransitionGame
} from "../value-objects/game-status.vo";

export interface GameSnapshot {
  id: string;
  leagueId: string;
  divisionId: string | null;
  homeTeamId: string;
  awayTeamId: string;
  sportCode: string;
  scheduledStartTsUtc: Date;
  tz: string;
  durationMin: number;
  venueName: string | null;
  surfaceLabel: string | null;
  status: GameStatus;
  homeScore: number;
  awayScore: number;
  period: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  finalizedAt: Date | null;
  finalizedByUserId: string | null;
}

export class Game extends AggregateRoot<GameId> {
  private constructor(
    id: GameId,
    private readonly _leagueId: string,
    private _divisionId: string | null,
    private readonly _homeTeamId: string,
    private readonly _awayTeamId: string,
    private readonly _sportCode: string,
    private _scheduledStartTsUtc: Date,
    private _tz: string,
    private _durationMin: number,
    private _venueName: string | null,
    private _surfaceLabel: string | null,
    private _status: GameStatus,
    private _homeScore: number,
    private _awayScore: number,
    private _period: number,
    private _metadata: Record<string, unknown>,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
    private _finalizedAt: Date | null,
    private _finalizedByUserId: string | null
  ) {
    super(id);
  }

  static create(input: {
    id: GameId;
    leagueId: string;
    divisionId?: string | null;
    homeTeamId: string;
    awayTeamId: string;
    sportCode: string;
    scheduledStartTsUtc: Date;
    tz?: string;
    durationMin?: number;
    venueName?: string | null;
    surfaceLabel?: string | null;
  }): Game {
    if (input.homeTeamId === input.awayTeamId) {
      throw new DomainError(
        "GAME_SELF_PLAY",
        "A team cannot play itself"
      );
    }
    const now = new Date();
    return new Game(
      input.id,
      input.leagueId,
      input.divisionId ?? null,
      input.homeTeamId,
      input.awayTeamId,
      input.sportCode,
      input.scheduledStartTsUtc,
      input.tz ?? "UTC",
      input.durationMin ?? 60,
      input.venueName ?? null,
      input.surfaceLabel ?? null,
      "scheduled",
      0,
      0,
      0,
      {},
      now,
      now,
      null,
      null
    );
  }

  static rehydrate(s: GameSnapshot): Game {
    return new Game(
      GameId.of(s.id),
      s.leagueId,
      s.divisionId,
      s.homeTeamId,
      s.awayTeamId,
      s.sportCode,
      s.scheduledStartTsUtc,
      s.tz,
      s.durationMin,
      s.venueName,
      s.surfaceLabel,
      assertGameStatus(s.status),
      s.homeScore,
      s.awayScore,
      s.period,
      s.metadata,
      s.createdAt,
      s.updatedAt,
      s.finalizedAt,
      s.finalizedByUserId
    );
  }

  // ---------- behavior ----------

  reschedule(at: Date, tz?: string): void {
    if (this._status === "completed" || this._status === "cancelled") {
      throw new DomainError(
        "GAME_TERMINAL",
        `Cannot reschedule a ${this._status} game`
      );
    }
    this._scheduledStartTsUtc = at;
    if (tz) this._tz = tz;
    this._touch();
  }

  setVenue(venueName: string | null, surfaceLabel?: string | null): void {
    this._venueName = venueName;
    if (surfaceLabel !== undefined) this._surfaceLabel = surfaceLabel;
    this._touch();
  }

  startPlay(): void {
    if (!canTransitionGame(this._status, "in_play")) {
      throw new DomainError(
        "INVALID_GAME_TRANSITION",
        `Cannot start play from ${this._status}`
      );
    }
    this._status = "in_play";
    if (this._period === 0) this._period = 1;
    this._touch();
  }

  applyScore(home: number, away: number, period?: number): void {
    if (this._status !== "in_play") {
      throw new DomainError(
        "GAME_NOT_IN_PLAY",
        "Score updates only allowed while in play"
      );
    }
    if (home < 0 || away < 0) {
      throw new DomainError("INVALID_SCORE", "Scores must be non-negative");
    }
    this._homeScore = home;
    this._awayScore = away;
    if (period !== undefined) this._period = period;
    this._touch();
  }

  postpone(): void {
    if (!canTransitionGame(this._status, "postponed")) {
      throw new DomainError(
        "INVALID_GAME_TRANSITION",
        `Cannot postpone from ${this._status}`
      );
    }
    this._status = "postponed";
    this._touch();
  }

  cancel(): void {
    if (!canTransitionGame(this._status, "cancelled")) {
      throw new DomainError(
        "INVALID_GAME_TRANSITION",
        `Cannot cancel from ${this._status}`
      );
    }
    this._status = "cancelled";
    this._touch();
  }

  forfeit(winningTeamId: string): void {
    if (
      winningTeamId !== this._homeTeamId &&
      winningTeamId !== this._awayTeamId
    ) {
      throw new DomainError(
        "INVALID_FORFEIT_WINNER",
        "Winning team must be home or away"
      );
    }
    if (!canTransitionGame(this._status, "forfeited")) {
      throw new DomainError(
        "INVALID_GAME_TRANSITION",
        `Cannot forfeit from ${this._status}`
      );
    }
    this._status = "forfeited";
    if (winningTeamId === this._homeTeamId) {
      this._homeScore = Math.max(this._homeScore, 1);
      this._awayScore = 0;
    } else {
      this._awayScore = Math.max(this._awayScore, 1);
      this._homeScore = 0;
    }
    this._touch();
  }

  finalize(byUserId: string): void {
    if (!canTransitionGame(this._status, "completed")) {
      throw new DomainError(
        "INVALID_GAME_TRANSITION",
        `Cannot finalize from ${this._status}`
      );
    }
    this._status = "completed";
    this._finalizedAt = new Date();
    this._finalizedByUserId = byUserId;
    this._touch();
  }

  private _touch(): void {
    this._updatedAt = new Date();
  }

  // ---------- accessors ----------

  get leagueId(): string { return this._leagueId; }
  get divisionId(): string | null { return this._divisionId; }
  get homeTeamId(): string { return this._homeTeamId; }
  get awayTeamId(): string { return this._awayTeamId; }
  get sportCode(): string { return this._sportCode; }
  get scheduledStartTsUtc(): Date { return this._scheduledStartTsUtc; }
  get tz(): string { return this._tz; }
  get durationMin(): number { return this._durationMin; }
  get venueName(): string | null { return this._venueName; }
  get surfaceLabel(): string | null { return this._surfaceLabel; }
  get status(): GameStatus { return this._status; }
  get homeScore(): number { return this._homeScore; }
  get awayScore(): number { return this._awayScore; }
  get period(): number { return this._period; }
  get metadata(): Record<string, unknown> { return this._metadata; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }
  get finalizedAt(): Date | null { return this._finalizedAt; }
  get finalizedByUserId(): string | null { return this._finalizedByUserId; }

  toSnapshot(): GameSnapshot {
    return {
      id: this.id.value,
      leagueId: this._leagueId,
      divisionId: this._divisionId,
      homeTeamId: this._homeTeamId,
      awayTeamId: this._awayTeamId,
      sportCode: this._sportCode,
      scheduledStartTsUtc: this._scheduledStartTsUtc,
      tz: this._tz,
      durationMin: this._durationMin,
      venueName: this._venueName,
      surfaceLabel: this._surfaceLabel,
      status: this._status,
      homeScore: this._homeScore,
      awayScore: this._awayScore,
      period: this._period,
      metadata: this._metadata,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      finalizedAt: this._finalizedAt,
      finalizedByUserId: this._finalizedByUserId
    };
  }
}
