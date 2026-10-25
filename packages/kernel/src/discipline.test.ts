import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DISCIPLINE_RULES,
  evaluateGameDiscipline,
  isMisconduct,
  readDisciplineRules,
  validateDisciplineRules,
  type DisciplineHistory,
  type DisciplinePenalty
} from "./discipline";

// The recommended values, switched on (a league admin's choice).
const ON = { ...DEFAULT_DISCIPLINE_RULES, enabled: true };

const P = "person-1";
const Q = "person-2";
const T = "team-1";
let n = 0;
function pen(minutes: number, ejection: DisciplinePenalty["ejection"] = null, personId = P): DisciplinePenalty {
  n += 1;
  return { eventId: `e${n}`, personId, teamId: T, minutes, ejection };
}
const none = new Map<string, DisciplineHistory>();

test("a minor penalty suspends nobody", () => {
  assert.deepEqual(evaluateGameDiscipline(ON, [pen(2), pen(2)], none), []);
});

test("a game misconduct sits out the next game (USA Hockey 404(b))", () => {
  const gm = pen(10, "game_misconduct");
  const [s] = evaluateGameDiscipline(ON, [pen(2), gm], none);
  assert.equal(s?.kind, "n_games");
  assert.equal(s?.nGames, 1);
  assert.equal(s?.triggerEventId, gm.eventId);
  assert.deepEqual(s?.rules, ["game_misconduct"]);
  assert.match(s!.reason, /^Automatic: game misconduct\. Sits out the team's next 1 game\.$/);
});

test("a match penalty suspends until lifted and overrides the other rules", () => {
  const m = pen(5, "match");
  const out = evaluateGameDiscipline(ON, [pen(5), m, pen(10, "game_misconduct")], none);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.kind, "indefinite");
  assert.equal(out[0]?.nGames, null);
  assert.equal(out[0]?.triggerEventId, m.eventId);
});

test("a second major in one game is two games, triggered by the second", () => {
  const first = pen(5);
  const second = pen(5);
  const [s] = evaluateGameDiscipline(ON, [first, pen(2), second], none);
  assert.equal(s?.nGames, 2);
  assert.equal(s?.triggerEventId, second.eventId);
});

test("the third misconduct of the season is one game (UC-14 example)", () => {
  const history = new Map([[P, { misconducts: 2, pim: 20 }]]);
  const third = pen(10);
  const [s] = evaluateGameDiscipline(ON, [pen(2), third], history);
  assert.equal(s?.nGames, 1);
  assert.equal(s?.triggerEventId, third.eventId);
  assert.match(s!.reason, /3 misconducts this season/);
});

test("the second misconduct of the season is not yet a suspension", () => {
  const history = new Map([[P, { misconducts: 1, pim: 10 }]]);
  assert.deepEqual(evaluateGameDiscipline(ON, [pen(10)], history), []);
});

test("rules that fire in the same game add up into one suspension", () => {
  const history = new Map([[P, { misconducts: 2, pim: 0 }]]);
  const out = evaluateGameDiscipline(ON, [pen(10, "game_misconduct")], history);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.nGames, 2);
  assert.deepEqual(out[0]?.rules, ["game_misconduct", "misconducts"]);
});

test("penalty-minute thresholds are off by default and count crossings when set", () => {
  const history = new Map([[P, { misconducts: 0, pim: 55 }]]);
  assert.deepEqual(evaluateGameDiscipline(ON, [pen(5)], history), []);
  const rules = { ...ON, pimPerSuspension: 60, pimSuspensionGames: 1 };
  const [s] = evaluateGameDiscipline(rules, [pen(5)], history);
  assert.equal(s?.nGames, 1);
  assert.match(s!.reason, /60 penalty minutes this season/);
});

test("each player is judged on their own penalties", () => {
  const out = evaluateGameDiscipline(ON, [pen(10, "game_misconduct", P), pen(2, null, Q)], none);
  assert.deepEqual(out.map((s) => s.personId), [P]);
});

test("rules switched off issue nothing", () => {
  const off = { ...DEFAULT_DISCIPLINE_RULES, enabled: false };
  assert.deepEqual(evaluateGameDiscipline(off, [pen(5, "match")], none), []);
});

test("a league with no saved rules issues nothing until an admin turns them on", () => {
  const unset = readDisciplineRules(undefined);
  assert.equal(unset.enabled, false);
  assert.deepEqual(evaluateGameDiscipline(unset, [pen(10, "game_misconduct"), pen(5, "match")], none), []);
  assert.equal(readDisciplineRules({ enabled: true }).enabled, true);
});

test("a game misconduct counts as a misconduct", () => {
  assert.equal(isMisconduct({ minutes: 10, ejection: null }), true);
  assert.equal(isMisconduct({ minutes: 5, ejection: "game_misconduct" }), true);
  assert.equal(isMisconduct({ minutes: 5, ejection: null }), false);
});

test("stored rules merge over the defaults and ignore bad values", () => {
  const r = readDisciplineRules({ gameMisconductGames: 2, secondMajorGames: -1, misconductsPerSuspension: "4" });
  assert.equal(r.gameMisconductGames, 2);
  assert.equal(r.secondMajorGames, DEFAULT_DISCIPLINE_RULES.secondMajorGames);
  assert.equal(r.misconductsPerSuspension, 4);
  assert.deepEqual(readDisciplineRules(null), DEFAULT_DISCIPLINE_RULES);
});

test("rule validation explains the bad value", () => {
  assert.equal(validateDisciplineRules({ gameMisconductGames: 1, pimPerSuspension: 60 }), null);
  assert.match(validateDisciplineRules({ misconductSuspensionGames: 0 }) ?? "", /from 1 to 99/);
  assert.match(validateDisciplineRules({ pimPerSuspension: 1.5 }) ?? "", /0 \(off\)/);
});
