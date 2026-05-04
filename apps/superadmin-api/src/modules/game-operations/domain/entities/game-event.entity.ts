import { AggregateRoot, DomainError } from "@sportspulse/kernel";
import { GameEventId } from "../identifiers";

export type EventSource =
  | "scorekeeper_app"
  | "ref_amend"
  | "video_review"
  | "import"
  | "system";

export interface GameEventSnapshot {
  id: string;
  gameId: string;
  sportCode: string;
  eventType: string;
  tsUtc: Date;
  period: number | null;
  clockRemainingSec: number | null;
  teamId: string | null;
  primaryPersonId: string | null;
  secondaryPersonIds: string[];
  attributes: Record<string, unknown>;
  source: EventSource;
  sourceDeviceId: string | null;
  idempotencyKey: string | null;
  correctionOfEventId: string | null;
  loggedByUserId: string | null;
  createdAt: Date;
}

// Append-only. Once persisted, never mutated. Corrections are new events.
export class GameEvent extends AggregateRoot<GameEventId> {
  private constructor(
    id: GameEventId,
    private readonly _gameId: string,
    private readonly _sportCode: string,
    private readonly _eventType: string,
    private readonly _tsUtc: Date,
    private readonly _period: number | null,
    private readonly _clockRemainingSec: number | null,
    private readonly _teamId: string | null,
    private readonly _primaryPersonId: string | null,
    private readonly _secondaryPersonIds: string[],
    private readonly _attributes: Record<string, unknown>,
    private readonly _source: EventSource,
    private readonly _sourceDeviceId: string | null,
    private readonly _idempotencyKey: string | null,
    private readonly _correctionOfEventId: string | null,
    private readonly _loggedByUserId: string | null,
    private readonly _createdAt: Date
  ) {
    super(id);
  }

  static create(input: {
    id: GameEventId;
    gameId: string;
    sportCode: string;
    eventType: string;
    tsUtc?: Date;
    period?: number | null;
    clockRemainingSec?: number | null;
    teamId?: string | null;
    primaryPersonId?: string | null;
    secondaryPersonIds?: string[];
    attributes?: Record<string, unknown>;
    source?: EventSource;
    sourceDeviceId?: string | null;
    idempotencyKey?: string | null;
    correctionOfEventId?: string | null;
    loggedByUserId?: string | null;
  }): GameEvent {
    if (!input.eventType?.trim()) {
      throw new DomainError("INVALID_EVENT_TYPE", "Event type required");
    }
    return new GameEvent(
      input.id,
      input.gameId,
      input.sportCode,
      input.eventType,
      input.tsUtc ?? new Date(),
      input.period ?? null,
      input.clockRemainingSec ?? null,
      input.teamId ?? null,
      input.primaryPersonId ?? null,
      input.secondaryPersonIds ?? [],
      input.attributes ?? {},
      input.source ?? "scorekeeper_app",
      input.sourceDeviceId ?? null,
      input.idempotencyKey ?? null,
      input.correctionOfEventId ?? null,
      input.loggedByUserId ?? null,
      new Date()
    );
  }

  static rehydrate(s: GameEventSnapshot): GameEvent {
    return new GameEvent(
      GameEventId.of(s.id),
      s.gameId,
      s.sportCode,
      s.eventType,
      s.tsUtc,
      s.period,
      s.clockRemainingSec,
      s.teamId,
      s.primaryPersonId,
      s.secondaryPersonIds,
      s.attributes,
      s.source,
      s.sourceDeviceId,
      s.idempotencyKey,
      s.correctionOfEventId,
      s.loggedByUserId,
      s.createdAt
    );
  }

  get gameId(): string { return this._gameId; }
  get sportCode(): string { return this._sportCode; }
  get eventType(): string { return this._eventType; }
  get tsUtc(): Date { return this._tsUtc; }
  get period(): number | null { return this._period; }
  get clockRemainingSec(): number | null { return this._clockRemainingSec; }
  get teamId(): string | null { return this._teamId; }
  get primaryPersonId(): string | null { return this._primaryPersonId; }
  get secondaryPersonIds(): string[] { return this._secondaryPersonIds; }
  get attributes(): Record<string, unknown> { return this._attributes; }
  get source(): EventSource { return this._source; }
  get sourceDeviceId(): string | null { return this._sourceDeviceId; }
  get idempotencyKey(): string | null { return this._idempotencyKey; }
  get correctionOfEventId(): string | null { return this._correctionOfEventId; }
  get loggedByUserId(): string | null { return this._loggedByUserId; }
  get createdAt(): Date { return this._createdAt; }

  toSnapshot(): GameEventSnapshot {
    return {
      id: this.id.value,
      gameId: this._gameId,
      sportCode: this._sportCode,
      eventType: this._eventType,
      tsUtc: this._tsUtc,
      period: this._period,
      clockRemainingSec: this._clockRemainingSec,
      teamId: this._teamId,
      primaryPersonId: this._primaryPersonId,
      secondaryPersonIds: this._secondaryPersonIds,
      attributes: this._attributes,
      source: this._source,
      sourceDeviceId: this._sourceDeviceId,
      idempotencyKey: this._idempotencyKey,
      correctionOfEventId: this._correctionOfEventId,
      loggedByUserId: this._loggedByUserId,
      createdAt: this._createdAt
    };
  }
}
