import { AggregateRoot, DomainError } from "@sportspulse/kernel";
import { OrgId, CrossOrgGrantId } from "../identifiers";

export interface CrossOrgGrantSnapshot {
  id: string;
  userId: string;
  fromOrgId: string;
  toOrgId: string;
  permissions: string[];
  effectiveFrom: Date;
  effectiveTo: Date | null;
  grantedByUserId: string | null;
  createdAt: Date;
}

export class CrossOrgGrant extends AggregateRoot<CrossOrgGrantId> {
  private constructor(
    id: CrossOrgGrantId,
    private readonly _userId: string,
    private readonly _fromOrgId: OrgId,
    private readonly _toOrgId: OrgId,
    private _permissions: string[],
    private readonly _effectiveFrom: Date,
    private _effectiveTo: Date | null,
    private readonly _grantedByUserId: string | null,
    private readonly _createdAt: Date
  ) {
    super(id);
  }

  static create(input: {
    id: CrossOrgGrantId;
    userId: string;
    fromOrgId: OrgId;
    toOrgId: OrgId;
    permissions?: string[];
    grantedByUserId?: string | null;
  }): CrossOrgGrant {
    if (input.fromOrgId.equals(input.toOrgId)) {
      throw new DomainError(
        "SELF_GRANT",
        "Cross-org grant must span two different orgs"
      );
    }
    return new CrossOrgGrant(
      input.id,
      input.userId,
      input.fromOrgId,
      input.toOrgId,
      input.permissions ?? [],
      new Date(),
      null,
      input.grantedByUserId ?? null,
      new Date()
    );
  }

  static rehydrate(s: CrossOrgGrantSnapshot): CrossOrgGrant {
    return new CrossOrgGrant(
      CrossOrgGrantId.of(s.id),
      s.userId,
      OrgId.of(s.fromOrgId),
      OrgId.of(s.toOrgId),
      s.permissions,
      s.effectiveFrom,
      s.effectiveTo,
      s.grantedByUserId,
      s.createdAt
    );
  }

  revoke(at: Date = new Date()): void {
    if (this._effectiveTo) {
      throw new DomainError("ALREADY_REVOKED", "Grant already revoked");
    }
    this._effectiveTo = at;
  }

  setPermissions(permissions: string[]): void {
    this._permissions = permissions;
  }

  get userId(): string { return this._userId; }
  get fromOrgId(): OrgId { return this._fromOrgId; }
  get toOrgId(): OrgId { return this._toOrgId; }
  get permissions(): string[] { return this._permissions; }
  get effectiveFrom(): Date { return this._effectiveFrom; }
  get effectiveTo(): Date | null { return this._effectiveTo; }
  get grantedByUserId(): string | null { return this._grantedByUserId; }
  get createdAt(): Date { return this._createdAt; }

  toSnapshot(): CrossOrgGrantSnapshot {
    return {
      id: this.id.value,
      userId: this._userId,
      fromOrgId: this._fromOrgId.value,
      toOrgId: this._toOrgId.value,
      permissions: this._permissions,
      effectiveFrom: this._effectiveFrom,
      effectiveTo: this._effectiveTo,
      grantedByUserId: this._grantedByUserId,
      createdAt: this._createdAt
    };
  }
}
