import { DomainError } from "@sportspulse/kernel";

export const GAME_STATUSES = [
  "scheduled",
  "in_play",
  "completed",
  "postponed",
  "cancelled",
  "forfeited"
] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

const ALLOWED: Record<GameStatus, GameStatus[]> = {
  scheduled: ["in_play", "postponed", "cancelled", "forfeited"],
  in_play: ["completed", "postponed", "forfeited"],
  postponed: ["scheduled", "cancelled"],
  completed: [], // corrections append events; status is terminal
  cancelled: [],
  forfeited: []
};

export const assertGameStatus = (raw: string): GameStatus => {
  if (!GAME_STATUSES.includes(raw as GameStatus)) {
    throw new DomainError("INVALID_GAME_STATUS", `Invalid status: ${raw}`);
  }
  return raw as GameStatus;
};

export const canTransitionGame = (from: GameStatus, to: GameStatus): boolean =>
  ALLOWED[from].includes(to);

export const SUSPENSION_KINDS = [
  "n_games",
  "n_days",
  "indefinite",
  "time_bounded"
] as const;
export type SuspensionKind = (typeof SUSPENSION_KINDS)[number];

export const SUSPENSION_STATUSES = [
  "active",
  "served",
  "lifted",
  "appealed"
] as const;
export type SuspensionStatus = (typeof SUSPENSION_STATUSES)[number];

export const assertSuspensionKind = (raw: string): SuspensionKind => {
  if (!SUSPENSION_KINDS.includes(raw as SuspensionKind)) {
    throw new DomainError("INVALID_SUSPENSION_KIND", `Invalid: ${raw}`);
  }
  return raw as SuspensionKind;
};
export const assertSuspensionStatus = (raw: string): SuspensionStatus => {
  if (!SUSPENSION_STATUSES.includes(raw as SuspensionStatus)) {
    throw new DomainError("INVALID_SUSPENSION_STATUS", `Invalid: ${raw}`);
  }
  return raw as SuspensionStatus;
};
