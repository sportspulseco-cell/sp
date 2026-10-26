import { test } from "node:test";
import assert from "node:assert/strict";
import { bracketGames, bracketSize, buildBracket, homeAndAway, winnerFromResult, type BracketIce } from "./bracket";

const ice = (n: number): BracketIce[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `ice${i}`, startTsUtc: new Date(Date.UTC(2027, 3, 1 + i, 23)).toISOString(), surfaceId: "r", surfaceLabel: "Rink 1", venueName: "Arena", tz: "America/New_York"
  }));
const seeds = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);

test("any team count from 2: games = teams - 1, byes for the top seeds", () => {
  for (let n = 2; n <= 16; n++) {
    const slots = buildBracket(seeds(n), ice(n - 1));
    const games = slots.filter((s) => !s.bye);
    assert.equal(games.length, bracketGames(n), `n=${n}`);
    const byes = slots.filter((s) => s.bye);
    assert.equal(byes.length, bracketSize(n) - n, `n=${n} byes`);
    // Byes go to the best seeds.
    assert.deepEqual(byes.map((b) => b.seedA).sort((a, b) => a! - b!), Array.from({ length: byes.length }, (_, i) => i + 1));
    // Every real game has its own ice slot.
    assert.equal(new Set(games.map((g) => g.iceSlotId)).size, games.length);
  }
});

test("3 teams: seed 1 waits in the final, 2 plays 3", () => {
  const s = buildBracket(seeds(3), ice(2));
  const r1 = s.filter((x) => x.round === 1 && !x.bye);
  assert.equal(r1.length, 1);
  assert.deepEqual([r1[0]!.teamAId, r1[0]!.teamBId].sort(), ["s2", "s3"]);
  const final = s.find((x) => x.round === 2)!;
  assert.equal(final.teamAId, "s1");
  assert.equal(final.teamBId, null);
});

test("6 teams: two round-2 games start with the bye teams; ice in round order", () => {
  const s = buildBracket(seeds(6), ice(5));
  const r2 = s.filter((x) => x.round === 2);
  assert.deepEqual(r2.map((x) => x.teamAId), ["s1", "s2"]);
  const r1games = s.filter((x) => x.round === 1 && !x.bye);
  assert.ok(r1games.every((g) => g.iceSlotId! < r2[0]!.iceSlotId!));
});

test("2 teams: one final", () => {
  const s = buildBracket(seeds(2), ice(1));
  assert.equal(s.length, 1);
  assert.deepEqual(homeAndAway(s[0]!), { homeTeamId: "s1", awayTeamId: "s2" });
});

test("refuses too few teams or too little ice", () => {
  assert.throws(() => buildBracket(seeds(1), ice(3)), /at least 2/);
  assert.throws(() => buildBracket(seeds(5), ice(3)), /needs 4 playoff ice/);
});

test("winner comes from the final score only", () => {
  const g = { homeTeamId: "h", awayTeamId: "a", homeScore: 2, awayScore: 3 };
  assert.equal(winnerFromResult({ ...g, status: "completed" }), "a");
  assert.equal(winnerFromResult({ ...g, status: "in_play" }), null);
  assert.equal(winnerFromResult({ ...g, status: "completed", awayScore: 2 }), null);
  assert.equal(winnerFromResult({ ...g, status: "forfeited", homeScore: 1, awayScore: 0 }), "h");
});
