import { AggregateRoot, DomainError } from "@sportspulse/kernel";
import { OrgId, OrgRelationId } from "../identifiers";

export type RelationKind = "sanctions" | "member_of" | "owns";

export interface OrgRelationSnapshot {
  id: string;
  parentOrgId: string;
  childOrgId: string;
  relation: RelationKind;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
}

export class OrgRelation extends AggregateRoot<OrgRelationId> {
  private constructor(
    id: OrgRelationId,
    private readonly _parentOrgId: OrgId,
    private readonly _childOrgId: OrgId,
    private readonly _relation: RelationKind,
    private readonly _effectiveFrom: Date,
    private _effectiveTo: Date | null,
    private readonly _createdAt: Date
  ) {
    super(id);
  }

  static create(input: {
    id: OrgRelationId;
    parentOrgId: OrgId;
    childOrgId: OrgId;
    relation: RelationKind;
    effectiveFrom?: Date;
  }): OrgRelation {
    if (input.parentOrgId.equals(input.childOrgId)) {
      throw new DomainError("SELF_RELATION", "Parent and child cannot be same org");
    }
    return new OrgRelation(
      input.id,
      input.parentOrgId,
      input.childOrgId,
      input.relation,
      input.effectiveFrom ?? new Date(),
      null,
      new Date()
    );
  }

  static rehydrate(s: OrgRelationSnapshot): OrgRelation {
    return new OrgRelation(
      OrgRelationId.of(s.id),
      OrgId.of(s.parentOrgId),
      OrgId.of(s.childOrgId),
      s.relation,
      s.effectiveFrom,
      s.effectiveTo,
      s.createdAt
    );
  }

  end(at: Date = new Date()): void {
    if (this._effectiveTo) {
      throw new DomainError("ALREADY_ENDED", "Relation already ended");
    }
    this._effectiveTo = at;
  }

  get parentOrgId(): OrgId { return this._parentOrgId; }
  get childOrgId(): OrgId { return this._childOrgId; }
  get relation(): RelationKind { return this._relation; }
  get effectiveFrom(): Date { return this._effectiveFrom; }
  get effectiveTo(): Date | null { return this._effectiveTo; }
  get createdAt(): Date { return this._createdAt; }

  toSnapshot(): OrgRelationSnapshot {
    return {
      id: this.id.value,
      parentOrgId: this._parentOrgId.value,
      childOrgId: this._childOrgId.value,
      relation: this._relation,
      effectiveFrom: this._effectiveFrom,
      effectiveTo: this._effectiveTo,
      createdAt: this._createdAt
    };
  }
}
