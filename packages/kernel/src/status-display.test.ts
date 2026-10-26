import { test } from "node:test";
import assert from "node:assert/strict";
import { statusLabel, statusTone } from "./status-display";
import { REGISTRATION_STATES } from "./registration-states";

test("finished statuses are success in every domain", () => {
  for (const s of ["approved", "accepted", "confirmed", "completed", "paid", "succeeded", "shipped"]) {
    assert.equal(statusTone(s), "success", s);
  }
});

test("waiting statuses are warning, including every pending registration state", () => {
  for (const s of REGISTRATION_STATES.filter((x) => x.startsWith("pending_"))) {
    assert.equal(statusTone(s), "warning", s);
  }
  for (const s of ["pending", "submitted", "under_review", "partial", "incomplete", "tentative"]) {
    assert.equal(statusTone(s), "warning", s);
  }
});

test("refusals and failures are danger", () => {
  for (const s of ["rejected", "failed", "declined", "overdue", "forfeited", "disqualified"]) {
    assert.equal(statusTone(s), "danger", s);
  }
});

test("user-chosen endings are neutral, not danger", () => {
  for (const s of ["cancelled", "withdrawn", "void", "draft", "archived", "expired", "revoked"]) {
    assert.equal(statusTone(s), "neutral", s);
  }
});

test("every registration state has a tone and a label", () => {
  for (const s of REGISTRATION_STATES) {
    assert.ok(statusLabel(s).length > 0, s);
    assert.ok(["neutral", "success", "warning", "danger", "info"].includes(statusTone(s)), s);
  }
});

test("domain overrides change only the word they name", () => {
  assert.equal(statusTone("placed"), "success");
  assert.equal(statusTone("placed", "store_order"), "warning");
  assert.equal(statusTone("sent"), "info");
  assert.equal(statusTone("sent", "notification"), "success");
  assert.equal(statusTone("paid", "store_order"), "success");
});

test("unknown, blank and differently cased statuses are safe", () => {
  assert.equal(statusTone("something_new"), "neutral");
  assert.equal(statusTone(null), "neutral");
  assert.equal(statusTone(""), "neutral");
  assert.equal(statusTone("PAID"), "success");
  assert.equal(statusLabel(undefined), "Unknown");
  assert.equal(statusLabel(""), "Unknown");
});

test("labels read as words, with registration labels from the state machine", () => {
  assert.equal(statusLabel("pending_review"), "Pending review");
  assert.equal(statusLabel("pending_offline"), "Pending offline payment");
  assert.equal(statusLabel("in_play"), "In play");
  assert.equal(statusLabel("something_new"), "Something new");
  assert.equal(statusLabel("paid"), "Paid");
  assert.ok(!statusLabel("incomplete").includes("—"));
});

test("game, compliance and bracket domains use their own words and colours", () => {
  assert.equal(statusLabel("in_play", "game"), "Live");
  assert.equal(statusLabel("completed", "game"), "Final");
  assert.equal(statusLabel("completed"), "Completed");
  assert.equal(statusTone("expired", "compliance"), "danger");
  assert.equal(statusTone("expired"), "neutral");
  assert.equal(statusTone("active", "bracket"), "info");
  assert.equal(statusLabel("active", "bracket"), "In progress");
  assert.equal(statusTone("complete"), "success");
});

test("transfer states read the same words as the roster rules", () => {
  assert.equal(statusLabel("pending_destination"), "Awaiting destination captain");
  assert.equal(statusLabel("pending_admin"), "Awaiting admin approval");
  assert.equal(statusTone("pending_admin"), "warning");
});
