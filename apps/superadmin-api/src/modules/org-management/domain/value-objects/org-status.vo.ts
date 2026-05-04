import { DomainError } from "@sportspulse/kernel";

export const ORG_STATUSES = ["active", "suspended", "archived"] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const ORG_TYPES = [
  "governing_body",
  "federation",
  "league_operator",
  "club",
  "association",
  "school",
  "tournament_operator"
] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const assertOrgStatus = (raw: string): OrgStatus => {
  if (!ORG_STATUSES.includes(raw as OrgStatus))
    throw new DomainError("INVALID_ORG_STATUS", `Invalid status: ${raw}`);
  return raw as OrgStatus;
};

export const assertOrgType = (raw: string): OrgType => {
  if (!ORG_TYPES.includes(raw as OrgType))
    throw new DomainError("INVALID_ORG_TYPE", `Invalid type: ${raw}`);
  return raw as OrgType;
};
