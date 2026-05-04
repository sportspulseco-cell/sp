import { DomainError } from "@sportspulse/kernel";

export const MOVE_TYPES = [
  "add",
  "drop",
  "trade_in",
  "trade_out",
  "call_up",
  "send_down",
  "release",
  "reinstate"
] as const;
export type MoveType = (typeof MOVE_TYPES)[number];

export const MEMBERSHIP_TYPES = [
  "primary",
  "play_up",
  "affiliate",
  "call_up"
] as const;
export type MembershipType = (typeof MEMBERSHIP_TYPES)[number];

export const MEMBERSHIP_STATUSES = [
  "active",
  "released",
  "suspended",
  "ineligible"
] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const assertMoveType = (raw: string): MoveType => {
  if (!MOVE_TYPES.includes(raw as MoveType))
    throw new DomainError("INVALID_MOVE_TYPE", `Invalid move type: ${raw}`);
  return raw as MoveType;
};

export const assertMembershipType = (raw: string): MembershipType => {
  if (!MEMBERSHIP_TYPES.includes(raw as MembershipType))
    throw new DomainError(
      "INVALID_MEMBERSHIP_TYPE",
      `Invalid membership type: ${raw}`
    );
  return raw as MembershipType;
};

export const assertMembershipStatus = (raw: string): MembershipStatus => {
  if (!MEMBERSHIP_STATUSES.includes(raw as MembershipStatus))
    throw new DomainError(
      "INVALID_MEMBERSHIP_STATUS",
      `Invalid status: ${raw}`
    );
  return raw as MembershipStatus;
};

// Whether a move type is "removing" (terminates an active membership).
export const isTerminatingMove = (m: MoveType): boolean =>
  m === "drop" || m === "trade_out" || m === "send_down" || m === "release";

export const isAddingMove = (m: MoveType): boolean =>
  m === "add" || m === "trade_in" || m === "call_up" || m === "reinstate";
