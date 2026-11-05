import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarDateInZone,
  DATE_FORMATS,
  endOfDayInZone,
  formatCalendarDate,
  formatInZone,
  GAME_TIME_WITH_ZONE,
  isValidTimeZone,
  startOfDayInZone,
  utcToZonedWallTime,
  zonedWallTimeToUtc
} from "./time-zones";

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

test("a game shows in the rink's zone, not UTC", () => {
  // 02:00 UTC on Nov 5 is 9:00 PM on Nov 4 in New York (EST).
  assert.equal(formatInZone("2026-11-05T02:00:00.000Z", "America/New_York"), "Nov 4, 9:00 PM");
});

test("game display follows daylight saving time", () => {
  // 01:00 UTC on Oct 25 is 9:00 PM on Oct 24 in New York (EDT).
  assert.equal(formatInZone("2026-10-25T01:00:00.000Z", "America/New_York"), "Oct 24, 9:00 PM");
});

test("game display takes extra format options", () => {
  assert.equal(
    formatInZone(new Date("2026-11-05T02:00:00.000Z"), "America/Chicago", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit"
    }),
    "Wed 8:00 PM"
  );
});

test("an unknown or missing zone shows UTC and says so", () => {
  assert.equal(formatInZone("2026-11-05T02:00:00.000Z", "Mars/Olympus"), "Nov 5, 2:00 AM UTC");
  assert.equal(formatInZone("2026-11-05T02:00:00.000Z", null), "Nov 5, 2:00 AM UTC");
});

test("a game time can carry the zone's short name, through daylight saving time", () => {
  assert.equal(formatInZone("2026-11-05T02:00:00.000Z", "America/New_York", GAME_TIME_WITH_ZONE), "Nov 4, 9:00 PM EST");
  assert.equal(formatInZone("2026-10-25T01:00:00.000Z", "America/New_York", GAME_TIME_WITH_ZONE), "Oct 24, 9:00 PM EDT");
  assert.equal(formatInZone("2026-11-05T02:00:00.000Z", "America/Chicago", GAME_TIME_WITH_ZONE), "Nov 4, 8:00 PM CST");
});

test("with the zone's short name, an unknown or missing zone says UTC once", () => {
  assert.equal(formatInZone("2026-11-05T02:00:00.000Z", "Mars/Olympus", GAME_TIME_WITH_ZONE), "Nov 5, 2:00 AM UTC");
  assert.equal(formatInZone("2026-11-05T02:00:00.000Z", null, GAME_TIME_WITH_ZONE), "Nov 5, 2:00 AM UTC");
});

test("a bad instant shows nothing", () => {
  assert.equal(formatInZone("not a date", "America/New_York"), "");
});

test("shared date shapes print the same text for every reader", () => {
  assert.equal(formatCalendarDate("2026-11-22", DATE_FORMATS.date), "Nov 22, 2026");
  assert.equal(formatCalendarDate("2026-11-22", DATE_FORMATS.monthDay), "Nov 22");
  assert.equal(formatInZone("2026-11-05T02:00:00.000Z", "America/New_York", DATE_FORMATS.dateTime), "Nov 4, 2026, 9:00 PM");
  assert.equal(formatInZone("2026-11-05T02:00:00.000Z", "America/New_York", DATE_FORMATS.time), "9:00 PM");
  assert.equal(formatInZone("2026-11-05T02:00:00.000Z", "America/New_York", DATE_FORMATS.gameTime), "Nov 4, 9:00 PM");
});

test("a calendar date never slips to the day before", () => {
  assert.equal(formatCalendarDate("2026-01-01"), "Jan 1, 2026");
  assert.equal(formatCalendarDate("2026-11-22T00:00:00.000Z"), "Nov 22, 2026");
  assert.equal(formatCalendarDate(""), "");
  assert.equal(formatCalendarDate("not a date"), "");
});

