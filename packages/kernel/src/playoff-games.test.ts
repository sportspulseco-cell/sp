import { test } from "node:test";
import assert from "node:assert/strict";
import { playoffGamesPlayedVerdict } from "./compliance";

test("no finalized games: unknown, never a failure", () => {
  const v = playoffGamesPlayedVerdict({ played: 0, teamFinalizedGames: 0, teamRecordedGames: 0, minRequired: 8 });
  assert.equal(v.known, false);
  assert.equal(v.meets, null);
});

test("finalized games without lineups or stats: unknown", () => {
  const v = playoffGamesPlayedVerdict({ played: 0, teamFinalizedGames: 10, teamRecordedGames: 0, minRequired: 8 });
  assert.equal(v.known, false);
  assert.match(v.reason!, /10 of the team's 10/);
});

test("every game recorded: counted against the minimum", () => {
  assert.deepEqual(playoffGamesPlayedVerdict({ played: 8, teamFinalizedGames: 10, teamRecordedGames: 10, minRequired: 8 }).meets, true);
  assert.deepEqual(playoffGamesPlayedVerdict({ played: 7, teamFinalizedGames: 10, teamRecordedGames: 10, minRequired: 8 }).meets, false);
});
