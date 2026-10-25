/**
 * Player compliance documents (COMP-3, COMP-1 / UC-29).
 *
 * A player, or the guardian of a linked minor, uploads an ID or
 * eligibility document (birth certificate, governing-body card,
 * government ID, a scanned signed waiver). A league or org admin whose
 * scope covers the season approves it, rejects it with a reason, or
 * asks for a new upload. One rule set for the API, the player page and
 * the admin queue, so the enum, labels, limits and decision rules
 * cannot drift.
 *
 * Must match the checks in migration 0054 and
 * `compliance_document_submissions` in @sportspulse/db.
 */

export const COMPLIANCE_DOCUMENT_KINDS = [
  "birth_certificate",
  "governing_body_card",
  "government_id",
  "signed_waiver",
  "other"
] as const;
export type ComplianceDocumentKind = (typeof COMPLIANCE_DOCUMENT_KINDS)[number];

/** Plain labels for the kind dropdown and every list. */
export const COMPLIANCE_DOCUMENT_KIND_LABELS: Record<ComplianceDocumentKind, string> = {
  birth_certificate: "Birth certificate",
  governing_body_card: "USA Hockey or other governing-body card",
  government_id: "Government photo ID",
  signed_waiver: "Signed waiver (scanned)",
  other: "Other document"
};

export const COMPLIANCE_DOCUMENT_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "resubmit_requested",
  "withdrawn"
] as const;
export type ComplianceDocumentStatus = (typeof COMPLIANCE_DOCUMENT_STATUSES)[number];

export const COMPLIANCE_DOCUMENT_STATUS_LABELS: Record<ComplianceDocumentStatus, string> = {
  pending: "Waiting for review",
  approved: "Approved",
  rejected: "Rejected",
  resubmit_requested: "New upload requested",
  withdrawn: "Withdrawn"
};

/** What an admin may decide. Each decision becomes the submission's status. */
export const COMPLIANCE_DOCUMENT_DECISIONS = [
  "approved",
  "rejected",
  "resubmit_requested"
] as const;
export type ComplianceDocumentDecision = (typeof COMPLIANCE_DOCUMENT_DECISIONS)[number];

export const COMPLIANCE_DOCUMENT_DECISION_LABELS: Record<ComplianceDocumentDecision, string> = {
  approved: "Approve",
  rejected: "Reject",
  resubmit_requested: "Request a new upload"
};

export const COMPLIANCE_DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp"
] as const;
export type ComplianceDocumentContentType = (typeof COMPLIANCE_DOCUMENT_CONTENT_TYPES)[number];

/**
 * 3 MiB per file. The API runs as a Vercel function, which refuses
 * request bodies over 4.5 MB; the file travels base64 (4/3 larger), so
 * 3 MiB decoded is the most that fits with room for the JSON around it.
 * The player page shrinks large photos before sending.
 */
export const COMPLIANCE_DOCUMENT_MAX_BYTES = 3 * 1024 * 1024;

/** Reason length for a decision. Required for reject and new-upload requests. */
export const COMPLIANCE_DECISION_REASON_MAX = 500;

/** Seconds a signed file link stays valid (5 minutes). */
export const COMPLIANCE_FILE_URL_TTL_SECONDS = 300;

/**
 * File type from the first bytes, never from the name or the declared
 * type. Returns null for anything that is not a PDF, PNG, JPEG or WebP.
 */
export function detectComplianceFileType(bytes: Uint8Array): ComplianceDocumentContentType | null {
  const b = bytes;
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) {
    return "application/pdf"; // %PDF-
  }
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "image/png";
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  ) {
    return "image/webp";
  }
  return null;
}

export function complianceFileExtension(type: ComplianceDocumentContentType): string {
  switch (type) {
    case "application/pdf":
      return "pdf";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

export type ComplianceUploadCheck =
  | { ok: true; contentType: ComplianceDocumentContentType }
  | { ok: false; reason: string };

/** Size and type check for an uploaded file. The API runs this on the decoded bytes. */
export function checkComplianceUpload(bytes: Uint8Array): ComplianceUploadCheck {
  if (bytes.length === 0) {
    return { ok: false, reason: "The file is empty. Choose the file again." };
  }
  if (bytes.length > COMPLIANCE_DOCUMENT_MAX_BYTES) {
    const mb = (bytes.length / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      reason: `The file is ${mb} MB. The limit is 3 MB. Scan at a lower resolution or upload a photo instead.`
    };
  }
  const contentType = detectComplianceFileType(bytes);
  if (!contentType) {
    return { ok: false, reason: "That file is not a PDF, PNG, JPG or WebP. Upload a scan or a photo in one of those formats." };
  }
  return { ok: true, contentType };
}

export type ComplianceDecisionCheck =
  | {
      ok: true;
      next: ComplianceDocumentStatus;
      /** Null when the decision needs no reason and none was given. */
      reason: string | null;
      /**
       * False when this exact decision (same status, same reason) is
       * already the current one: a replayed click. Nothing is written.
       */
      changed: boolean;
    }
  | { ok: false; code: "withdrawn" | "reason_required" | "reason_too_long"; reason: string };

/**
 * May an admin record `decision` on a submission whose status is
 * `current` and whose latest decision reason is `currentReason`?
 *
 * - A withdrawn submission takes no decision.
 * - Reject and new-upload requests need a reason the player can act on.
 *   Approve takes an optional note (UC-29: approve despite a mismatch).
 * - The same decision with the same reason again is a replay, not a new
 *   decision. A different decision, or the same one with a new reason,
 *   is appended: decisions are a log, the status is the latest entry.
 */
export function checkComplianceDecision(input: {
  current: ComplianceDocumentStatus;
  currentReason: string | null;
  decision: ComplianceDocumentDecision;
  reason: string | null | undefined;
}): ComplianceDecisionCheck {
  if (input.current === "withdrawn") {
    return { ok: false, code: "withdrawn", reason: "The player withdrew this document, so it cannot be decided." };
  }
  const reason = (input.reason ?? "").trim() || null;
  if (input.decision !== "approved" && !reason) {
    return {
      ok: false,
      code: "reason_required",
      reason:
        input.decision === "rejected"
          ? "Give the player a reason for the rejection."
          : "Tell the player what to fix in the new upload."
    };
  }
  if (reason && reason.length > COMPLIANCE_DECISION_REASON_MAX) {
    return {
      ok: false,
      code: "reason_too_long",
      reason: `Keep the reason under ${COMPLIANCE_DECISION_REASON_MAX} characters.`
    };
  }
  const changed = !(input.current === input.decision && (input.currentReason ?? null) === reason);
  return { ok: true, next: input.decision, reason, changed };
}

export function isComplianceDocumentKind(v: unknown): v is ComplianceDocumentKind {
  return typeof v === "string" && (COMPLIANCE_DOCUMENT_KINDS as readonly string[]).includes(v);
}

export function isComplianceDocumentStatus(v: unknown): v is ComplianceDocumentStatus {
  return typeof v === "string" && (COMPLIANCE_DOCUMENT_STATUSES as readonly string[]).includes(v);
}
