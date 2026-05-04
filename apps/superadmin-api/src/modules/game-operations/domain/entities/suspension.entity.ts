import { AggregateRoot, DomainError } from "@sportspulse/kernel";
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
    private readonly _kind: SuspensionKind,
    private readonly _nGames: number | null,
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
    reason?: string | null;
    issuedByUserId?: string | null;
  }): Suspension {
    if (input.kind === "n_games" && (!input.nGames || input.nGames < 1)) {
      throw new DomainError("INVALID_SUSPENSION_N", "n_games must be >= 1");
    }
    if (input.kind === "n_days" && (!input.nDays || input.nDays < 1)) {
      throw new DomainError("INVALID_SUSPENSION_N", "n_days must be >= 1");
    }
    const now = new Date();
    return new Suspension(
      input.id,
      input.personId,
      input.sourceEventId ?? null,
      input.kind,
      input.nGames ?? null,
      input.nDays ?? null,
      0,
      "active",
      input.reason ?? null,
      now,
      null,
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

  serveOneGame(): void {
    if (this._status !== "active") {
      throw new DomainError(
        "SUSPENSION_NOT_ACTIVE",
        `Cannot serve a ${this._status} suspension`
      );
    }
    this._servedCount += 1;
    if (this._kind === "n_games" && this._nGames && this._servedCount >= this._nGames) {
      this._status = "served";
      this._endAt = new Date();
    }
    this._touch();
  }

  lift(reason?: string): void {
    this._status = "lifted";
    this._endAt = new Date();
    if (reason) this._reason = reason;
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
