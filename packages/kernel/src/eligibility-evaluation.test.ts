import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ageOnDate,
  evaluateSeasonEligibility,
  genderMatchesDivision,
  sweepOutcome,
  type SeasonEligibilityInput
} from "./eligibility-evaluation";

const NOW = new Date("2026-10-25T12:00:00Z");

function input(over: Partial<SeasonEligibilityInput> = {}): SeasonEligibilityInput {
  return {
    now: NOW,
    season: { startDate: "2026-09-01", endDate: "2027-04-30", requireUsaHockeyId: false },
    division: { genderEligibility: "open", maxRosterSize: 20 },
    person: { dobDate: "1990-05-01", genderSelfId: null },
    rosterCount: 12,
    usaHockeyId: null,
    suspensions: [],
    ...over
  };
}

test("clean adult in an open division with no ID rule is eligible", () => {
  const r = evaluateSeasonEligibility(input());
  assert.equal(r.status, "eligible");
  assert.equal(r.ruleEvaluation.ageRestriction?.status, "not_required");
  assert.equal(r.ruleEvaluation.suspension?.status, "clear");
  assert.equal(r.ruleEvaluation.rosterSize?.countAtCheck, 12);
  assert.deepEqual(r.reasons, []);
});

test("COMP-14: missing DOB under an age rule is pending, never eligible", () => {
  const r = evaluateSeasonEligibility(
    input({ person: { dobDate: null, genderSelfId: null }, division: { genderEligibility: "open", maxRosterSize: 20, ageMinYears: 18 } })
  );
  assert.equal(r.status, "pending");
  assert.equal(r.ruleEvaluation.ageRestriction?.status, "unknown");
  assert.equal(r.ruleEvaluation.ageRestriction?.ageAtReferenceDate, null);
});

test("age out of range is ineligible; age computed by calendar date", () => {
  const r = evaluateSeasonEligibility(
    input({ person: { dobDate: "2008-09-02", genderSelfId: null }, division: { genderEligibility: "open", maxRosterSize: 20, ageMinYears: 18 } })
  );
  assert.equal(r.ruleEvaluation.ageRestriction?.ageAtReferenceDate, 17);
  assert.equal(r.status, "ineligible");
  assert.equal(ageOnDate("2008-09-01", "2026-09-01"), 18);
  assert.equal(ageOnDate("2008-09-02", "2026-09-01"), 17);
});

test("gendered division: unknown gender is pending, mismatch is flagged", () => {
  const div = { genderEligibility: "female", maxRosterSize: 20 };
  assert.equal(evaluateSeasonEligibility(input({ division: div })).status, "pending");
  assert.equal(
    evaluateSeasonEligibility(input({ division: div, person: { dobDate: "1990-01-01", genderSelfId: "male" } })).status,
    "flagged"
  );
  assert.equal(
    evaluateSeasonEligibility(input({ division: div, person: { dobDate: "1990-01-01", genderSelfId: "F" } })).status,
    "eligible"
  );
  assert.equal(genderMatchesDivision("mixed", null), true);
  assert.equal(genderMatchesDivision(null, null), true);
});

test("roster over the division cap is flagged", () => {
  const r = evaluateSeasonEligibility(input({ rosterCount: 21 }));
  assert.equal(r.status, "flagged");
  assert.equal(r.ruleEvaluation.rosterSize?.status, "blocked");
});

test("COMP-14: required USA Hockey ID — missing or self-attested is pending, not verified", () => {
  const season = { startDate: "2026-09-01", endDate: "2027-04-30", requireUsaHockeyId: true };
  const none = evaluateSeasonEligibility(input({ season }));
  assert.equal(none.status, "pending");
  assert.equal(none.ruleEvaluation.usaHockeyId?.status, "not_provided");

  const selfReported = evaluateSeasonEligibility(
    input({ season, usaHockeyId: { externalId: "ABC123456", status: "pending", expiresAt: "2027-08-31", source: "self_attest" } })
  );
  assert.equal(selfReported.status, "pending");
  assert.equal(selfReported.ruleEvaluation.usaHockeyId?.status, "pending");

  const verified = evaluateSeasonEligibility(
    input({ season, usaHockeyId: { externalId: "ABC123456", status: "verified", expiresAt: "2027-08-31", source: "api" } })
  );
  assert.equal(verified.status, "eligible");
  assert.equal(verified.ruleEvaluation.usaHockeyId?.source, "live_api");

  const expiring = evaluateSeasonEligibility(
    input({ season, usaHockeyId: { externalId: "ABC123456", status: "verified", expiresAt: "2027-01-31", source: "api" } })
  );
  assert.equal(expiring.status, "expiring");

  const expired = evaluateSeasonEligibility(
    input({ season, usaHockeyId: { externalId: "ABC123456", status: "verified", expiresAt: "2026-08-31", source: "api" } })
  );
  assert.equal(expired.status, "expired");

  const mismatch = evaluateSeasonEligibility(
    input({ season, usaHockeyId: { externalId: "ABC123456", status: "mismatch", expiresAt: null, source: "api" } })
  );
  assert.equal(mismatch.status, "flagged");
});

test("ID not required: no usaHockeyId block at all", () => {
  assert.equal(evaluateSeasonEligibility(input()).ruleEvaluation.usaHockeyId, undefined);
});

test("COMP-14: a standing suspension makes the record ineligible and is listed", () => {
  const r = evaluateSeasonEligibility(
    input({
      suspensions: [
        {
          id: "s1",
          kind: "n_games",
          status: "active",
          nGames: 2,
          nDays: null,
          servedCount: 1,
          startAt: "2026-10-20T00:00:00Z",
          endAt: null,
          reason: "Fighting"
        },
        {
          id: "s2",
          kind: "n_games",
          status: "served",
          nGames: 1,
          nDays: null,
          servedCount: 1,
          startAt: "2026-09-20T00:00:00Z",
          endAt: "2026-09-27T00:00:00Z",
          reason: "Game misconduct"
        }
      ]
    })
  );
  assert.equal(r.status, "ineligible");
  assert.equal(r.ruleEvaluation.suspension?.status, "suspended");
  assert.equal(r.ruleEvaluation.suspension?.suspensions.length, 1);
  assert.equal(r.ruleEvaluation.suspension?.suspensions[0]?.gamesRemaining, 1);
  assert.equal(r.ruleEvaluation.suspension?.suspensions[0]?.label, "1 of 2 games left");
});

test("worst status wins: suspension beats expiring and pending", () => {
  const r = evaluateSeasonEligibility(
    input({
      person: { dobDate: null, genderSelfId: null },
      division: { genderEligibility: "open", maxRosterSize: 20, ageMinYears: 18 },
      suspensions: [
        { id: "s1", kind: "indefinite", status: "active", nGames: null, nDays: null, servedCount: 0, startAt: "2026-10-01T00:00:00Z", endAt: null, reason: "Match penalty" }
      ]
    })
  );
  assert.equal(r.status, "ineligible");
  assert.equal(r.reasons.length, 2);
});

test("COMP-17: a sweep never overwrites an admin waiver", () => {
  assert.deepEqual(sweepOutcome("waived", "eligible"), { status: "waived", keptWaiver: true });
  assert.deepEqual(sweepOutcome("waived", "ineligible"), { status: "waived", keptWaiver: true });
  assert.deepEqual(sweepOutcome("pending", "eligible"), { status: "eligible", keptWaiver: false });
  assert.deepEqual(sweepOutcome(null, "pending"), { status: "pending", keptWaiver: false });
});
