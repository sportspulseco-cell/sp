import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyFormDefinition } from "./forms";
import { guidedRegistrationProblem, type GuidedRegistrationSetupInput } from "./guided-registration";
const setup = (): GuidedRegistrationSetupInput => ({ requestId: "request", registrationType: "both",
  playerPriceCents: 18000, teamFeeEnabled: false, teamPriceCents: 0, currency: "USD",
  requireUsaHockeyId: true, formDefinition: emptyFormDefinition(), publish: false, reviewConfirmed: false });
test("guided registration keeps team fees explicitly opt-in and publication reviewed", () => {
  assert.equal(guidedRegistrationProblem(setup()), null);
  assert.match(guidedRegistrationProblem({ ...setup(), teamPriceCents: 1000 })!, /Team fees are off/);
  assert.equal(guidedRegistrationProblem({ ...setup(), teamFeeEnabled: true, teamPriceCents: 1000 }), null);
  assert.match(guidedRegistrationProblem({ ...setup(), publish: true })!, /Confirm/);
  assert.equal(guidedRegistrationProblem({ ...setup(), publish: true, reviewConfirmed: true }), null);
  assert.match(guidedRegistrationProblem({ ...setup(), playerPriceCents: 100.5 })!, /valid/);
});
test("guided registration rejects malformed questions and empty enabled document text", () => {
  const input = setup(); input.formDefinition.questions = [null as never];
  assert.match(guidedRegistrationProblem(input)!, /question/);
  const blank = setup(); blank.formDefinition.waivers!.liabilityWaiver.content = " ";
  assert.match(guidedRegistrationProblem(blank)!, /enabled waiver/);
  const badChoice = setup(); badChoice.formDefinition.questions = [{ key: "position", label: "Position", type: "select", required: true, isActive: true, options: "bad" as never }];
  assert.match(guidedRegistrationProblem(badChoice)!, /choice/);
});
