import { EntityId } from "@sportspulse/kernel";

export class GameId extends EntityId<"Game"> {
  static of(v: string): GameId {
    return new GameId(v);
  }
}
export class GameEventId extends EntityId<"GameEvent"> {
  static of(v: string): GameEventId {
    return new GameEventId(v);
  }
}
export class GameAttendanceId extends EntityId<"GameAttendance"> {
  static of(v: string): GameAttendanceId {
    return new GameAttendanceId(v);
  }
}
export class SuspensionId extends EntityId<"Suspension"> {
  static of(v: string): SuspensionId {
    return new SuspensionId(v);
  }
}
