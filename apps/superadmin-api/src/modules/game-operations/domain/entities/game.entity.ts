import { AggregateRoot, DomainError, type GameEnding } from "@sportspulse/kernel";
import { GameId } from "../identifiers";
import {
  type GameStatus,
  assertGameStatus,
  canTransitionGame
} from "../value-objects/game-status.vo";

export interface GameSnapshot {
  id: string;
  leagueId: string;
  /** games.season_id; null for ad-hoc games created without a season. */
  seasonId: string | null;
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
  /** Public on team schedules iff set (SCH-7). */
  publishedAt: Date | null;
  /** Ice slot the game occupies; null for hand-made games or after a manual move. */
  slotId: string | null;
  surfaceId: string | null;
  /** Generation run that placed it; null = hand-made. */
  scheduleRunId: string | null;
  /** Set = the scheduler engine must never move this game. */
  lockedAt: Date | null;
  lockedByUserId: string | null;
  /** manual | generated | manual_import | manual_override */
  source: string;
}

/** One entry of `metadata.reschedules`, newest last (SCH-6). */
export interface RescheduleRecord {
  at: string;
  byUserId: string;
  from: { startTsUtc: string; venueName: string | null; surfaceLabel: string | null; surfaceId: string | null };
  to: { startTsUtc: string; venueName: string | null; surfaceLabel: string | null; surfaceId: string | null };
  reason: string | null;
  /** Conflict messages the admin overrode, empty when there were none. */
  overriddenConflicts: string[];
}

export class Game extends AggregateRoot<GameId> {
  private constructor(
    id: GameId,
    private readonly _leagueId: string,
    private readonly _seasonId: string | null,
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
    private _finalizedByUserId: string | null,
    private _publishedAt: Date | null,
    private _slotId: string | null,
    private _surfaceId: string | null,
    private readonly _scheduleRunId: string | null,
    private _lockedAt: Date | null,
    private _lockedByUserId: string | null,
    private _source: string
  ) {
    super(id);
  }

  static create(input: {
    id: GameId;
    leagueId: string;
    seasonId?: string | null;
    divisionId?: string | null;
    homeTeamId: string;
    awayTeamId: string;
    sportCode: string;
    scheduledStartTsUtc: Date;
    tz?: string;
    durationMin?: number;
    venueName?: string | null;
    surfaceLabel?: string | null;
    /** Rink (surface) the game is played on; venueName/surfaceLabel are its names. */
    surfaceId?: string | null;
    metadata?: Record<string, unknown>;
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
      input.seasonId ?? null,
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
      input.metadata ?? {},
      now,
      now,
      null,
      null,
      null,
      null,
      input.surfaceId ?? null,
      null,
      null,
      null,
      "manual"
    );
  }

