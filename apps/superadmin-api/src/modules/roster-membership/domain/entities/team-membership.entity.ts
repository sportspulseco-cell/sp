import { Entity } from "@sportspulse/kernel";
import { TeamMembershipId } from "../identifiers";
import {
  type MembershipStatus,
  type MembershipType,
  assertMembershipStatus,
  assertMembershipType
} from "../value-objects/move-type.vo";

export interface TeamMembershipSnapshot {
  id: string;
  teamId: string;
  personId: string;
  seasonId: string;
  membershipType: MembershipType;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  jerseyNumber: number | null;
  positionCode: string | null;
  currentStatus: MembershipStatus;
  lastMoveId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Projection of roster_moves — read-mostly. Constructed only by the
// projection service, never directly by use cases.
export class TeamMembership extends Entity<TeamMembershipId> {
  private constructor(
    id: TeamMembershipId,
    private readonly _teamId: string,
    private readonly _personId: string,
    private readonly _seasonId: string,
    private readonly _membershipType: MembershipType,
    private readonly _effectiveFrom: Date,
    private readonly _effectiveTo: Date | null,
    private readonly _jerseyNumber: number | null,
    private readonly _positionCode: string | null,
    private readonly _currentStatus: MembershipStatus,
    private readonly _lastMoveId: string | null,
    private readonly _createdAt: Date,
    private readonly _updatedAt: Date
  ) {
    super(id);
  }

  static rehydrate(s: TeamMembershipSnapshot): TeamMembership {
    return new TeamMembership(
      TeamMembershipId.of(s.id),
      s.teamId,
      s.personId,
      s.seasonId,
      assertMembershipType(s.membershipType),
      s.effectiveFrom,
      s.effectiveTo,
      s.jerseyNumber,
      s.positionCode,
      assertMembershipStatus(s.currentStatus),
      s.lastMoveId,
      s.createdAt,
      s.updatedAt
    );
  }

  get teamId(): string { return this._teamId; }
  get personId(): string { return this._personId; }
  get seasonId(): string { return this._seasonId; }
  get membershipType(): MembershipType { return this._membershipType; }
  get effectiveFrom(): Date { return this._effectiveFrom; }
  get effectiveTo(): Date | null { return this._effectiveTo; }
  get jerseyNumber(): number | null { return this._jerseyNumber; }
  get positionCode(): string | null { return this._positionCode; }
  get currentStatus(): MembershipStatus { return this._currentStatus; }
  get lastMoveId(): string | null { return this._lastMoveId; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }
  get isActive(): boolean { return this._effectiveTo === null; }

  toSnapshot(): TeamMembershipSnapshot {
    return {
      id: this.id.value,
      teamId: this._teamId,
      personId: this._personId,
      seasonId: this._seasonId,
      membershipType: this._membershipType,
      effectiveFrom: this._effectiveFrom,
      effectiveTo: this._effectiveTo,
      jerseyNumber: this._jerseyNumber,
      positionCode: this._positionCode,
      currentStatus: this._currentStatus,
      lastMoveId: this._lastMoveId,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    };
  }
}
