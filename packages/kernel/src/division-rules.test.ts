import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DIVISION_GAME_RULES,
  DEFAULT_DIVISION_PLAYOFF_CONFIG,
  DEFAULT_DIVISION_TIEBREAKERS,
  copyDivisionRules,
  defaultDivisionRules,
  parsePlayoffSpots,
  playoffSpotsLabel,
  readDivisionRules
} from "./division-rules";
import { DEFAULT_POINTS_RULE, STANDINGS_TIEBREAKERS } from "./game-results";

// The row PPHL created on production for Waves / Spring 27 / North
// (2026-11-03): six values differ from the wizard defaults.
const NORTH_RULES = {
  gameRules: {
    clockType: "running",
    periodLengthMin: 17,
    numberOfPeriods: 3,
    overtimeRule: "none",
    bodyChecking: "not_permitted_penalty",
    minStartersToStart: 10,
    maxGuestPlayersPerGame: 4,
    maxRosterSize: 20
  },
  ageRange: { min: 18 }
};
const NORTH_PLAYOFFS = {
  enabled: true,
  playoffSpots: 8,
  seriesFormat: "best_of_1",
  bracketType: "double_elim",
  homeIceRule: "higher_seed_first"
};

test("an empty or missing rule set reads as the wizard defaults", () => {
  const expected = defaultDivisionRules();
  assert.deepEqual(readDivisionRules({}, {}), expected);
  assert.deepEqual(readDivisionRules(undefined, null), expected);
  assert.deepEqual(readDivisionRules("not an object", 42), expected);
  assert.deepEqual(expected.gameRules, DEFAULT_DIVISION_GAME_RULES);
  assert.deepEqual(expected.playoffConfig, DEFAULT_DIVISION_PLAYOFF_CONFIG);
  assert.deepEqual(expected.pointsRule, DEFAULT_POINTS_RULE);
  assert.deepEqual(expected.tiebreakers, [...STANDINGS_TIEBREAKERS]);
  assert.deepEqual([...DEFAULT_DIVISION_TIEBREAKERS], [...STANDINGS_TIEBREAKERS]);
});

test("a stored row keeps every value it has and fills the rest", () => {
  const r = readDivisionRules(NORTH_RULES, NORTH_PLAYOFFS);
  assert.equal(r.gameRules.clockType, "running");
  assert.equal(r.gameRules.periodLengthMin, 17);
  assert.equal(r.gameRules.overtimeRule, "none");
  assert.equal(r.gameRules.minStartersToStart, 10);
  assert.equal(r.playoffConfig.bracketType, "double_elim");
  assert.equal(r.playoffConfig.seriesFormat, "best_of_1");
  assert.equal(r.playoffConfig.playoffSpots, 8, "a row written before the every-team choice keeps its Top 8");
  assert.equal(r.ageRange.min, 18);
  // Filled in, not left undefined.
  assert.equal(r.ageRange.max, null);
  assert.equal(r.ageRange.label, "Custom age group");
  assert.equal(r.playoffConfig.startDate, "");
  assert.equal(r.playoffConfig.endDate, "");
  assert.deepEqual(r.pointsRule, DEFAULT_POINTS_RULE);
  assert.deepEqual(r.tiebreakers, [...STANDINGS_TIEBREAKERS]);
});

test("unknown choices and bad numbers fall back to the default for that key only", () => {
  const r = readDivisionRules(
    {
      gameRules: {
        clockType: "paused",
        overtimeRule: 5,
        bodyChecking: null,
        numberOfPeriods: 0,
        periodLengthMin: "22",
        minStartersToStart: -3,
        maxGuestPlayersPerGame: 0,
        maxRosterSize: 2.5
      },
      ageRange: { min: -1, max: 60, label: 7 },
      pointsRule: { win: 3, loss: 11 }
    },
    { enabled: "yes", playoffSpots: 1, startDate: "next week", endDate: "2027-03-01", seriesFormat: "bo3", bracketType: "ladder" }
  );
  assert.equal(r.gameRules.clockType, "stopped");
  assert.equal(r.gameRules.overtimeRule, "5_min");
  assert.equal(r.gameRules.bodyChecking, "not_permitted_penalty");
  assert.equal(r.gameRules.numberOfPeriods, 3);
  assert.equal(r.gameRules.periodLengthMin, 20);
  assert.equal(r.gameRules.minStartersToStart, 6);
  assert.equal(r.gameRules.maxGuestPlayersPerGame, 0, "zero guests is a real setting");
  assert.equal(r.gameRules.maxRosterSize, 20);
  assert.equal(r.ageRange.min, null);
  assert.equal(r.ageRange.max, 60);
  assert.equal(r.ageRange.label, "Custom age group");
  assert.equal(r.pointsRule.win, 3);
  assert.equal(r.pointsRule.loss, DEFAULT_POINTS_RULE.loss, "11 points is out of range");
  assert.equal(r.playoffConfig.enabled, true);
  assert.equal(r.playoffConfig.playoffSpots, null, "1 spot is not a bracket: every team");
  assert.equal(r.playoffConfig.startDate, "");
  assert.equal(r.playoffConfig.endDate, "2027-03-01");
  assert.equal(r.playoffConfig.seriesFormat, "best_of_1");
  assert.equal(r.playoffConfig.bracketType, "single_elim");
});