  static rehydrate(s: GameSnapshot): Game {
    return new Game(
      GameId.of(s.id),
      s.leagueId,
      s.seasonId,
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
      s.finalizedByUserId,
      s.publishedAt,
      s.slotId,
      s.surfaceId,
      s.scheduleRunId,
      s.lockedAt,
      s.lockedByUserId,
      s.source
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

  /**
   * Terminal completion. `endedIn` is stored in metadata so standings can
   * tell an overtime or shootout loss from a regulation loss; null when
   * not recorded (ties may leave it blank).
   */
  finalize(byUserId: string, endedIn: GameEnding | null = null): void {
    if (!canTransitionGame(this._status, "completed")) {
      throw new DomainError(
        "INVALID_GAME_TRANSITION",
        this._status === "completed"
          ? "This game is already final."
          : `Only a game in play can be finalized. This game is ${this._status.replace(/_/g, " ")}.`
      );
    }
    this._status = "completed";
    this._finalizedAt = new Date();
    this._finalizedByUserId = byUserId;
    this._metadata = { ...this._metadata, endedIn };
    this._touch();
  }

  /**
   * Show a hand-made game on team schedules. Generated games are
   * published with their schedule run (scheduler-publish), never one by
   * one, so the engine's draft set stays whole.
   * Returns false when the game was already published (idempotent).
   */
  publish(at: Date = new Date()): boolean {
    if (this._scheduleRunId) {
      throw new DomainError(
        "GAME_PUBLISHED_WITH_SCHEDULE",
        "This game belongs to a generated schedule. Publish the schedule from Scheduling."
      );
    }
    if (this._status === "cancelled") {
      throw new DomainError("GAME_TERMINAL", "A cancelled game cannot be published.");
    }
    if (this._publishedAt) return false;
    this._publishedAt = at;
    this._touch();
    return true;
  }

  /**
   * Manual override of time and/or rink (UC-07, SCH-6). Only a game that
   * has not started can move; a postponed game moved to a new time is
   * scheduled again. The game leaves its ice slot (the caller frees the
   * slot) and is pinned so the scheduler engine never moves it back.
   */
  moveTo(input: {
    startTsUtc: Date;
    tz: string;
    venueName: string | null;
    surfaceLabel: string | null;
    surfaceId: string | null;
    byUserId: string;
    reason: string | null;
    overriddenConflicts: string[];
  }): RescheduleRecord {
    if (this._status !== "scheduled" && this._status !== "postponed") {
      throw new DomainError(
        "GAME_NOT_MOVABLE",
        `Only a scheduled or postponed game can be moved. This game is ${this._status.replace(/_/g, " ")}.`
      );
    }
    const now = new Date();
    const record: RescheduleRecord = {
      at: now.toISOString(),
      byUserId: input.byUserId,
      from: {
        startTsUtc: this._scheduledStartTsUtc.toISOString(),
        venueName: this._venueName,
        surfaceLabel: this._surfaceLabel,
        surfaceId: this._surfaceId
      },
      to: {
        startTsUtc: input.startTsUtc.toISOString(),
        venueName: input.venueName,
        surfaceLabel: input.surfaceLabel,
        surfaceId: input.surfaceId
      },
      reason: input.reason,
      overriddenConflicts: input.overriddenConflicts
    };
    const history = Array.isArray(this._metadata.reschedules)
      ? (this._metadata.reschedules as RescheduleRecord[])
      : [];
    this._metadata = { ...this._metadata, reschedules: [...history, record] };
    this._scheduledStartTsUtc = input.startTsUtc;
    this._tz = input.tz;
    this._venueName = input.venueName;
    this._surfaceLabel = input.surfaceLabel;
    this._surfaceId = input.surfaceId;
    this._slotId = null;
    if (this._status === "postponed") this._status = "scheduled";
    if (this._scheduleRunId) this._source = "manual_override";
    if (!this._lockedAt) {
      this._lockedAt = now;
      this._lockedByUserId = input.byUserId;
    }
    this._touch();
    return record;
  }

  private _touch(): void {
    this._updatedAt = new Date();
  }

  // ---------- accessors ----------

  get leagueId(): string { return this._leagueId; }
  get seasonId(): string | null { return this._seasonId; }
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
  get publishedAt(): Date | null { return this._publishedAt; }
  get slotId(): string | null { return this._slotId; }
  get surfaceId(): string | null { return this._surfaceId; }
  get scheduleRunId(): string | null { return this._scheduleRunId; }
  get endedIn(): GameEnding | null {
    const v = this._metadata.endedIn;
    return v === "regulation" || v === "overtime" || v === "shootout" ? v : null;
  }

  toSnapshot(): GameSnapshot {
    return {
      id: this.id.value,
      leagueId: this._leagueId,
      seasonId: this._seasonId,
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
      finalizedByUserId: this._finalizedByUserId,
      publishedAt: this._publishedAt,
      slotId: this._slotId,
      surfaceId: this._surfaceId,
      scheduleRunId: this._scheduleRunId,
      lockedAt: this._lockedAt,
      lockedByUserId: this._lockedByUserId,
      source: this._source
    };
  }
}
