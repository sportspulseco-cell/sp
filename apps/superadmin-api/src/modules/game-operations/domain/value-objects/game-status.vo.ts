import {
  DomainError,
  SUSPENSION_KINDS,
  SUSPENSION_STATUSES,
  type SuspensionKind,
  type SuspensionStatus
} from "@sportspulse/kernel";

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

// Canonical lists live in the kernel (packages/kernel/src/suspensions.ts)
// so the API, the admin dialog and the captain screens never drift.
export {
  SUSPENSION_KINDS,
  SUSPENSION_STATUSES,
  type SuspensionKind,
  type SuspensionStatus
} from "@sportspulse/kernel";

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
