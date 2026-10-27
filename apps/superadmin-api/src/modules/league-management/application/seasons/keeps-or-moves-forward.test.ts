import { test } from "node:test";
import assert from "node:assert/strict";
import { keepsOrMovesForward } from "./handlers";

// PPHL test F-6: one date rule for season create and edit.
const DAY = 24 * 60 * 60 * 1000;
const msg = "Registration cannot open in the past.";
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

test("a field the request leaves out or clears is accepted", () => {
  assert.doesNotThrow(() => keepsOrMovesForward(msg, undefined, new Date()));
  assert.doesNotThrow(() => keepsOrMovesForward(msg, null, null));
});

test("today and later are accepted, including an hour ago ('open now')", () => {
  assert.doesNotThrow(() => keepsOrMovesForward(msg, iso(-60 * 60 * 1000), null));
  assert.doesNotThrow(() => keepsOrMovesForward(msg, iso(7 * DAY), null));
});

test("a date moved to last week is refused", () => {
  assert.throws(() => keepsOrMovesForward(msg, iso(-7 * DAY), null), { message: msg });
  assert.throws(() => keepsOrMovesForward(msg, iso(-7 * DAY), new Date(Date.now() + DAY)), { message: msg });
});

test("a date already saved stays, even resent as local midnight", () => {
  const saved = new Date(Date.now() - 30 * DAY);
  assert.doesNotThrow(() => keepsOrMovesForward(msg, saved.toISOString(), saved));
  assert.doesNotThrow(() => keepsOrMovesForward(msg, new Date(saved.getTime() - 10 * 60 * 60 * 1000).toISOString(), saved));
});

test("text that is not a date is refused", () => {
  assert.throws(() => keepsOrMovesForward(msg, "not-a-date", null), { message: msg });
});
