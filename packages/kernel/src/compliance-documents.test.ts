import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPLIANCE_DOCUMENT_MAX_BYTES,
  checkComplianceDecision,
  checkComplianceUpload,
  complianceFileExtension,
  detectComplianceFileType
} from "./compliance-documents";

const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0]);

test("COMP-3: file type comes from the bytes", () => {
  assert.equal(detectComplianceFileType(PDF), "application/pdf");
  assert.equal(detectComplianceFileType(PNG), "image/png");
  assert.equal(detectComplianceFileType(JPG), "image/jpeg");
  assert.equal(detectComplianceFileType(WEBP), "image/webp");
  // A text file renamed to .pdf, an HTML page, a zip: refused.
  assert.equal(detectComplianceFileType(new TextEncoder().encode("hello.pdf")), null);
  assert.equal(detectComplianceFileType(new TextEncoder().encode("<html><script>")), null);
  assert.equal(detectComplianceFileType(Uint8Array.from([0x50, 0x4b, 0x03, 0x04])), null);
  // Truncated headers are not a match.
  assert.equal(detectComplianceFileType(Uint8Array.from([0x25, 0x50, 0x44])), null);
  assert.equal(detectComplianceFileType(new Uint8Array(0)), null);
});

test("COMP-3: extension follows the detected type", () => {
  assert.equal(complianceFileExtension("application/pdf"), "pdf");
  assert.equal(complianceFileExtension("image/jpeg"), "jpg");
  assert.equal(complianceFileExtension("image/png"), "png");
  assert.equal(complianceFileExtension("image/webp"), "webp");
});

test("COMP-3: size boundaries (empty, exactly 3 MiB, one byte over)", () => {
  assert.deepEqual(checkComplianceUpload(new Uint8Array(0)).ok, false);
  const atLimit = new Uint8Array(COMPLIANCE_DOCUMENT_MAX_BYTES);
  atLimit.set(PDF);
  assert.deepEqual(checkComplianceUpload(atLimit), { ok: true, contentType: "application/pdf" });
  const over = new Uint8Array(COMPLIANCE_DOCUMENT_MAX_BYTES + 1);
  over.set(PDF);
  const r = checkComplianceUpload(over);
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /limit is 3 MB/);
  const notAFile = checkComplianceUpload(new TextEncoder().encode("just text"));
  assert.equal(notAFile.ok, false);
});

test("COMP-1: reject and new-upload requests need a reason; approve does not", () => {
  const base = { current: "pending" as const, currentReason: null };
  assert.deepEqual(checkComplianceDecision({ ...base, decision: "approved", reason: undefined }), {
    ok: true,
    next: "approved",
    reason: null,
    changed: true
  });
  const noReason = checkComplianceDecision({ ...base, decision: "rejected", reason: "   " });
  assert.equal(noReason.ok, false);
  assert.equal((noReason as { code: string }).code, "reason_required");
  const resubmit = checkComplianceDecision({ ...base, decision: "resubmit_requested", reason: null });
  assert.equal((resubmit as { code: string }).code, "reason_required");
  const tooLong = checkComplianceDecision({ ...base, decision: "rejected", reason: "x".repeat(501) });
  assert.equal((tooLong as { code: string }).code, "reason_too_long");
  const ok = checkComplianceDecision({ ...base, decision: "rejected", reason: "  Photo is blurry " });
  assert.deepEqual(ok, { ok: true, next: "rejected", reason: "Photo is blurry", changed: true });
});

test("COMP-1: a replayed click is not a new decision; a changed reason is", () => {
  const replay = checkComplianceDecision({
    current: "rejected",
    currentReason: "Photo is blurry",
    decision: "rejected",
    reason: "Photo is blurry"
  });
  assert.equal(replay.ok && replay.changed, false);
  const newReason = checkComplianceDecision({
    current: "rejected",
    currentReason: "Photo is blurry",
    decision: "rejected",
    reason: "Name does not match"
  });
  assert.equal(newReason.ok && newReason.changed, true);
  // Change of mind after an approval is allowed and logged.
  const revoke = checkComplianceDecision({
    current: "approved",
    currentReason: null,
    decision: "rejected",
    reason: "Approved by mistake: wrong person"
  });
  assert.equal(revoke.ok && revoke.next, "rejected");
  const withdrawn = checkComplianceDecision({
    current: "withdrawn",
    currentReason: null,
    decision: "approved",
    reason: null
  });
  assert.equal((withdrawn as { code: string }).code, "withdrawn");
});
