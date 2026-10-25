import {
  AggregateRoot,
  DomainError,
  SUSPENSION_IN_FORCE_STATUSES,
  SUSPENSION_MAX_GAMES,
  validateLiftReason,
  validateSuspensionIssue
} from "@sportspulse/kernel";
import { SuspensionId } from "../identifiers";
import {
  type SuspensionKind,
  type SuspensionStatus,
  assertSuspensionKind,
  assertSuspensionStatus
} from "../value-objects/game-status.vo";

export interface SuspensionSnapshot {
  id: string;
  personId: string;
  sourceEventId: string | null;
  kind: SuspensionKind;
  nGames: number | null;
  nDays: number | null;
  servedCount: number;
  status: SuspensionStatus;
  reason: string | null;
  startAt: Date;
  endAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  issuedByUserId: string | null;
}

export class Suspension extends AggregateRoot<SuspensionId> {
  private constructor(
    id: SuspensionId,
    private readonly _personId: string,
    private readonly _sourceEventId: string | null,
    private _kind: SuspensionKind,
    private _nGames: number | null,
    private readonly _nDays: number | null,
    private _servedCount: number,
    private _status: SuspensionStatus,
    private _reason: string | null,
    private readonly _startAt: Date,
    private _endAt: Date | null,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
    private readonly _issuedByUserId: string | null
  ) {
    super(id);
  }

  static create(input: {
    id: SuspensionId;
    personId: string;
    kind: SuspensionKind;
    sourceEventId?: string | null;
    nGames?: number | null;
    nDays?: number | null;
    /** time_bounded only: the moment the player may play again. */
    endAt?: Date | null;
    reason?: string | null;
    issuedByUserId?: string | null;
    now?: Date;
  }): Suspension {
    const now = input.now ?? new Date();
    const problem = validateSuspensionIssue(
      {
        kind: input.kind,
        nGames: input.nGames,
        nDays: input.nDays,
        endAt: input.endAt ?? null,
        reason: input.reason
      },
      now
    );
    if (problem) throw new DomainError("INVALID_SUSPENSION", problem);
    return new Suspension(
      input.id,
      input.personId,
      input.sourceEventId ?? null,
      input.kind,
      input.nGames ?? null,
      input.nDays ?? null,
      0,
      "active",
      input.reason!.trim(),
      now,
      input.kind === "time_bounded" ? (input.endAt ?? null) : null,
      now,
      now,
      input.issuedByUserId ?? null
    );
  }

  static rehydrate(s: SuspensionSnapshot): Suspension {
    return new Suspension(
      SuspensionId.of(s.id),
      s.personId,
      s.sourceEventId,
      assertSuspensionKind(s.kind),
      s.nGames,
      s.nDays,
      s.servedCount,
      assertSuspensionStatus(s.status),
      s.reason,
      s.startAt,
      s.endAt,
      s.createdAt,
      s.updatedAt,
      s.issuedByUserId
    );
  }

  /**
   * Manual correction: count one game served. Finalized games are
   * counted automatically (FinalizeGameHandler); this is for a game the
   * platform does not know about.
   */
  serveOneGame(): void {
    if (this._status !== "active") {
      throw new DomainError(
        "SUSPENSION_NOT_ACTIVE",
        `Cannot serve a ${this._status} suspension`
      );
    }
    if (this._kind !== "n_games") {
      throw new DomainError(
        "SUSPENSION_NOT_GAME_COUNT",
        "Only a suspension for a number of games counts games served."
      );
    }
    this._servedCount += 1;
    if (this._kind === "n_games" && this._nGames && this._servedCount >= this._nGames) {
      this._status = "served";
      this._endAt = new Date();
    }
    this._touch();
  }

  /**
   * Lift a standing suspension. The issue reason is kept; the lift
   * reason is appended so the history row says both (no lift_reason
   * column yet, see the COMP-10 migration note).
   */
  lift(reason: string, at: Date = new Date()): void {
    if (!SUSPENSION_IN_FORCE_STATUSES.includes(this._status)) {
      throw new DomainError(
        "SUSPENSION_NOT_ACTIVE",
        `This suspension is already ${this._status}. Only a standing suspension can be lifted.`
      );
    }
    const problem = validateLiftReason(reason);
    if (problem) throw new DomainError("LIFT_REASON_REQUIRED", problem);
    this._status = "lifted";
    this._endAt = at;
    const why = `Lifted: ${reason.trim()}`;
    this._reason = this._reason ? `${this._reason} | ${why}` : why;
    this._touch();
  }

  /**
   * Admin override (UC-14 "reduce / extend"): set the number of games, or
   * turn an open-ended suspension (a match penalty after its hearing)
   * into a number of games. Games already served stay counted; reaching
   * them ends the suspension now.
   */
  changeGames(nGames: number, reason: string, at: Date = new Date()): void {
    if (!SUSPENSION_IN_FORCE_STATUSES.includes(this._status)) {
      throw new DomainError(
        "SUSPENSION_NOT_ACTIVE",
        `This suspension is already ${this._status}. Only a standing suspension can change.`
      );
    }
    if (this._kind !== "n_games" && this._kind !== "indefinite") {
      throw new DomainError(
        "SUSPENSION_NOT_GAME_COUNT",
        "Only a suspension for a number of games, or one until lifted, can be set to a number of games."
      );
    }
    if (!Number.isInteger(nGames) || nGames < 1 || nGames > SUSPENSION_MAX_GAMES) {
      throw new DomainError("SUSPENSION_GAMES_INVALID", `Games must be a whole number from 1 to ${SUSPENSION_MAX_GAMES}.`);
    }
    const problem = validateLiftReason(reason);
    if (problem) throw new DomainError("CHANGE_REASON_REQUIRED", problem);
    const before = this._kind === "n_games" ? `${this._nGames} game${this._nGames === 1 ? "" : "s"}` : "until lifted";
    this._kind = "n_games";
    this._nGames = nGames;
    if (this._servedCount >= nGames) {
      this._status = "served";
      this._endAt = at;
    }
    const why = `Changed from ${before} to ${nGames} game${nGames === 1 ? "" : "s"}: ${reason.trim()}`;
    this._reason = this._reason ? `${this._reason} | ${why}` : why;
    this._touch();
  }

  appeal(): void {
    this._status = "appealed";
    this._touch();
  }

  private _touch(): void {
    this._updatedAt = new Date();
  }

  get personId(): string { return this._personId; }
  get sourceEventId(): string | null { return this._sourceEventId; }
  get kind(): SuspensionKind { return this._kind; }
  get nGames(): number | null { return this._nGames; }
  get nDays(): number | null { return this._nDays; }
  get servedCount(): number { return this._servedCount; }
  get status(): SuspensionStatus { return this._status; }
  get reason(): string | null { return this._reason; }
  get startAt(): Date { return this._startAt; }
  get endAt(): Date | null { return this._endAt; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }
  get issuedByUserId(): string | null { return this._issuedByUserId; }

  toSnapshot(): SuspensionSnapshot {
    return {
      id: this.id.value,
      personId: this._personId,
      sourceEventId: this._sourceEventId,
      kind: this._kind,
      nGames: this._nGames,
      nDays: this._nDays,
      servedCount: this._servedCount,
      status: this._status,
      reason: this._reason,
      startAt: this._startAt,
      endAt: this._endAt,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      issuedByUserId: this._issuedByUserId
    };
  }
}
