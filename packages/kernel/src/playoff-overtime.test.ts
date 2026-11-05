import { test } from "node:test";
import assert from "node:assert/strict";
import { copyDivisionRules, defaultDivisionRules, divisionGameRulesForGame, gameEndingRuleProblem } from "./division-rules";

test("playoff overtime overrides regular rules, and absent override inherits", () => {
  const rules={gameRules:{overtimeRule:"none"}};
  assert.equal(divisionGameRulesForGame(rules,{overtimeRule:"sudden_death"},"regular").overtimeRule,"none");
  assert.equal(divisionGameRulesForGame(rules,{overtimeRule:"sudden_death"},"playoff").overtimeRule,"sudden_death");
  assert.equal(divisionGameRulesForGame(rules,{},"playoff").overtimeRule,"none");
  assert.equal(gameEndingRuleProblem("none","overtime"),"This game's rules do not allow an overtime period.");
  assert.equal(gameEndingRuleProblem("sudden_death","shootout"),"This game's rules do not allow a shootout.");
  assert.equal(gameEndingRuleProblem("5_min","shootout"),null);
});

test("copying division rules retains independent playoff overtime", () => {
  const rules=defaultDivisionRules();rules.playoffConfig.overtimeRule="10_min";
  const copied=copyDivisionRules(rules);
  assert.equal(copied.playoffConfig.overtimeRule,"10_min");
  copied.playoffConfig.overtimeRule="none";
  assert.equal(rules.playoffConfig.overtimeRule,"10_min");
});
