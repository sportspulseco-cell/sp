import { test } from "node:test";
import assert from "node:assert/strict";
import { orderSchedule, parseScheduleFilter } from "./schedule-order";

const now = Date.parse("2027-01-20T12:00:00Z");
const games = [
  { id: "jan30", scheduledStartTsUtc: "2027-01-30T20:00:00Z", status: "scheduled" },
  { id: "jan19", scheduledStartTsUtc: "2027-01-19T20:00:00Z", status: "completed" },
  { id: "jan23", scheduledStartTsUtc: "2027-01-23T20:00:00Z", status: "scheduled" },
  { id: "jan12", scheduledStartTsUtc: "2027-01-12T20:00:00Z", status: "forfeited" },
  { id: "live", scheduledStartTsUtc: "2027-01-20T11:00:00Z", status: "in_play" },
  { id: "jan15x", scheduledStartTsUtc: "2027-01-15T20:00:00Z", status: "cancelled" },
  { id: "jan25x", scheduledStartTsUtc: "2027-01-25T20:00:00Z", status: "cancelled" }
];
const ids = (f: "upcoming" | "completed" | "all") => orderSchedule(games, f, now).map((g) => g.id);

test("F-5: upcoming lists the next game first (a live game before it)", () => {
  assert.deepEqual(ids("upcoming"), ["live", "jan23", "jan30"]);
});

test("F-5: completed lists the most recent result first", () => {
  assert.deepEqual(ids("completed"), ["jan19", "jan12"]);
});

test("F-5: all is upcoming nearest first, then the past most recent first", () => {
  assert.deepEqual(ids("all"), ["live", "jan23", "jan30", "jan25x", "jan19", "jan15x", "jan12"]);
});

test("F-5: the default filter is upcoming", () => {
  assert.equal(parseScheduleFilter(undefined), "upcoming");
  assert.equal(parseScheduleFilter("bogus"), "upcoming");
  assert.equal(parseScheduleFilter("all"), "all");
  assert.equal(parseScheduleFilter("completed"), "completed");
});

test("F-5: no games gives an empty list on every filter", () => {
  for (const f of ["upcoming", "completed", "all"] as const) assert.deepEqual(orderSchedule([], f, now), []);
});
