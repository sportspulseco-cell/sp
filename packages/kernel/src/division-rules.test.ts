import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DIVISION_GAME_RULES,
  DEFAULT_DIVISION_PLAYOFF_CONFIG,
  DEFAULT_DIVISION_TIEBREAKERS,
  DIVISION_NUMBER_LIMITS,
  copyDivisionRules,
  defaultDivisionRules,
  divisionNumberProblem,
  parsePlayoffSpots,
  playoffSpotsLabel,
  readDivisionRules,
  validateDivisionGameRules
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

// The values Publish accepted on staging on 4 Nov 2026 after a cleared
// field snapped back to its default mid-typing ("17" over "20" -> "2017").
const SNAPPED = { periodLengthMin: 2017, numberOfPeriods: 33, maxRosterSize: 2020 };

test("the defaults sit inside every range, so a fresh card always publishes", () => {
  assert.equal(validateDivisionGameRules(DEFAULT_DIVISION_GAME_RULES), null);
  assert.equal(divisionNumberProblem("maxTeams", 10), null, "the wizard default team cap");
  for (const [key, lim] of Object.entries(DIVISION_NUMBER_LIMITS)) {
    assert.ok(lim.min <= lim.max, key);
    assert.ok(lim.label.length > 0, key);
  }
});

test("a number out of range is refused with the words the form uses, first problem only", () => {
  assert.equal(
    validateDivisionGameRules({ ...DEFAULT_DIVISION_GAME_RULES, ...SNAPPED }),
    "Number of periods must be a whole number from 1 to 4."
  );
  assert.equal(
    validateDivisionGameRules({ ...DEFAULT_DIVISION_GAME_RULES, periodLengthMin: 2017 }),
    "Period length must be a whole number from 5 to 60 minutes."
  );
  assert.equal(
    validateDivisionGameRules({ ...DEFAULT_DIVISION_GAME_RULES, maxRosterSize: 2020 }),
    "Max roster size must be a whole number from 5 to 40."
  );
  assert.equal(
    validateDivisionGameRules({ ...DEFAULT_DIVISION_GAME_RULES, minStartersToStart: 2 }),
    "Min skaters to start must be a whole number from 3 to 20."
  );
  assert.equal(
    validateDivisionGameRules({ ...DEFAULT_DIVISION_GAME_RULES, maxGuestPlayersPerGame: 11 }),
    "Max guest players per game must be a whole number from 0 to 10."
  );
  assert.equal(divisionNumberProblem("maxTeams", 2017), "Max teams must be a whole number from 2 to 64.");
  assert.equal(divisionNumberProblem("maxTeams", 1), "Max teams must be a whole number from 2 to 64.");
});

test("the edges of every range are accepted; just outside is not", () => {
  for (const [key, lim] of Object.entries(DIVISION_NUMBER_LIMITS) as Array<[keyof typeof DIVISION_NUMBER_LIMITS, { min: number; max: number }]>) {
    assert.equal(divisionNumberProblem(key, lim.min), null, `${key} min`);
    assert.equal(divisionNumberProblem(key, lim.max), null, `${key} max`);
    assert.ok(divisionNumberProblem(key, lim.min - 1), `${key} below min`);
    assert.ok(divisionNumberProblem(key, lim.max + 1), `${key} above max`);
  }
  assert.equal(validateDivisionGameRules({ maxGuestPlayersPerGame: 0 }), null, "zero guests is a real setting");
});

test("not a whole number, text, null or NaN is refused with the same sentence", () => {
  const msg = "Period length must be a whole number from 5 to 60 minutes.";
  assert.equal(divisionNumberProblem("periodLengthMin", 17.5), msg);
  assert.equal(divisionNumberProblem("periodLengthMin", "17"), msg, "a string is not a stored number");
  assert.equal(divisionNumberProblem("periodLengthMin", null), msg);
  assert.equal(divisionNumberProblem("periodLengthMin", Number.NaN), msg);
  assert.equal(divisionNumberProblem("periodLengthMin", -20), msg);
  assert.equal(validateDivisionGameRules({ periodLengthMin: null }), msg, "null is sent, so it is checked");
});

test("only the keys sent are checked: a legacy row with {} or no game rules saves", () => {
  assert.equal(validateDivisionGameRules(undefined), null);
  assert.equal(validateDivisionGameRules(null), null);
  assert.equal(validateDivisionGameRules({}), null);
  assert.equal(validateDivisionGameRules({ numberOfPeriods: 3 }), null);
  assert.equal(validateDivisionGameRules(NORTH_RULES.gameRules), null, "the PPHL production row is fine");
  assert.equal(validateDivisionGameRules("3 periods"), "Game rules must be a set of named values.");
  assert.equal(validateDivisionGameRules([3, 20]), "Game rules must be a set of named values.");
});

test("a choice outside the catalogue is refused by name", () => {
  assert.equal(
    validateDivisionGameRules({ clockType: "paused" }),
    "Clock type must be one of: stopped, running."
  );
  assert.equal(
    validateDivisionGameRules({ overtimeRule: "15_min" }),
    "Overtime must be one of: none, sudden_death, shootout, 5_min, 10_min."
  );
  assert.equal(
    validateDivisionGameRules({ bodyChecking: null }),
    "Body checking must be one of: permitted, not_permitted_penalty, not_permitted_no_penalty."
  );
  assert.equal(
    validateDivisionGameRules({ numberOfPeriods: 9, clockType: "paused" }),
    "Number of periods must be a whole number from 1 to 4.",
    "numbers are reported before choices"
  );
});
