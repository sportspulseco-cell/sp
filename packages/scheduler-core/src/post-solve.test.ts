import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balanceHomeAway,
  enumerateFixtures,
  gameStartForSlot,
  localDate,
  slotBlackout,
  weeklyOverLimit,
  type PlacedGame
} from "./post-solve";

const NY = "America/New_York";
const teams = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);

/** Solver-shaped output: one fixture per day, earlier-listed team first. */
function placed(teamIds: string[], gamesPerPair: number): PlacedGame[] {
  return enumerateFixtures(teamIds, gamesPerPair).map(([a, b], i) => ({
    slotId: `s${String(i).padStart(3, "0")}`,
    startTsUtc: new Date(Date.UTC(2027, 0, 4 + i, 0, 30)).toISOString(),
    teamA: a,
    teamB: b
  }));
}

test("fixtures match the solver: each pair gamesPerPair times, earlier team first", () => {
  assert.deepEqual(enumerateFixtures(["a", "b", "c"], 1), [["a", "b"], ["a", "c"], ["b", "c"]]);
  assert.equal(enumerateFixtures(teams(6), 2).length, 30);
});

test("single round robin: no team is more than one game off even (4 to 9 teams)", () => {
  for (let n = 4; n <= 9; n++) {
    const before = placed(teams(n), 1);
    // The solver's raw output gives t0 every home game.
    const raw = before.filter((g) => g.teamA === "t0").length;
    assert.equal(raw, n - 1);
    const { counts, maxImbalance } = balanceHomeAway(before);
    assert.ok(maxImbalance <= 1, `n=${n} imbalance ${maxImbalance} ${JSON.stringify(counts)}`);
    for (const t of teams(n)) assert.equal(counts[t]!.home + counts[t]!.away, n - 1);
  }
});

test("double round robin: the second meeting swaps sides, every team exactly even", () => {
  const { games, counts, maxImbalance } = balanceHomeAway(placed(teams(6), 2));
  assert.equal(maxImbalance, 0, JSON.stringify(counts));
  const byPair = new Map<string, string[]>();
  for (const g of games) {
    const k = [g.homeTeamId, g.awayTeamId].sort().join("|");
    byPair.set(k, [...(byPair.get(k) ?? []), g.homeTeamId]);
  }
  for (const [k, homes] of byPair) assert.notEqual(homes[0], homes[1], k);
});

test("games that stay keep their sides and count toward the balance", () => {
  const fixed = [
    { startTsUtc: "2027-01-01T00:30:00.000Z", homeTeamId: "t0", awayTeamId: "t1" },
    { startTsUtc: "2027-01-02T00:30:00.000Z", homeTeamId: "t0", awayTeamId: "t2" }
  ];
  const p = placed(["t0", "t1", "t2"], 2).slice(0, 6);
  const { games, counts } = balanceHomeAway(
    p.filter((g) => !(g.teamA === "t0" && g.teamB === "t1" && g.slotId === "s000") && !(g.slotId === "s002")),
    fixed
  );
  // t0-t1 again after a kept t0 home game: t1 is home.
  const again = games.find((g) => [g.homeTeamId, g.awayTeamId].sort().join() === "t0,t1");
  assert.equal(again?.homeTeamId, "t1");
  assert.equal(counts.t0!.home + counts.t0!.away, 4);
});

test("same input, same answer (deterministic)", () => {
  const a = balanceHomeAway(placed(teams(7), 1)).games.map((g) => g.homeTeamId).join();
  const b = balanceHomeAway(placed(teams(7), 1)).games.map((g) => g.homeTeamId).join();
  assert.equal(a, b);
});

test("blackouts: season-wide and one rink, by the season's calendar day", () => {
  const bl = [
    { startDate: "2027-02-14", endDate: "2027-02-14", surfaceId: null },
    { startDate: "2027-03-01", endDate: "2027-03-03", surfaceId: "rinkB" }
  ];
  // 2027-02-15 00:30 UTC is still Feb 14 in New York.
  assert.ok(slotBlackout({ startTsUtc: "2027-02-15T00:30:00Z", surfaceId: "rinkA" }, NY, bl));
  assert.equal(slotBlackout({ startTsUtc: "2027-02-15T15:00:00Z", surfaceId: "rinkA" }, NY, bl), null);
  assert.ok(slotBlackout({ startTsUtc: "2027-03-02T23:00:00Z", surfaceId: "rinkB" }, NY, bl));
  assert.equal(slotBlackout({ startTsUtc: "2027-03-02T23:00:00Z", surfaceId: "rinkA" }, NY, bl), null);
  assert.equal(localDate("2027-02-15T00:30:00Z", NY), "2027-02-14");
});

test("weekly load: teams over the limit, Monday to Sunday in the season's zone", () => {
  const g = (d: string, h: string, a: string) => ({ startTsUtc: d, homeTeamId: h, awayTeamId: a });
  const over = weeklyOverLimit(
    [g("2027-01-05T00:00:00Z", "a", "b"), g("2027-01-07T00:00:00Z", "a", "c"), g("2027-01-12T00:00:00Z", "a", "b")],
    NY,
    1
  );
  // Jan 4 7 PM and Jan 6 7 PM New York: same week (Mon Jan 4).
  assert.deepEqual(over, [{ teamId: "a", weekStart: "2027-01-04", games: 2 }]);
});

test("slot times: rink zone kept; an unset (UTC) slot is read in the season's zone", () => {
  assert.deepEqual(gameStartForSlot("2027-01-15T00:30:00Z", NY, NY), { startTsUtc: "2027-01-15T00:30:00.000Z", tz: NY });
  // 19:30 typed on a rink with no zone in a New York season: 19:30 New York = 00:30Z next day.
  assert.deepEqual(gameStartForSlot("2027-01-14T19:30:00Z", "UTC", NY), { startTsUtc: "2027-01-15T00:30:00.000Z", tz: NY });
  // Summer time: 19:30 EDT = 23:30Z.
  assert.deepEqual(gameStartForSlot("2027-07-14T19:30:00Z", "UTC", NY), { startTsUtc: "2027-07-14T23:30:00.000Z", tz: NY });
  assert.deepEqual(gameStartForSlot("2027-01-14T19:30:00Z", "UTC", "UTC"), { startTsUtc: "2027-01-14T19:30:00.000Z", tz: "UTC" });
  assert.deepEqual(gameStartForSlot("2027-01-14T19:30:00Z", "Bogus/Zone", null), { startTsUtc: "2027-01-14T19:30:00.000Z", tz: "UTC" });
});
