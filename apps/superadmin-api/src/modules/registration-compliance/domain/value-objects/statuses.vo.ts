import { DomainError } from "@sportspulse/kernel";

export const REGISTRATION_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "waitlisted",
  "withdrawn"
] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

const REG_TRANSITIONS: Record<RegistrationStatus, RegistrationStatus[]> = {
  draft: ["submitted", "withdrawn"],
  submitted: ["under_review", "approved", "rejected", "waitlisted", "withdrawn"],
  under_review: ["approved", "rejected", "waitlisted", "withdrawn"],
  waitlisted: ["approved", "rejected", "withdrawn"],
  approved: ["withdrawn"],
  rejected: [],
  withdrawn: []
};

export const assertRegistrationStatus = (raw: string): RegistrationStatus => {
  if (!REGISTRATION_STATUSES.includes(raw as RegistrationStatus)) {
    throw new DomainError(
      "INVALID_REGISTRATION_STATUS",
      `Invalid status: ${raw}`
    );
  }
  return raw as RegistrationStatus;
};

export const canTransitionRegistration = (
  from: RegistrationStatus,
  to: RegistrationStatus
): boolean => REG_TRANSITIONS[from].includes(to);

// ---

export const ELIGIBILITY_STATUSES = [
  "pending",
  "eligible",
  "ineligible",
  "expired",
  "waived"
] as const;
export type EligibilityStatus = (typeof ELIGIBILITY_STATUSES)[number];

export const assertEligibilityStatus = (raw: string): EligibilityStatus => {
  if (!ELIGIBILITY_STATUSES.includes(raw as EligibilityStatus)) {
    throw new DomainError(
      "INVALID_ELIGIBILITY_STATUS",
      `Invalid status: ${raw}`
    );
  }
  return raw as EligibilityStatus;
};

// ---

export const DOCUMENT_KINDS = [
  "waiver",
  "consent",
  "code_of_conduct",
  "privacy",
  "parental",
  "media_release",
  "injury_policy",
  "custom"
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const assertDocumentKind = (raw: string): DocumentKind => {
  if (!DOCUMENT_KINDS.includes(raw as DocumentKind)) {
    throw new DomainError("INVALID_DOCUMENT_KIND", `Invalid kind: ${raw}`);
  }
  return raw as DocumentKind;
};
