import { test } from "node:test";
import assert from "node:assert/strict";
import { sportLabel } from "./sport-labels";

test("sportLabel reads a sport code as words", () => {
  assert.equal(sportLabel("HOCKEY_ICE"), "Ice hockey");
  assert.equal(sportLabel("hockey_ice"), "Ice hockey");
  assert.equal(sportLabel("NEW_SPORT"), "New sport");
  assert.equal(sportLabel(null), "—");
});
