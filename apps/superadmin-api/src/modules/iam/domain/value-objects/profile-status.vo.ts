import { DomainError } from "@sportspulse/kernel";

export const PROFILE_STATUSES = [
  "pending",
  "active",
  "suspended",
  "deleted"
] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export const assertProfileStatus = (raw: string): ProfileStatus => {
  if (!PROFILE_STATUSES.includes(raw as ProfileStatus)) {
    throw new DomainError("INVALID_PROFILE_STATUS", `Invalid status: ${raw}`);
  }
  return raw as ProfileStatus;
};
