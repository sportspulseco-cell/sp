import { AggregateRoot, DomainError } from "@sportspulse/kernel";
import { RosterMoveId } from "../identifiers";
import {
  type MembershipType,
  type MoveType,
  assertMembershipType,
  assertMoveType
} from "../value-objects/move-type.vo";

export interface RosterMoveSnapshot {
  id: string;
  teamId: string;
  personId: string;
  seasonId: string;
  moveType: MoveType;
  membershipType: MembershipType;
  effectiveAt: Date;
  effectiveTo: Date | null;
  jerseyNumber: number | null;
  positionCode: string | null;
  reason: string | null;
  sourceEventId: string | null;
  createdByUserId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// Append-only event. Once created, never mutated.
export class RosterMove extends AggregateRoot<RosterMoveId> {
  private constructor(
    id: RosterMoveId,
    private readonly _teamId: string,
    private readonly _personId: string,
    private readonly _seasonId: string,
    private readonly _moveType: MoveType,
    private readonly _membershipType: MembershipType,
    private readonly _effectiveAt: Date,
    private readonly _effectiveTo: Date | null,
    private readonly _jerseyNumber: number | null,
    private readonly _positionCode: string | null,
    private readonly _reason: string | null,
    private readonly _sourceEventId: string | null,
    private readonly _createdByUserId: string | null,
    private readonly _metadata: Record<string, unknown>,
    private readonly _createdAt: Date
  ) {
    super(id);
  }

  static create(input: {
    id: RosterMoveId;
    teamId: string;
    personId: string;
    seasonId: string;
    moveType: MoveType;
    membershipType?: MembershipType;
    effectiveAt?: Date;
    effectiveTo?: Date | null;
    jerseyNumber?: number | null;
    positionCode?: string | null;
    reason?: string | null;
    sourceEventId?: string | null;
    createdByUserId?: string | null;
    metadata?: Record<string, unknown>;
  }): RosterMove {
    assertMoveType(input.moveType);
    if (input.jerseyNumber !== undefined && input.jerseyNumber !== null) {
      if (input.jerseyNumber < 0 || input.jerseyNumber > 999) {
        throw new DomainError("INVALID_JERSEY", "Jersey must be 0–999");
      }
    }
    return new RosterMove(
      input.id,
      input.teamId,
      input.personId,
      input.seasonId,
      input.moveType,
      input.membershipType ?? "primary",
      input.effectiveAt ?? new Date(),
      input.effectiveTo ?? null,
      input.jerseyNumber ?? null,
      input.positionCode ?? null,
      input.reason ?? null,
      input.sourceEventId ?? null,
      input.createdByUserId ?? null,
      input.metadata ?? {},
      new Date()
    );
  }

  static rehydrate(s: RosterMoveSnapshot): RosterMove {
    return new RosterMove(
      RosterMoveId.of(s.id),
      s.teamId,
      s.personId,
      s.seasonId,
      assertMoveType(s.moveType),
      assertMembershipType(s.membershipType),
      s.effectiveAt,
      s.effectiveTo,
      s.jerseyNumber,
      s.positionCode,
      s.reason,
      s.sourceEventId,
      s.createdByUserId,
      s.metadata,
      s.createdAt
    );
  }

  get teamId(): string { return this._teamId; }
  get personId(): string { return this._personId; }
  get seasonId(): string { return this._seasonId; }
  get moveType(): MoveType { return this._moveType; }
  get membershipType(): MembershipType { return this._membershipType; }
  get effectiveAt(): Date { return this._effectiveAt; }
  get effectiveTo(): Date | null { return this._effectiveTo; }
  get jerseyNumber(): number | null { return this._jerseyNumber; }
  get positionCode(): string | null { return this._positionCode; }
  get reason(): string | null { return this._reason; }
  get sourceEventId(): string | null { return this._sourceEventId; }
  get createdByUserId(): string | null { return this._createdByUserId; }
  get metadata(): Record<string, unknown> { return this._metadata; }
  get createdAt(): Date { return this._createdAt; }

  toSnapshot(): RosterMoveSnapshot {
    return {
      id: this.id.value,
      teamId: this._teamId,
      personId: this._personId,
      seasonId: this._seasonId,
      moveType: this._moveType,
      membershipType: this._membershipType,
      effectiveAt: this._effectiveAt,
      effectiveTo: this._effectiveTo,
      jerseyNumber: this._jerseyNumber,
      positionCode: this._positionCode,
      reason: this._reason,
      sourceEventId: this._sourceEventId,
      createdByUserId: this._createdByUserId,
      metadata: this._metadata,
      createdAt: this._createdAt
    };
  }
}
