import { test } from "node:test";
import assert from "node:assert/strict";
import {
  afterOneGameServed,
  describeSuspension,
  servesWithFinalizedGame,
  suspensionBlocksGame,
  suspensionEndsAt,
  suspensionGamesRemaining,
  suspensionInForce,
  validateLiftReason,
  validateSuspensionIssue,
  type SuspensionTerms
} from "./suspensions";

const NOW = new Date("2026-10-25T12:00:00Z");
const DAY = 86_400_000;

function s(over: Partial<SuspensionTerms>): SuspensionTerms {
  return {
    kind: "n_games",
    status: "active",
    nGames: 2,
    nDays: null,
    servedCount: 0,
    startAt: new Date(NOW.getTime() - DAY),
    endAt: null,
    ...over
  };
}

test("issue: games count must be a whole number 1-99, reason required", () => {
  assert.equal(validateSuspensionIssue({ kind: "n_games", nGames: 2, reason: "Fighting" }, NOW), null);
  assert.match(validateSuspensionIssue({ kind: "n_games", nGames: 0, reason: "Fighting" }, NOW)!, /number of games/);
  assert.match(validateSuspensionIssue({ kind: "n_games", nGames: 1.5, reason: "Fighting" }, NOW)!, /number of games/);
  assert.match(validateSuspensionIssue({ kind: "n_games", nGames: 100, reason: "Fighting" }, NOW)!, /1 to 99/);
  assert.match(validateSuspensionIssue({ kind: "n_games", nGames: null, reason: "Fighting" }, NOW)!, /number of games/);
  assert.match(validateSuspensionIssue({ kind: "n_games", nGames: 1, reason: "  " }, NOW)!, /why/);
  assert.match(validateSuspensionIssue({ kind: "n_games", nGames: 1, reason: "x".repeat(501) }, NOW)!, /under 500/);
});

test("issue: until-date must be in the future; fields of other kinds are refused", () => {
  const tomorrow = new Date(NOW.getTime() + DAY).toISOString();
  assert.equal(validateSuspensionIssue({ kind: "time_bounded", endAt: tomorrow, reason: "Abuse" }, NOW), null);
  assert.match(validateSuspensionIssue({ kind: "time_bounded", endAt: null, reason: "Abuse" }, NOW)!, /date/);
  assert.match(validateSuspensionIssue({ kind: "time_bounded", endAt: "not a date", reason: "Abuse" }, NOW)!, /date/);
  assert.match(
    validateSuspensionIssue({ kind: "time_bounded", endAt: NOW.toISOString(), reason: "Abuse" }, NOW)!,
    /future/
  );
  assert.match(
    validateSuspensionIssue({ kind: "time_bounded", endAt: tomorrow, nGames: 2, reason: "Abuse" }, NOW)!,
    /games suspension/
  );
  assert.match(validateSuspensionIssue({ kind: "n_games", nGames: 2, endAt: tomorrow, reason: "Abuse" }, NOW)!, /end date/);
  assert.equal(validateSuspensionIssue({ kind: "indefinite", reason: "Match penalty, hearing" }, NOW), null);
  assert.match(validateSuspensionIssue({ kind: "forever", reason: "x y z" }, NOW)!, /how long/);
  assert.equal(validateSuspensionIssue({ kind: "n_days", nDays: 30, reason: "Match penalty" }, NOW), null);
  assert.match(validateSuspensionIssue({ kind: "n_days", nDays: 400, reason: "Match penalty" }, NOW)!, /1 to 365/);
});

test("lift reason is required", () => {
  assert.equal(validateLiftReason("Appeal upheld"), null);
  assert.match(validateLiftReason("")!, /why/);
  assert.match(validateLiftReason(null)!, /why/);
});

test("games remaining counts down and stops at zero; not active means zero", () => {
  assert.equal(suspensionGamesRemaining(s({ nGames: 3, servedCount: 1 })), 2);
  assert.equal(suspensionGamesRemaining(s({ nGames: 2, servedCount: 5 })), 0);
  assert.equal(suspensionGamesRemaining(s({ status: "lifted" })), 0);
  assert.equal(suspensionGamesRemaining(s({ kind: "indefinite", nGames: null })), null);
});

test("in force: by status, by start, by games left, by end date", () => {
  assert.equal(suspensionInForce(s({}), NOW), true);
  assert.equal(suspensionInForce(s({ status: "appealed" }), NOW), true, "an appeal does not suspend the suspension");
  assert.equal(suspensionInForce(s({ status: "lifted" }), NOW), false);
  assert.equal(suspensionInForce(s({ status: "served" }), NOW), false);
  assert.equal(suspensionInForce(s({ servedCount: 2 }), NOW), false);
  assert.equal(suspensionInForce(s({ startAt: new Date(NOW.getTime() + DAY) }), NOW), false, "not yet started");
  const end = new Date(NOW.getTime() + DAY);
  assert.equal(suspensionInForce(s({ kind: "time_bounded", nGames: null, endAt: end }), NOW), true);
  assert.equal(suspensionInForce(s({ kind: "time_bounded", nGames: null, endAt: end }), end), false, "free from the end instant");
  assert.equal(suspensionInForce(s({ kind: "time_bounded", nGames: null, endAt: null }), NOW), true, "malformed counts as standing");
  assert.equal(suspensionInForce(s({ kind: "n_days", nGames: null, nDays: 3 }), NOW), true);
  assert.equal(suspensionInForce(s({ kind: "n_days", nGames: null, nDays: 1 }), NOW), false);
  assert.equal(suspensionInForce(s({ kind: "indefinite", nGames: null }), NOW), true);
  assert.equal(suspensionInForce(s({ kind: "something_new", nGames: null }), NOW), true, "unknown kind is never assumed away");
});

