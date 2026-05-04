import { EntityId } from "@sportspulse/kernel";

export class RosterMoveId extends EntityId<"RosterMove"> {
  static of(v: string): RosterMoveId {
    return new RosterMoveId(v);
  }
}
export class TeamMembershipId extends EntityId<"TeamMembership"> {
  static of(v: string): TeamMembershipId {
    return new TeamMembershipId(v);
  }
}