test("tiebreakers keep the stored order, drop repeats and unknown codes, default when empty", () => {
  assert.deepEqual(
    readDivisionRules({ tiebreakers: ["goal_diff", "wins", "goal_diff", "fair_play"] }, {}).tiebreakers,
    ["goal_diff", "wins"]
  );
  assert.deepEqual(readDivisionRules({ tiebreakers: [] }, {}).tiebreakers, [...STANDINGS_TIEBREAKERS]);
  assert.deepEqual(readDivisionRules({ tiebreakers: "wins" }, {}).tiebreakers, [...STANDINGS_TIEBREAKERS]);
});

test("every read returns fresh objects: editing one never changes the defaults or another read", () => {
  const a = readDivisionRules({}, {});
  a.gameRules.clockType = "running";
  a.tiebreakers.reverse();
  a.playoffConfig.playoffSpots = 4;
  a.pointsRule.win = 9;
  const b = readDivisionRules({}, {});
  assert.equal(b.gameRules.clockType, "stopped");
  assert.deepEqual(b.tiebreakers, [...STANDINGS_TIEBREAKERS]);
  assert.equal(b.playoffConfig.playoffSpots, null);
  assert.equal(b.pointsRule.win, DEFAULT_POINTS_RULE.win);
  assert.equal(DEFAULT_DIVISION_GAME_RULES.clockType, "stopped");
  assert.equal(DEFAULT_DIVISION_PLAYOFF_CONFIG.playoffSpots, null);
});

test("playoff spots: a new division takes every team; a number is Top N; junk is every team", () => {
  assert.equal(DEFAULT_DIVISION_PLAYOFF_CONFIG.playoffSpots, null, "PPHL letter item 4: every team by default");
  assert.equal(readDivisionRules({}, {}).playoffConfig.playoffSpots, null, "missing");
  assert.equal(readDivisionRules({}, { playoffSpots: null }).playoffConfig.playoffSpots, null, "stored null");
  assert.equal(readDivisionRules({}, { playoffSpots: 4 }).playoffConfig.playoffSpots, 4);
  assert.equal(parsePlayoffSpots(undefined), null);
  assert.equal(parsePlayoffSpots(null), null);
  assert.equal(parsePlayoffSpots(2), 2, "two teams is the smallest bracket");
  assert.equal(parsePlayoffSpots(16), 16);
  assert.equal(parsePlayoffSpots(0), null);
  assert.equal(parsePlayoffSpots(1), null);
  assert.equal(parsePlayoffSpots(-4), null);
  assert.equal(parsePlayoffSpots(4.5), null);
  assert.equal(parsePlayoffSpots("8"), null, "a string is not a stored count");
  assert.equal(parsePlayoffSpots(Number.NaN), null);
});

test("playoff spots label: All teams or Top N", () => {
  assert.equal(playoffSpotsLabel(null), "All teams");
  assert.equal(playoffSpotsLabel(4), "Top 4");
  assert.equal(playoffSpotsLabel(8), "Top 8");
  assert.equal(playoffSpotsLabel(parsePlayoffSpots(undefined)), "All teams");
  assert.equal(playoffSpotsLabel(readDivisionRules({}, NORTH_PLAYOFFS).playoffConfig.playoffSpots), "Top 8");
});

test("a copy is identical but independent", () => {
  const source = readDivisionRules(
    { ...NORTH_RULES, tiebreakers: ["head_to_head", "wins"], pointsRule: { win: 3 } },
    { ...NORTH_PLAYOFFS, startDate: "2027-03-01", endDate: "2027-03-20" }
  );
  const copy = copyDivisionRules(source);
  assert.deepEqual(copy, source);
  assert.notEqual(copy.gameRules, source.gameRules);
  assert.notEqual(copy.tiebreakers, source.tiebreakers);
  assert.notEqual(copy.pointsRule, source.pointsRule);
  assert.notEqual(copy.ageRange, source.ageRange);
  assert.notEqual(copy.playoffConfig, source.playoffConfig);

  copy.gameRules.clockType = "stopped";
  copy.tiebreakers.push("coin_flip");
  copy.pointsRule.win = 2;
  copy.ageRange.min = 21;
  copy.playoffConfig.bracketType = "single_elim";
  assert.equal(source.gameRules.clockType, "running");
  assert.deepEqual(source.tiebreakers, ["head_to_head", "wins"]);
  assert.equal(source.pointsRule.win, 3);
  assert.equal(source.ageRange.min, 18);
  assert.equal(source.playoffConfig.bracketType, "double_elim");
});

test("playoff dates travel within a season and are dropped across seasons", () => {
  const source = readDivisionRules({}, { startDate: "2027-03-01", endDate: "2027-03-20", playoffSpots: 4 });
  const same = copyDivisionRules(source, { keepPlayoffDates: true });
  assert.equal(same.playoffConfig.startDate, "2027-03-01");
  assert.equal(same.playoffConfig.endDate, "2027-03-20");
  const other = copyDivisionRules(source, { keepPlayoffDates: false });
  assert.equal(other.playoffConfig.startDate, "");
  assert.equal(other.playoffConfig.endDate, "");
  assert.equal(other.playoffConfig.playoffSpots, 4, "everything but the dates is carried");
  assert.equal(source.playoffConfig.startDate, "2027-03-01", "the source keeps its dates");
});
