import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rankStandings,
  type TeamStanding,
  type H2HProvider
} from "./tiebreaker";

function team(teamId: string, over: Partial<TeamStanding> = {}): TeamStanding {
  return {
    teamId,
    points: 0,
    wins: 0,
    goalDiff: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    awayGoals: 0,
    homeGoals: 0,
    ...over
  };
}

test("orders by points when there is no tie", () => {
  const ranked = rankStandings(
    [team("a", { points: 4 }), team("b", { points: 9 }), team("c", { points: 6 })],
    { ruleset: ["head_to_head", "goal_diff"] }
  );
  assert.deepEqual(
    ranked.map((r) => r.teamId),
    ["b", "c", "a"]
  );
  assert.equal(ranked[0]!.resolvedBy, "points");
});

test("2-way tie is broken by head-to-head", () => {
  // A and B both on 9 points; A beat B head-to-head.
  const h2h: H2HProvider = (group) => {
    assert.deepEqual([...group].sort(), ["a", "b"]);
    return { a: { points: 3, goalDiff: 2 }, b: { points: 0, goalDiff: -2 } };
  };
  const ranked = rankStandings(
    [team("a", { points: 9 }), team("b", { points: 9 })],
    { ruleset: ["head_to_head", "goal_diff"], h2h }
  );
  assert.deepEqual(
    ranked.map((r) => r.teamId),
    ["a", "b"]
  );
  assert.equal(ranked[0]!.resolvedBy, "head_to_head");
});

test("3-way circular H2H tie SKIPS head-to-head and falls to away goals", () => {
  // The documented bug. A, B, C all on 9 points, each 1-1 vs the others
  // (circular) → H2H points all equal. Must fall back to away_goals.
  const a = team("a", { points: 9, awayGoals: 7, homeGoals: 5 });
  const b = team("b", { points: 9, awayGoals: 12, homeGoals: 4 });
  const c = team("c", { points: 9, awayGoals: 9, homeGoals: 6 });

  const h2h: H2HProvider = () => ({
    a: { points: 3, goalDiff: 0 },
    b: { points: 3, goalDiff: 0 },
    c: { points: 3, goalDiff: 0 }
  });

  const ranked = rankStandings([a, b, c], {
    ruleset: ["head_to_head", "away_goals", "home_goals", "goal_diff"],
    h2h
  });

  // away goals: b(12) > c(9) > a(7)
  assert.deepEqual(
    ranked.map((r) => r.teamId),
    ["b", "c", "a"]
  );
  for (const r of ranked) {
    assert.equal(r.resolvedBy, "away_goals");
    assert.match(r.note ?? "", /3-way H2H tie/);
  }
});

test("is fully deterministic when every rule is exhausted", () => {
  // Two teams identical on every metric → stable teamId order, never random.
  const x = team("zeta", { points: 5 });
  const y = team("alpha", { points: 5 });
  const first = rankStandings([x, y], { ruleset: ["goal_diff", "away_goals"] });
  const second = rankStandings([y, x], { ruleset: ["goal_diff", "away_goals"] });
  assert.deepEqual(
    first.map((r) => r.teamId),
    ["alpha", "zeta"]
  );
  // Order of the INPUT must not change the OUTPUT.
  assert.deepEqual(
    first.map((r) => r.teamId),
    second.map((r) => r.teamId)
  );
  assert.equal(first[0]!.resolvedBy, "teamId");
});
