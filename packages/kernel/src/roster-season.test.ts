import { test } from "node:test";
import assert from "node:assert/strict";
import { pickRosterSeason } from "./season-currency";

const now = new Date("2026-10-25T12:00:00Z");
const past = { id: "past", startDate: "2025-09-01", endDate: "2026-03-31" };
const live = { id: "live", startDate: "2026-09-01", endDate: "2027-06-30" };
const next = { id: "next", startDate: "2027-09-01", endDate: "2028-06-30", registrationOpensAt: "2026-10-01", registrationClosesAt: "2026-12-01" };

test("CAP-19: the roster defaults to the season in progress", () => {
  assert.equal(pickRosterSeason([past, next, live], null, now)?.id, "live");
});

test("a season the team played can be picked", () => {
  assert.equal(pickRosterSeason([past, next, live], "past", now)?.id, "past");
});

test("a season the team never played falls back to the current one", () => {
  assert.equal(pickRosterSeason([past, live], "someone-elses", now)?.id, "live");
});

test("no seasons, no pick", () => {
  assert.equal(pickRosterSeason([], "x", now), null);
});
