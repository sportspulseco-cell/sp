import { test } from "node:test";
import assert from "node:assert/strict";
import { validateHockeyEvent, type HockeyEventDraft } from "./hockey-scoring";

function ev(over: Partial<HockeyEventDraft>): HockeyEventDraft {
  return {
    eventType: "goal",
    teamId: "T",
    primaryPersonId: "P1",
    secondaryPersonIds: [],
    attributes: {},
    ...over
  };
}

test("goal with two distinct assists is valid", () => {
  assert.equal(validateHockeyEvent(ev({ secondaryPersonIds: ["P2", "P3"] })), null);
});

test("standalone assist events are refused (assists ride on the goal)", () => {
  assert.match(validateHockeyEvent(ev({ eventType: "assist" }))!, /on the goal/);
});

test("goal assist rules: max two, distinct, not the scorer, scorer required", () => {
  assert.match(validateHockeyEvent(ev({ secondaryPersonIds: ["a", "b", "c"] }))!, /at most 2/);
  assert.match(validateHockeyEvent(ev({ secondaryPersonIds: ["a", "a"] }))!, /different/);
  assert.match(validateHockeyEvent(ev({ secondaryPersonIds: ["P1"] }))!, /scorer cannot/);
  assert.match(validateHockeyEvent(ev({ primaryPersonId: null, secondaryPersonIds: ["a"] }))!, /scorer before/);
  assert.match(validateHockeyEvent(ev({ teamId: null, primaryPersonId: null }))!, /team that scored/);
});

test("only goals carry assists", () => {
  assert.match(validateHockeyEvent(ev({ eventType: "shot", secondaryPersonIds: ["a"] }))!, /Only goals/);
});

test("penalty needs a listed infraction and 2/4/5/10 minutes", () => {
  const pen = (attributes: Record<string, unknown>) =>
    validateHockeyEvent(ev({ eventType: "penalty", attributes }));
  assert.equal(pen({ infraction: "tripping", minutes: 2 }), null);
  assert.equal(pen({ infraction: "fighting", minutes: 5 }), null);
  assert.match(pen({ infraction: "tripping" })!, /length/);
  assert.match(pen({ infraction: "tripping", minutes: 3 })!, /length/);
  assert.match(pen({ infraction: "tripping", minutes: "2" })!, /length/);
  assert.match(pen({ minutes: 2 })!, /infraction/);
  assert.match(pen({ infraction: "toString", minutes: 2 })!, /infraction/);
});

test("a player-attributed event needs the team", () => {
  assert.match(validateHockeyEvent(ev({ eventType: "shot", teamId: null }))!, /team/);
});

test("FR-3.5.4 penalty class: picked class wins, else from minutes; bad class refused", async () => {
  const k = await import("./hockey-scoring");
  assert.equal(k.penaltyClassOf({ minutes: 10 }), "misconduct");
  assert.equal(k.penaltyClassOf({ minutes: 5, penaltyClass: "match" }), "match");
  assert.equal(k.penaltyClassOf({ minutes: 2 }), "minor");
  assert.equal(k.penaltyClassOf({}), null);
  assert.ok(k.EJECTION_PENALTY_CLASSES.includes("game_misconduct"));
  assert.match(
    k.validateHockeyEvent({ eventType: "penalty", teamId: "t", primaryPersonId: "p", secondaryPersonIds: [], attributes: { minutes: 10, infraction: "fighting", penaltyClass: "ejection" } }) ?? "",
    /penalty type/
  );
  assert.equal(
    k.validateHockeyEvent({ eventType: "penalty", teamId: "t", primaryPersonId: "p", secondaryPersonIds: [], attributes: { minutes: 10, infraction: "fighting", penaltyClass: "game_misconduct" } }),
    null
  );
});
