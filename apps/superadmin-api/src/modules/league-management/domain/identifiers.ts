import { EntityId } from "@sportspulse/kernel";

export class SeasonId extends EntityId<"Season"> {
  static of(v: string): SeasonId {
    return new SeasonId(v);
  }
}
export class LeagueId extends EntityId<"League"> {
  static of(v: string): LeagueId {
    return new LeagueId(v);
  }
}
export class DivisionId extends EntityId<"Division"> {
  static of(v: string): DivisionId {
    return new DivisionId(v);
  }
}
export class TeamId extends EntityId<"Team"> {
  static of(v: string): TeamId {
    return new TeamId(v);
  }
}
export class GoverningBodyId extends EntityId<"GoverningBody"> {
  static of(v: string): GoverningBodyId {
    return new GoverningBodyId(v);
  }
}
export class AgeGroupId extends EntityId<"AgeGroup"> {
  static of(v: string): AgeGroupId {
    return new AgeGroupId(v);
  }
}
export class RuleSetId extends EntityId<"RuleSet"> {
  static of(v: string): RuleSetId {
    return new RuleSetId(v);
  }
}
