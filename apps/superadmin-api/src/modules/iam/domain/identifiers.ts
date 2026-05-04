import { EntityId } from "@sportspulse/kernel";

export class UserId extends EntityId<"User"> {
  static of(v: string): UserId {
    return new UserId(v);
  }
}

export class OrgId extends EntityId<"Org"> {
  static of(v: string): OrgId {
    return new OrgId(v);
  }
}

export class RoleId extends EntityId<"Role"> {
  static of(v: string): RoleId {
    return new RoleId(v);
  }
}
