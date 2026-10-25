import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SKILL_LEVELS,
  isSkillLevel,
  normalizeSkillLevel,
  skillLevelFitsTier
} from "./skill-levels";
import { FREE_AGENT_LEVELS, freeAgentLevelLabel } from "./free-agents";

test("the level list is A to D, as the spec and division tiers use", () => {
  assert.deepEqual([...SKILL_LEVELS], ["A", "B", "C", "D"]);
  assert.deepEqual(FREE_AGENT_LEVELS.map((l) => l.value), ["A", "B", "C", "D"]);
});

test("older C1 / C2 / C3 answers read as C or D", () => {
  assert.equal(normalizeSkillLevel("C1"), "C");
  assert.equal(normalizeSkillLevel("c2"), "C");
  assert.equal(normalizeSkillLevel(" C3 "), "D");
  assert.equal(normalizeSkillLevel("b"), "B");
});

test("anything else is unknown, never guessed", () => {
  for (const v of [undefined, null, "", "E", "Premier", 3, {}]) {
    assert.equal(normalizeSkillLevel(v), null, String(v));
  }
  assert.equal(isSkillLevel("C1"), false);
});

test("a level fits its own tier; Premier takes A; unknown stays unknown", () => {
  assert.equal(skillLevelFitsTier("C", "C"), true);
  assert.equal(skillLevelFitsTier("C2", "C"), true);
  assert.equal(skillLevelFitsTier("C3", "C"), false);
  assert.equal(skillLevelFitsTier("A", "Premier"), true);
  assert.equal(skillLevelFitsTier("B", "Premier"), false);
  assert.equal(skillLevelFitsTier("B", null), null);
  assert.equal(skillLevelFitsTier(undefined, "B"), null);
});

test("pool labels read older rows by their new level", () => {
  assert.equal(freeAgentLevelLabel("C2"), "C — Recreational");
  assert.equal(freeAgentLevelLabel("D"), "D — Beginner");
  assert.equal(freeAgentLevelLabel("ZZ"), "ZZ");
});
