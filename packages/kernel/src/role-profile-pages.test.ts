import { test } from "node:test";
import assert from "node:assert/strict";
import { profilePagesByTopic, profileQuestionTopic, ROLE_PROFILE_SCHEMAS } from "./role-profiles";

test("profileQuestionTopic names a question's topic", () => {
  assert.equal(profileQuestionTopic("dob"), "About you");
  assert.equal(profileQuestionTopic("addressCity"), "Address");
  assert.equal(profileQuestionTopic("emergencyPhone"), "Emergency contact");
  assert.equal(profileQuestionTopic("usaHockeyId"), "Hockey registration");
  assert.equal(profileQuestionTopic("medicalNotes"), "Health");
  assert.equal(profileQuestionTopic("positions"), "Playing");
  assert.equal(profileQuestionTopic("somethingNew"), "More about you");
});

test("the player profile pages have names, never Page N", () => {
  const pages = profilePagesByTopic(ROLE_PROFILE_SCHEMAS.player!.questions);
  assert.ok(pages.length > 1);
  for (const p of pages) assert.doesNotMatch(p.label, /^Page /);
  assert.equal(pages[0]!.label, "About you");
  assert.equal(pages.flatMap((p) => p.questions).length, ROLE_PROFILE_SCHEMAS.player!.questions.length);
});

test("a long topic continues on a page named after it", () => {
  const qs = Array.from({ length: 12 }, (_, i) => ({ key: i % 2 ? "positions" : "shot" }));
  const pages = profilePagesByTopic(qs, 5);
  assert.deepEqual(pages.map((p) => [p.label, p.questions.length]), [["Playing", 5], ["Playing, continued", 5], ["Playing, continued (2)", 2]]);
});
