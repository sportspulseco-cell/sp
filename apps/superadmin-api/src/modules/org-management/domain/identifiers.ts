import { EntityId } from "@sportspulse/kernel";

export class OrgId extends EntityId<"Org"> {
  static of(v: string): OrgId {
    return new OrgId(v);
  }
}
export class OrgRelationId extends EntityId<"OrgRelation"> {
  static of(v: string): OrgRelationId {
    return new OrgRelationId(v);
  }
}
export class CrossOrgGrantId extends EntityId<"CrossOrgGrant"> {
  static of(v: string): CrossOrgGrantId {
    return new CrossOrgGrantId(v);
  }
}
