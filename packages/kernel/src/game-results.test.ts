import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POINTS_RULE,
  checkFinalResult,
  rankTalliesByBucket,
  tallyStandings,
  type StandingsGame
} from "./game-results";

function game(over: Partial<StandingsGame>): StandingsGame {
  return {
    status: "completed",
    homeTeamId: "H",
    awayTeamId: "A",
    homeBucket: "div1",
    awayBucket: "div1",
    homeScore: 0,
    awayScore: 0,
    endedIn: "regulation",
    ...over
  };
}

function byTeam(tallies: ReturnType<typeof tallyStandings>) {
  return Object.fromEntries(tallies.map((t) => [t.teamId, t]));
}

test("regulation win: winner W and 2 points, loser L and 0", () => {
  const t = byTeam(tallyStandings([game({ homeScore: 3, awayScore: 1 })]));
  assert.equal(t.H!.w, 1);
  assert.equal(t.H!.points, 2);
  assert.equal(t.A!.l, 1);
  assert.equal(t.A!.otl, 0);
  assert.equal(t.A!.points, 0);
  assert.deepEqual([t.H!.gf, t.H!.ga, t.A!.gf, t.A!.ga], [3, 1, 1, 3]);
});

test("overtime and shootout losses are OTL with 1 point, not L", () => {
  const t = byTeam(
    tallyStandings([
      game({ homeScore: 2, awayScore: 3, endedIn: "overtime" }),
      game({ homeScore: 4, awayScore: 3, endedIn: "shootout" })
    ])
  );
  assert.equal(t.H!.w, 1);
  assert.equal(t.H!.otl, 1);
  assert.equal(t.H!.l, 0);
  assert.equal(t.H!.points, DEFAULT_POINTS_RULE.overtimeWin + DEFAULT_POINTS_RULE.overtimeLoss);
  assert.equal(t.A!.w, 1);
  assert.equal(t.A!.otl, 1);
  assert.equal(t.A!.points, 3);
});

test("tie gives both teams a T and the tie points", () => {
  const t = byTeam(tallyStandings([game({ homeScore: 2, awayScore: 2, endedIn: "overtime" })]));
  assert.equal(t.H!.t, 1);
  assert.equal(t.A!.t, 1);
  assert.equal(t.H!.points, 1);
  assert.equal(t.A!.points, 1);
});

test("forfeit counts as a regulation result even if endedIn says overtime", () => {
  const t = byTeam(
    tallyStandings([game({ status: "forfeited", homeScore: 1, awayScore: 0, endedIn: "overtime" })])
  );
  assert.equal(t.A!.l, 1);
  assert.equal(t.A!.otl, 0);
});

test("scheduled, in-play, postponed and cancelled games do not count", () => {
  const tallies = tallyStandings(
    ["scheduled", "in_play", "postponed", "cancelled"].map((status) =>
      game({ status, homeScore: 5, awayScore: 0 })
    )
  );
  assert.equal(tallies.length, 0);
});

test("games without endedIn (finalized before the field existed) count as regulation", () => {
  const t = byTeam(tallyStandings([game({ homeScore: 1, awayScore: 2, endedIn: null })]));
  assert.equal(t.H!.l, 1);
  assert.equal(t.H!.otl, 0);
});

test("a configured 3-2-1-0 rule is applied", () => {
  const rule = { win: 3, overtimeWin: 2, loss: 0, overtimeLoss: 1, tie: 1 };
  const t = byTeam(
    tallyStandings(
      [game({ homeScore: 3, awayScore: 0 }), game({ homeScore: 1, awayScore: 2, endedIn: "shootout" })],
      rule
    )
  );
  assert.equal(t.H!.points, 3 + 1);
  assert.equal(t.A!.points, 0 + 2);
});

test("one tally per (division, team); ranking is per division", () => {
  const ranked = rankTalliesByBucket(
    tallyStandings([
      game({ homeScore: 1, awayScore: 0 }),
      game({ homeTeamId: "X", awayTeamId: "Y", homeBucket: "div2", awayBucket: "div2", homeScore: 0, awayScore: 4 })
    ])
  );
  const rank = Object.fromEntries(ranked.map((r) => [`${r.bucket}:${r.teamId}`, r.rank]));
  assert.deepEqual(rank, { "div1:H": 1, "div1:A": 2, "div2:Y": 1, "div2:X": 2 });
});

test("ranking breaks equal points by goal difference then goals for", () => {
  const ranked = rankTalliesByBucket([
    { teamId: "a", bucket: null, gp: 2, w: 1, l: 1, t: 0, otl: 0, gf: 5, ga: 5, points: 2 },
    { teamId: "b", bucket: null, gp: 2, w: 1, l: 1, t: 0, otl: 0, gf: 6, ga: 4, points: 2 },
    { teamId: "c", bucket: null, gp: 2, w: 1, l: 1, t: 0, otl: 0, gf: 7, ga: 5, points: 2 }
  ]);
  assert.deepEqual(ranked.map((r) => r.teamId), ["c", "b", "a"]);
});

test("finalize: a decided game must say how it ended", () => {
  const v = checkFinalResult({ homeScore: 2, awayScore: 1, endedIn: null, goalEvents: { home: 0, away: 0, withoutTeam: 0 } });
  assert.equal(v.ok, false);
  assert.equal(!v.ok && v.code, "FINAL_ENDING_REQUIRED");
});

test("finalize: a tie may leave the ending blank", () => {
  const v = checkFinalResult({ homeScore: 2, awayScore: 2, endedIn: null, goalEvents: { home: 2, away: 2, withoutTeam: 0 } });
  assert.deepEqual(v, { ok: true, endedIn: null });
});

test("finalize: shootout cannot end tied", () => {
  const v = checkFinalResult({ homeScore: 2, awayScore: 2, endedIn: "shootout", goalEvents: { home: 0, away: 0, withoutTeam: 0 } });
  assert.equal(!v.ok && v.code, "FINAL_SHOOTOUT_TIED");
});

test("finalize: score must match the goal events", () => {
  const v = checkFinalResult({ homeScore: 3, awayScore: 1, endedIn: "regulation", goalEvents: { home: 2, away: 1, withoutTeam: 0 } });
  assert.equal(!v.ok && v.code, "FINAL_SCORE_MISMATCH");
  const ok = checkFinalResult({ homeScore: 2, awayScore: 1, endedIn: "regulation", goalEvents: { home: 2, away: 1, withoutTeam: 0 } });
  assert.equal(ok.ok, true);
});

test("finalize: shootout winner's score is goals + 1", () => {
  const ok = checkFinalResult({ homeScore: 3, awayScore: 2, endedIn: "shootout", goalEvents: { home: 2, away: 2, withoutTeam: 0 } });
  assert.equal(ok.ok, true);
  const bad = checkFinalResult({ homeScore: 2, awayScore: 3, endedIn: "shootout", goalEvents: { home: 2, away: 2, withoutTeam: 1 } });
  assert.equal(!bad.ok && bad.code, "FINAL_GOAL_WITHOUT_TEAM");
});

test("finalize: no goal events means the applied score stands", () => {
  const v = checkFinalResult({ homeScore: 5, awayScore: 0, endedIn: "regulation", goalEvents: { home: 0, away: 0, withoutTeam: 0 } });
  assert.deepEqual(v, { ok: true, endedIn: "regulation" });
});
