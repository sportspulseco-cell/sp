import { test } from "node:test";
import assert from "node:assert/strict";
import { finalTeamConstraintViolations, type FinalScheduledGame } from "./final-constraints";
const game: FinalScheduledGame = { homeTeamId: "a", awayTeamId: "b", startTsUtc: "2026-11-03T02:00:00Z", durationMin: 60, band: "late", venueId: "rink" };
test("final late cap includes retained games and refuses unknown bands", () => {
  const teams = [{ teamId: "a", divisionId: "d" }];
  assert.equal(finalTeamConstraintViolations([game], teams, "UTC", .5)[0]?.type, "late_cap");
  assert.equal(finalTeamConstraintViolations([game, { ...game, band: "early" }], teams, "UTC", .5).length, 0);
  assert.equal(finalTeamConstraintViolations([{ ...game, band: null }], teams, "UTC", .5)[0]?.type, "unknown_time_band");
});
test("final blackout and exception counts use season-local dates and retained games", () => {
  const teams = [{ teamId: "a", divisionId: "d", blackouts: [{ startTsUtc: "2026-11-03T02:30:00Z", endTsUtc: "2026-11-03T03:00:00Z" }],
    preferredWeekdays: [1], maxOffNightGames: 0, preferredVenueIds: ["rink"], maxOffVenueGames: 0 }];
  const local = finalTeamConstraintViolations([game], teams, "America/New_York");
  assert.deepEqual(local.map(v => v.type), ["team_blackout"]);
  const utc = finalTeamConstraintViolations([{ ...game, venueId: null }], teams, "UTC");
  assert.deepEqual(utc.map(v => v.type), ["team_blackout", "off_night_cap", "off_venue_cap"]);
});
