import { test } from "node:test";
import assert from "node:assert/strict";
import { rankFreeAgentPitch } from "./free-agents";

test("auto-pitch: full teams are skipped; level and missing positions rank first", () => {
  const teams = [
    { teamId: "full", divisionTier: "B", openSpots: 0, rosterPositions: [] },
    { teamId: "farLevel", divisionTier: "D", openSpots: 5, rosterPositions: ["G"] },
    { teamId: "sameLevelHasG", divisionTier: "B", openSpots: 2, rosterPositions: ["G"] },
    { teamId: "sameLevelNoG", divisionTier: "B", openSpots: 1, rosterPositions: ["D"] }
  ];
  const r = rankFreeAgentPitch({ level: "B", positions: ["G"] }, teams);
  assert.deepEqual(r.map((t) => t.teamId), ["sameLevelNoG", "sameLevelHasG", "farLevel"]);
  assert.equal(r[0]!.score, 3);
  assert.equal(rankFreeAgentPitch({ level: "B", positions: [] }, teams, 1).length, 1);
});

test("auto-pitch: unknown level still ranks by position need", () => {
  const r = rankFreeAgentPitch(
    { level: null, positions: ["D"] },
    [
      { teamId: "hasD", divisionTier: "A", openSpots: 3, rosterPositions: ["D"] },
      { teamId: "noD", divisionTier: "A", openSpots: 3, rosterPositions: [] }
    ]
  );
  assert.deepEqual(r.map((t) => t.teamId), ["noD", "hasD"]);
});
