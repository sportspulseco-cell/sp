import { EntityId } from "@sportspulse/kernel";

export class StatLineId extends EntityId<"StatLine"> {
  static of(v: string): StatLineId {
    return new StatLineId(v);
  }
}
export class StandingId extends EntityId<"Standing"> {
  static of(v: string): StandingId {
    return new StandingId(v);
  }
}
export class LeaderboardId extends EntityId<"Leaderboard"> {
  static of(v: string): LeaderboardId {
    return new LeaderboardId(v);
  }
}