// PPHL, 4 Nov 2026: "Nov 4" typed from India for a New York season was
// stored at the browser's midnight (Nov 3 18:30Z) and read back as Nov 3.
test("a registration day starts at midnight in the season's zone, whatever zone the browser is in", () => {
  assert.equal(startOfDayInZone("2026-11-04", "America/New_York"), "2026-11-04T05:00:00.000Z");
  assert.equal(startOfDayInZone("2026-11-04", "Asia/Kolkata"), "2026-11-03T18:30:00.000Z", "only an India season starts at 18:30Z");
  assert.equal(startOfDayInZone("2026-11-04", "UTC"), "2026-11-04T00:00:00.000Z");
  assert.equal(startOfDayInZone("2026-07-04", "America/New_York"), "2026-07-04T04:00:00.000Z", "daylight time");
});

test("a registration day ends at 23:59:59 in the season's zone", () => {
  assert.equal(endOfDayInZone("2026-11-10", "America/New_York"), "2026-11-11T04:59:59.000Z");
  assert.equal(endOfDayInZone("2026-11-10", "Asia/Kolkata"), "2026-11-10T18:29:59.000Z");
  assert.equal(endOfDayInZone("2026-11-10", "UTC"), "2026-11-10T23:59:59.000Z");
});

test("the day the clocks change still starts at midnight and ends at 23:59:59", () => {
  // New York springs forward on 2026-03-08 at 02:00 and falls back on 2026-11-01 at 02:00.
  assert.equal(startOfDayInZone("2026-03-08", "America/New_York"), "2026-03-08T05:00:00.000Z");
  assert.equal(endOfDayInZone("2026-03-08", "America/New_York"), "2026-03-09T03:59:59.000Z");
  assert.equal(startOfDayInZone("2026-11-01", "America/New_York"), "2026-11-01T04:00:00.000Z");
  assert.equal(endOfDayInZone("2026-11-01", "America/New_York"), "2026-11-02T04:59:59.000Z");
});

test("a stored timestamp reads back as the day it was typed, in the season's zone", () => {
  assert.equal(calendarDateInZone("2026-11-04T05:00:00.000Z", "America/New_York"), "2026-11-04");
  assert.equal(calendarDateInZone("2026-11-11T04:59:59.000Z", "America/New_York"), "2026-11-10", "not the UTC date");
  assert.equal(calendarDateInZone("2026-11-03T18:30:00.000Z", "Asia/Kolkata"), "2026-11-04");
  assert.equal(calendarDateInZone(new Date("2026-11-04T05:00:00.000Z"), "America/New_York"), "2026-11-04");
  for (const zone of ["America/Los_Angeles", "America/New_York", "Europe/London", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
    for (const day of ["2026-01-01", "2026-03-08", "2026-11-04", "2026-12-31"]) {
      assert.equal(calendarDateInZone(startOfDayInZone(day, zone), zone), day, `${zone} start ${day}`);
      assert.equal(calendarDateInZone(endOfDayInZone(day, zone), zone), day, `${zone} end ${day}`);
    }
  }
});

test("reading back with no zone or an unknown zone uses UTC; a bad or missing instant reads blank", () => {
  assert.equal(calendarDateInZone("2026-11-04T05:00:00.000Z", null), "2026-11-04");
  assert.equal(calendarDateInZone("2026-11-04T05:00:00.000Z", "Mars/Olympus"), "2026-11-04");
  assert.equal(calendarDateInZone("not a date", "America/New_York"), "");
  assert.equal(calendarDateInZone(null, "America/New_York"), "");
  assert.equal(calendarDateInZone("", "America/New_York"), "");
});

test("a day that is not YYYY-MM-DD or a zone that does not exist is refused", () => {
  assert.throws(() => startOfDayInZone("2026-11-4", "America/New_York"), /Expected YYYY-MM-DD/);
  assert.throws(() => startOfDayInZone("11/04/2026", "America/New_York"), /Expected YYYY-MM-DD/);
  assert.throws(() => endOfDayInZone("2026-11-04T00:00", "America/New_York"), /Expected YYYY-MM-DD/);
  assert.throws(() => startOfDayInZone("2026-02-30", "America/New_York"), /Not a real/);
  assert.throws(() => startOfDayInZone("2026-11-04", "Mars/Olympus"), /Unknown time zone/);
  assert.throws(() => endOfDayInZone("2026-11-04", ""), /Unknown time zone/);
});
