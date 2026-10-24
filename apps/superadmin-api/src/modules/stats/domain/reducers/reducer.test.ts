import { test } from "node:test";
import assert from "node:assert/strict";
import { hockeyReducer, type RawEvent } from "./reducer";

function ev(over: Partial<RawEvent>): RawEvent {
  return {
    eventType: "goal",
    teamId: "home",
    primaryPersonId: null,
    secondaryPersonIds: [],
    attributes: {},
    ...over
  };
}

function lines(events: RawEvent[]) {
  return Object.fromEntries(hockeyReducer.fold(events).map((l) => [l.personId, l.core]));
}

test("SCH-13: assists on the goal count once each, with points", () => {
  const out = lines([ev({ primaryPersonId: "scorer", secondaryPersonIds: ["a1", "a2"] })]);
  assert.equal(out.scorer!.goals, 1);
  assert.equal(out.scorer!.points, 1);
  assert.equal(out.a1!.assists, 1);
  assert.equal(out.a1!.points, 1);
  assert.equal(out.a2!.assists, 1);
});

test("SCH-14: penalty minutes come from attributes.minutes", () => {
  const out = lines([
    ev({ eventType: "penalty", primaryPersonId: "p", attributes: { infraction: "tripping", minutes: 2 } }),
    ev({ eventType: "penalty", primaryPersonId: "p", attributes: { infraction: "fighting", minutes: 5 } })
  ]);
  assert.equal(out.p!.pim, 7);
});

test("a penalty without minutes adds 0 PIM (the API now refuses these for hockey)", () => {
  const out = lines([ev({ eventType: "penalty", primaryPersonId: "p" })]);
  assert.equal(out.p!.pim, 0);
});

test("legacy standalone assist events are not counted, so nothing is double counted", () => {
  const out = lines([
    ev({ primaryPersonId: "s", secondaryPersonIds: ["a"] }),
    ev({ eventType: "assist", primaryPersonId: "a" })
  ]);
  assert.equal(out.a!.assists, 1);
});

test("stat line keeps the scoring team", () => {
  const [line] = hockeyReducer.fold([ev({ teamId: "away", primaryPersonId: "s" })]);
  assert.equal(line!.teamId, "away");
});
