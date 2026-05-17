import { DomainError } from "@sportspulse/kernel";

export const REGISTRATION_STATUSES = [
  "draft",
  "pending_email_verification",
  "pending_parental_consent",
  "pending_payment",
  "pending_offline",
  "pending_review",
  "submitted",
  "under_review",
  "incomplete",
  "approved",
  "rejected",
  "waitlisted",
  "withdrawn",
  "cancelled"
] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

// Forward-only transitions kept conservative; the funnel + review handlers
// drive the flow. Adding a row here doesn't whitelist it — it just stops
// the read path from 422'ing existing DB rows (BUG-039).
const REG_TRANSITIONS: Record<RegistrationStatus, RegistrationStatus[]> = {
  draft: ["pending_email_verification", "pending_parental_consent", "pending_payment", "pending_offline", "pending_review", "submitted", "withdrawn", "cancelled"],
  pending_email_verification: ["pending_parental_consent", "pending_payment", "pending_offline", "pending_review", "submitted", "incomplete", "withdrawn", "cancelled"],
  pending_parental_consent: ["pending_payment", "pending_offline", "pending_review", "submitted", "incomplete", "withdrawn", "cancelled"],
  pending_payment: ["pending_review", "submitted", "incomplete", "withdrawn", "cancelled"],
  pending_offline: ["pending_review", "submitted", "approved", "incomplete", "withdrawn", "cancelled"],
  pending_review: ["under_review", "approved", "rejected", "waitlisted", "incomplete", "withdrawn", "cancelled"],
  submitted: ["pending_review", "under_review", "approved", "rejected", "waitlisted", "incomplete", "withdrawn", "cancelled"],
  under_review: ["approved", "rejected", "waitlisted", "incomplete", "withdrawn", "cancelled"],
  incomplete: ["pending_review", "submitted", "approved", "rejected", "withdrawn", "cancelled"],
  waitlisted: ["approved", "rejected", "withdrawn", "cancelled"],
  approved: ["withdrawn", "cancelled"],
  rejected: [],
  withdrawn: [],
  cancelled: []
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
