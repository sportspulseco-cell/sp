import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedSubmissionTypes,
  seasonRegistrationType,
  submissionTypeRefusal
} from "./registration-paths";
import {
  ageOn,
  guardianNameAcceptable,
  initialFunnelRegistrationState,
  isMinorOn,
  parentalConsentText
} from "./registration-consent";
import { assertValidTransition, canTransition } from "./registration-states";

test("REG-14: an unset registration type keeps every path the funnel offered before", () => {
  assert.equal(seasonRegistrationType({}), "both");
  assert.equal(seasonRegistrationType(null), "both");
  assert.equal(seasonRegistrationType({ registrationType: "nonsense" }), "both");
  assert.deepEqual(allowedSubmissionTypes({}), ["team", "individual", "captain_invite"]);
  assert.deepEqual(allowedSubmissionTypes({ allowFreeAgent: true }), [
    "team",
    "individual",
    "free_agent",
    "captain_invite"
  ]);
});

test("REG-14: team seasons offer team + captain invite; individual seasons offer player + free agent", () => {
  assert.deepEqual(allowedSubmissionTypes({ registrationType: "team", allowFreeAgent: true }), [
    "team",
    "captain_invite"
  ]);
  assert.deepEqual(allowedSubmissionTypes({ registrationType: "individual", allowFreeAgent: true }), [
    "individual",
    "free_agent"
  ]);
  assert.deepEqual(allowedSubmissionTypes({ registrationType: "individual" }), ["individual"]);
});

test("REG-14: a refused path names what the season does take", () => {
  assert.equal(submissionTypeRefusal({ registrationType: "team" }, "team"), null);
  const msg = submissionTypeRefusal({ registrationType: "team" }, "individual");
  assert.match(msg ?? "", /does not take individual player registration/);
  assert.match(msg ?? "", /team registration or registration from a captain's invite/);
  assert.match(submissionTypeRefusal({}, "free_agent") ?? "", /does not take free-agent registration/);
});

test("minor rule: under 18 on the day checked, unknown DOB is not a minor", () => {
  const on = new Date("2026-10-25T12:00:00Z");
  assert.equal(ageOn("2012-03-03", on), 14);
  assert.equal(isMinorOn("2012-03-03", on), true);
  assert.equal(isMinorOn("2008-10-25", on), false); // 18th birthday today
  assert.equal(isMinorOn("2008-10-26", on), true); // 18 tomorrow
  assert.equal(isMinorOn(null, on), false);
  assert.equal(isMinorOn("not-a-date", on), false);
});

test("consent bypass: a minor's registration starts in pending_consent, an adult's in pending_payment", () => {
  const on = new Date("2026-10-25T12:00:00Z");
  assert.equal(initialFunnelRegistrationState("2012-03-03", on), "pending_consent");
  assert.equal(initialFunnelRegistrationState("1990-01-01", on), "pending_payment");
  assert.equal(initialFunnelRegistrationState(null, on), "pending_payment");
  // Both are legal first states from draft.
  assert.doesNotThrow(() => assertValidTransition("draft", "pending_consent"));
  assert.doesNotThrow(() => assertValidTransition("draft", "pending_payment"));
});

test("a DOB that turns out to be a minor's sends pending_payment back to consent; submitted rows never go back", () => {
  assert.equal(canTransition("pending_payment", "pending_consent"), true);
  assert.equal(canTransition("pending_review", "pending_consent"), false);
  assert.equal(canTransition("pending_review", "draft"), false);
  assert.equal(canTransition("approved", "pending_payment"), false);
  // Guardian consent is the only way out of pending_consent besides cancel.
  assert.equal(canTransition("pending_consent", "pending_review"), false);
});

test("REG-15: guardian consent text names the season and org; the typed name needs first and last", () => {
  const text = parentalConsentText({ seasonName: "Fall 2026", orgName: "PPHL" });
  assert.match(text, /Fall 2026 with PPHL/);
  assert.match(text, /under 18/);
  assert.equal(guardianNameAcceptable("Pat Parent"), true);
  assert.equal(guardianNameAcceptable("Pat"), false);
  assert.equal(guardianNameAcceptable("  "), false);
  assert.equal(guardianNameAcceptable(null), false);
});

import {
  formatFreeAgentAvailability,
  freeAgentOfferExpiry,
  freeAgentOfferStatus,
  freeAgentLevelLabel
} from "./free-agents";

test("free agents: availability reads the player form's Mon/AM keys and legacy lowercase/boolean rows", () => {
  assert.equal(formatFreeAgentAvailability({ Mon: ["AM"], Wed: [], Sat: ["EVE"] }), "Mon, Sat");
  assert.equal(formatFreeAgentAvailability({ mon: true, fri: false }), "Mon");
  assert.equal(formatFreeAgentAvailability({}), "—");
  // REG-21: one A-D list; older C1/C2 rows read as C, C3 as D.
  assert.equal(freeAgentLevelLabel("C2"), "C — Recreational");
  assert.equal(freeAgentLevelLabel("D"), "D — Beginner");
});

test("free-agent offers expire after 7 days or at the roster lock, whichever is first", () => {
  const now = new Date("2026-10-25T00:00:00Z");
  assert.equal(freeAgentOfferExpiry(now, null).toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(
    freeAgentOfferExpiry(now, new Date("2026-10-28T00:00:00Z")).toISOString(),
    "2026-10-28T00:00:00.000Z"
  );
  // A lock already passed does not shorten it (the API refuses the offer instead).
  assert.equal(
    freeAgentOfferExpiry(now, new Date("2026-10-20T00:00:00Z")).toISOString(),
    "2026-11-01T00:00:00.000Z"
  );
  assert.equal(freeAgentOfferStatus("pending", "2026-10-24T00:00:00Z", now), "expired");
  assert.equal(freeAgentOfferStatus("extended", "2026-10-26T00:00:00Z", now), "pending");
  assert.equal(freeAgentOfferStatus("accepted", null, now), "accepted");
});
