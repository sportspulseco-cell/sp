import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POINTS_RULE,
  parsePointsRule,
  parseTiebreakers,
  pointsRuleProblem,
  rankTalliesByBucket,
  resolvePointsRule,
  tallyStandings,
  withEnteredTeams,
  type StandingsGame
} from "./game-results";

test("F-4: every entered team is listed; teams with no games show zeros after the rest", () => {
  type Row = { divisionId: string | null; teamId: string; rank: number | null; gp: number; points: number };
  const rows: Row[] = [
    { divisionId: "A", teamId: "t1", rank: 1, gp: 1, points: 2 },
    { divisionId: "A", teamId: "t2", rank: 2, gp: 1, points: 0 }
  ];
  const entered = [
    { divisionId: "A", teamId: "t1", teamName: "Alpha" },
    { divisionId: "A", teamId: "t4", teamName: "Delta" },
    { divisionId: "A", teamId: "t3", teamName: "Charlie" },
    { divisionId: "A", teamId: "t3", teamName: "Charlie" },
    { divisionId: "B", teamId: "t5", teamName: "Echo" }
  ];
  const out = withEnteredTeams(rows, entered, (t, rank) => ({ divisionId: t.divisionId, teamId: t.teamId, rank, gp: 0, points: 0 }));
  assert.deepEqual(
    out.map((r) => `${r.divisionId}:${r.teamId}:${r.rank}:${r.gp}`),
    ["A:t1:1:1", "A:t2:2:1", "A:t3:3:0", "A:t4:4:0", "B:t5:1:0"]
  );
});

test("F-4: no entered teams and no rows gives an empty table; rows are never dropped", () => {
  const never = (): never => {
    throw new Error("unused");
  };
  assert.deepEqual(withEnteredTeams([], [], never), []);
  const rows = [{ divisionId: "A", teamId: "gone", rank: 1 }];
  assert.equal(withEnteredTeams(rows, [], never).length, 1);
});

const g = (h: string, a: string, hs: number, as: number, over: Partial<StandingsGame> = {}): StandingsGame => ({
  status: "completed", homeTeamId: h, awayTeamId: a, homeBucket: "d", awayBucket: "d",
  homeScore: hs, awayScore: as, endedIn: "regulation", ...over
});

test("FR-3.13.1 points rule: division over season over default; bad values dropped", () => {
  assert.deepEqual(resolvePointsRule(null, null), { rule: DEFAULT_POINTS_RULE, source: "default" });
  const s = resolvePointsRule({ pointsRule: { win: 3 } }, {});
  assert.equal(s.source, "season");
  assert.equal(s.rule.win, 3);
  const d = resolvePointsRule({ pointsRule: { win: 3 } }, { pointsRule: { win: 2, tie: 0, loss: -1, overtimeLoss: 1.5 } });
  assert.equal(d.source, "division");
  assert.deepEqual(d.rule, { ...DEFAULT_POINTS_RULE, win: 2, tie: 0 });
  assert.deepEqual(parsePointsRule({ win: "3" }), {});
  assert.match(pointsRuleProblem({ win: 11 }) ?? "", /Points per win/);
  assert.equal(pointsRuleProblem({ win: 3, tie: "" }), null);
});

test("3-2-1-0 rule: regulation win 3, overtime win 2, overtime loss 1", () => {
  const rule = { win: 3, overtimeWin: 2, loss: 0, overtimeLoss: 1, tie: 1 };
  const t = Object.fromEntries(
    tallyStandings([g("A", "B", 2, 1), g("B", "C", 3, 2, { endedIn: "overtime" })], rule).map((x) => [x.teamId, x.points])
  );
  assert.deepEqual(t, { A: 3, B: 2, C: 1 });
});

test("tie-break order from org setup: head-to-head before goal difference", () => {
  // A and B both 2 points; B has the better goal difference, A beat B.
  const games = [g("A", "B", 1, 0), g("B", "C", 9, 0), g("C", "A", 1, 0)];
  const tallies = tallyStandings(games);
  assert.equal(rankTalliesByBucket(tallies)[0]!.teamId, "B");
  const h2hFirst = rankTalliesByBucket(tallies, { tiebreakers: () => ["head_to_head", "goal_diff"], games });
  // All three have 2 points; head-to-head among all three is 2 each, then goal difference: B +8, C 0... A 0.
  assert.equal(h2hFirst[0]!.teamId, "B");
  const two = rankTalliesByBucket(tallyStandings([g("A", "B", 1, 0), g("B", "C", 5, 0), g("C", "A", 0, 0), g("A", "C", 0, 1)]), {
    tiebreakers: () => ["head_to_head", "goal_diff"],
    games: [g("A", "B", 1, 0), g("B", "C", 5, 0), g("C", "A", 0, 0), g("A", "C", 0, 1)]
  });
  // A 3 pts (W,T,L -> 2+1+0), B 2, C 3 (T + W + L). A vs C head-to-head: C took 3 of 4.
  assert.deepEqual(two.slice(0, 2).map((r) => r.teamId), ["C", "A"]);
});

test("wins as the first tie-break; coin flip leaves a marked tie", () => {
  const tallies = [
    { teamId: "x", bucket: "d", gp: 3, w: 1, l: 0, t: 2, otl: 0, gf: 3, ga: 3, points: 4 },
    { teamId: "y", bucket: "d", gp: 3, w: 2, l: 1, t: 0, otl: 0, gf: 3, ga: 3, points: 4 },
    { teamId: "z", bucket: "d", gp: 3, w: 1, l: 0, t: 2, otl: 0, gf: 3, ga: 3, points: 4 }
  ];
  const r = rankTalliesByBucket(tallies, { tiebreakers: () => ["wins", "coin_flip"] });
  assert.deepEqual(r.map((x) => [x.teamId, x.rank, x.tiedAfterTiebreakers]), [["y", 1, false], ["x", 2, true], ["z", 3, true]]);
  assert.deepEqual(parseTiebreakers(["wins", "bogus", "wins", "goal_diff"]), ["wins", "goal_diff"]);
});
