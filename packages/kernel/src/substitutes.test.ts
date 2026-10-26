import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeSubReasons,
  freeAgentAvailableFor,
  localDayAndHour,
  subAdminMayOverride,
  subIneligibleReasons,
  subLevelFit,
  subRequestStatus,
  timeWindowOfHour,
  type SubCandidateFacts
} from "./substitutes";

const NOW = new Date("2026-11-02T12:00:00Z");

test("open request expires when the game starts, or is played or cancelled", () => {
  const later = new Date(NOW.getTime() + 3_600_000);
  assert.equal(subRequestStatus("requested", { start: later, status: "scheduled" }, NOW), "requested");
  assert.equal(subRequestStatus("requested", { start: NOW, status: "scheduled" }, NOW), "expired");
  assert.equal(subRequestStatus("requested", { start: later, status: "cancelled" }, NOW), "expired");
  assert.equal(subRequestStatus("requested", { start: later, status: "in_play" }, NOW), "expired");
  assert.equal(subRequestStatus("requested", { start: later, status: "postponed" }, NOW), "requested");
  // Final states never change, even after the start.
  assert.equal(subRequestStatus("accepted", { start: NOW, status: "completed" }, NOW), "accepted");
  assert.equal(subRequestStatus("declined", { start: later, status: "scheduled" }, NOW), "declined");
  assert.equal(subRequestStatus("garbage", { start: later, status: "scheduled" }, NOW), "expired");
});

test("rink-local day and hour, and the time-of-day window", () => {
  // 2026-11-03T00:30Z is Monday 7:30 pm in New York.
  assert.deepEqual(localDayAndHour("2026-11-03T00:30:00Z", "America/New_York"), { day: "Mon", hour: 19 });
  assert.deepEqual(localDayAndHour("2026-11-03T00:30:00Z", "UTC"), { day: "Tue", hour: 0 });
  assert.deepEqual(localDayAndHour("2026-11-03T00:30:00Z", "Not/AZone"), { day: "Tue", hour: 0 });
  assert.equal(timeWindowOfHour(0), "AM");
  assert.equal(timeWindowOfHour(11), "AM");
  assert.equal(timeWindowOfHour(12), "PM");
  assert.equal(timeWindowOfHour(16), "PM");
  assert.equal(timeWindowOfHour(17), "EVE");
});

test("free-agent availability: day and window, legacy keys, nothing marked is unknown", () => {
  const mon7pm = { day: "Mon" as const, hour: 19 };
  assert.equal(freeAgentAvailableFor({ Mon: ["EVE"] }, mon7pm), "yes");
  assert.equal(freeAgentAvailableFor({ Mon: ["AM"] }, mon7pm), "no");
  assert.equal(freeAgentAvailableFor({ Tue: ["EVE"] }, mon7pm), "no");
  assert.equal(freeAgentAvailableFor({ monday: true }, mon7pm), "yes");
  assert.equal(freeAgentAvailableFor({ Mon: [] }, mon7pm), "unknown");
  assert.equal(freeAgentAvailableFor({}, mon7pm), "unknown");
  assert.equal(freeAgentAvailableFor(null, mon7pm), "unknown");
});

test("level fit: any listed level that fits the tier; unknown never guessed", () => {
  assert.equal(subLevelFit(["B"], "B"), "match");
  assert.equal(subLevelFit(["A", "B"], "B"), "match");
  assert.equal(subLevelFit(["A"], "C"), "mismatch");
  assert.equal(subLevelFit(["C1"], "C"), "match"); // legacy code
  assert.equal(subLevelFit(["A"], "Premier"), "match");
  assert.equal(subLevelFit(["B"], "Premier"), "mismatch");
  assert.equal(subLevelFit(["B"], null), "unknown");
  assert.equal(subLevelFit([null, ""], "B"), "unknown");
  assert.equal(subLevelFit(["B"], "Z"), "unknown"); // tier outside the list
});

function facts(over: Partial<SubCandidateFacts>): SubCandidateFacts {
  return {
    source: "free_agent",
    onThisTeam: false,
    inGame: false,
    suspended: false,
    availability: "yes",
    busyOtherGame: false,
    level: "match",
    guestAppearances: 0,
    guestSeasonLimit: 5,
    hasAccount: true,
    ...over
  };
}

test("eligibility reasons", () => {
  assert.deepEqual(subIneligibleReasons(facts({})), []);
  assert.deepEqual(subIneligibleReasons(facts({ level: "unknown" })), []);
  assert.deepEqual(subIneligibleReasons(facts({ suspended: true })), ["suspended"]);
  assert.deepEqual(subIneligibleReasons(facts({ availability: "no" })), ["not_available"]);
  assert.deepEqual(subIneligibleReasons(facts({ availability: "unknown" })), ["availability_unknown"]);
  // A rostered player has no free-agent availability; only clashes count.
  assert.deepEqual(subIneligibleReasons(facts({ source: "league_player", availability: null })), []);
  assert.deepEqual(
    subIneligibleReasons(facts({ source: "league_player", availability: null, busyOtherGame: true })),
    ["busy_other_game"]
  );
  assert.deepEqual(subIneligibleReasons(facts({ guestAppearances: 5 })), ["guest_season_limit"]);
  assert.deepEqual(subIneligibleReasons(facts({ guestAppearances: 4 })), []);
  assert.deepEqual(
    subIneligibleReasons(facts({ onThisTeam: true, inGame: true, hasAccount: false, level: "mismatch" })),
    ["on_roster", "in_game", "level_mismatch", "no_account"]
  );
});

test("admin override covers availability, level and account only", () => {
  assert.equal(subAdminMayOverride([]), true);
  assert.equal(subAdminMayOverride(["level_mismatch", "not_available", "no_account"]), true);
  assert.equal(subAdminMayOverride(["level_mismatch", "suspended"]), false);
  assert.equal(subAdminMayOverride(["guest_season_limit"]), false);
  assert.equal(subAdminMayOverride(["on_roster"]), false);
  assert.equal(subAdminMayOverride(["in_game"]), false);
  assert.equal(describeSubReasons(["suspended", "busy_other_game"]), "Suspended for this game; Has another game at that time");
});
