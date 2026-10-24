import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidTimeZone, utcToZonedWallTime, zonedWallTimeToUtc } from "./time-zones";

test("rink-local winter time converts with the standard offset", () => {
  assert.equal(zonedWallTimeToUtc("2026-12-05T20:00", "America/New_York").toISOString(), "2026-12-06T01:00:00.000Z");
});

test("rink-local summer time converts with the daylight offset", () => {
  assert.equal(zonedWallTimeToUtc("2026-07-05T20:00", "America/New_York").toISOString(), "2026-07-06T00:00:00.000Z");
});

test("half-hour zones and UTC work", () => {
  assert.equal(zonedWallTimeToUtc("2026-10-25T19:30", "Asia/Kolkata").toISOString(), "2026-10-25T14:00:00.000Z");
  assert.equal(zonedWallTimeToUtc("2026-10-25T19:30", "UTC").toISOString(), "2026-10-25T19:30:00.000Z");
});

test("fall-back hour that happens twice picks the earlier instant", () => {
  // 2026-11-01 01:30 happens at 05:30Z (EDT) and 06:30Z (EST).
  assert.equal(zonedWallTimeToUtc("2026-11-01T01:30", "America/New_York").toISOString(), "2026-11-01T05:30:00.000Z");
});

test("spring-forward gap time is pushed forward by the gap", () => {
  // 2026-03-08 02:30 never happens in New York; 03:30 EDT = 07:30Z.
  assert.equal(zonedWallTimeToUtc("2026-03-08T02:30", "America/New_York").toISOString(), "2026-03-08T07:30:00.000Z");
});

test("round trip UTC -> wall time -> UTC", () => {
  const iso = "2026-10-26T23:15:00.000Z";
  const wall = utcToZonedWallTime(iso, "America/Los_Angeles");
  assert.equal(wall, "2026-10-26T16:15");
  assert.equal(zonedWallTimeToUtc(wall, "America/Los_Angeles").toISOString(), iso);
});

test("bad input is refused", () => {
  assert.throws(() => zonedWallTimeToUtc("2026-02-30T10:00", "UTC"), /Not a real/);
  assert.throws(() => zonedWallTimeToUtc("2026-02-10 10:00", "UTC"), /Expected/);
  assert.throws(() => zonedWallTimeToUtc("2026-02-10T10:00", "Mars/Olympus"), /Unknown time zone/);
  assert.equal(isValidTimeZone("America/Toronto"), true);
  assert.equal(isValidTimeZone("nope"), false);
});