test("ends at: until-date and days; none for games and indefinite", () => {
  const start = new Date("2026-10-01T00:00:00Z");
  assert.equal(suspensionEndsAt(s({ kind: "n_days", nDays: 10, startAt: start }))!.toISOString(), "2026-10-11T00:00:00.000Z");
  assert.equal(suspensionEndsAt(s({ kind: "time_bounded", endAt: "2026-11-03T05:00:00Z" }))!.toISOString(), "2026-11-03T05:00:00.000Z");
  assert.equal(suspensionEndsAt(s({})), null);
});

test("blocks game: a 2-game suspension covers the team's next two games only", () => {
  const two = s({ nGames: 2 });
  const later = new Date(NOW.getTime() + 7 * DAY);
  assert.equal(suspensionBlocksGame(two, { start: later, unplayedTeamGamesBefore: 0 }), true, "next game");
  assert.equal(suspensionBlocksGame(two, { start: later, unplayedTeamGamesBefore: 1 }), true, "second game");
  assert.equal(suspensionBlocksGame(two, { start: later, unplayedTeamGamesBefore: 2 }), false, "third game");
  assert.equal(suspensionBlocksGame(s({ nGames: 2, servedCount: 1 }), { start: later, unplayedTeamGamesBefore: 1 }), false);
  assert.equal(suspensionBlocksGame(s({ status: "lifted" }), { start: later, unplayedTeamGamesBefore: 0 }), false);
});

test("blocks game: until-date covers games before the date, not after", () => {
  const until = s({ kind: "time_bounded", nGames: null, endAt: new Date(NOW.getTime() + 3 * DAY) });
  assert.equal(suspensionBlocksGame(until, { start: new Date(NOW.getTime() + 2 * DAY), unplayedTeamGamesBefore: 5 }), true);
  assert.equal(suspensionBlocksGame(until, { start: new Date(NOW.getTime() + 4 * DAY), unplayedTeamGamesBefore: 0 }), false);
});

test("served on finalize: only games that started after the suspension, not the penalty's game, player on a team", () => {
  const sus = s({ startAt: new Date("2026-10-20T03:00:00Z") });
  const after = new Date("2026-10-27T01:00:00Z");
  assert.equal(servesWithFinalizedGame(sus, { start: after, isSourceGame: false, playerOnTeamInGame: true }), true);
  assert.equal(servesWithFinalizedGame(sus, { start: after, isSourceGame: true, playerOnTeamInGame: true }), false);
  assert.equal(servesWithFinalizedGame(sus, { start: after, isSourceGame: false, playerOnTeamInGame: false }), false);
  assert.equal(
    servesWithFinalizedGame(sus, { start: new Date("2026-10-19T01:00:00Z"), isSourceGame: false, playerOnTeamInGame: true }),
    false,
    "a game that began before the suspension was issued does not count"
  );
  assert.equal(
    servesWithFinalizedGame(s({ kind: "time_bounded", nGames: null }), { start: after, isSourceGame: false, playerOnTeamInGame: true }),
    false
  );
  assert.equal(servesWithFinalizedGame(s({ servedCount: 2 }), { start: after, isSourceGame: false, playerOnTeamInGame: true }), false);
});

test("after one game served: status turns served on the last game", () => {
  assert.deepEqual(afterOneGameServed(s({ nGames: 2, servedCount: 0 })), { servedCount: 1, status: "active" });
  assert.deepEqual(afterOneGameServed(s({ nGames: 2, servedCount: 1 })), { servedCount: 2, status: "served" });
});

test("describe in plain words", () => {
  assert.equal(describeSuspension(s({ nGames: 3, servedCount: 1 }), NOW), "2 of 3 games left");
  assert.equal(describeSuspension(s({ nGames: 1 }), NOW), "1 of 1 game left");
  assert.equal(describeSuspension(s({ status: "lifted" }), NOW), "Lifted");
  assert.equal(describeSuspension(s({ status: "served" }), NOW), "Served");
  assert.equal(describeSuspension(s({ kind: "indefinite", nGames: null }), NOW), "Until lifted");
  assert.match(describeSuspension(s({ kind: "time_bounded", nGames: null, endAt: "2026-11-03T12:00:00Z" }), NOW), /^Until Nov 3, 2026$/);
  assert.match(describeSuspension(s({ kind: "time_bounded", nGames: null, endAt: "2026-10-01T12:00:00Z" }), NOW), /^Ended /);
});
