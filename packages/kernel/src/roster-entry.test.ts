import { test } from "node:test";
import assert from "node:assert/strict";
import {
  jerseyNumberRefusal,
  joinTeamSubmissionType,
  rosterEntryReadiness,
  rosterOpeningRefusal,
  submissionTypeCarriesTeam,
  teamRegistrationPath
} from "./roster-entry";

test("an approved registration joins now", () => {
  assert.equal(rosterEntryReadiness("approved"), "ready");
});

test("a submitted registration waits for the league", () => {
  for (const s of ["pending_review", "pending_offline", "incomplete", "submitted"]) {
    assert.equal(rosterEntryReadiness(s), "awaiting_approval", s);
  }
});

test("no registration, an unfinished one or an ended one means register first", () => {
  for (const s of [null, undefined, "draft", "pending_consent", "pending_payment", "rejected", "cancelled"]) {
    assert.equal(rosterEntryReadiness(s), "register", String(s));
  }
});

test("only player paths carry a team", () => {
  assert.equal(submissionTypeCarriesTeam("team"), false);
  assert.equal(submissionTypeCarriesTeam("captain_invite"), true);
  assert.equal(submissionTypeCarriesTeam("individual"), true);
});

test("joining a team uses the invite path when offered, else individual", () => {
  assert.equal(joinTeamSubmissionType(["team", "captain_invite"]), "captain_invite");
  assert.equal(joinTeamSubmissionType(["individual", "free_agent"]), "individual");
  assert.equal(joinTeamSubmissionType(["team"]), null);
});

test("team registration path carries the team and the invite", () => {
  assert.equal(teamRegistrationPath("s1", "t1"), "/register/s1?team=t1");
  assert.equal(teamRegistrationPath("s1", "t1", "a b"), "/register/s1?team=t1&invite=a+b");
});

test("a full or locked roster says so", () => {
  const base = { teamName: "Ice Cats", seasonName: "Fall", current: 3, maxRosterSize: 20, rosterLockAt: null };
  const now = new Date("2026-10-26T12:00:00Z");
  assert.equal(rosterOpeningRefusal(base, now), null);
  assert.equal(rosterOpeningRefusal({ ...base, current: 20 }, now)?.reason, "full");
  assert.match(rosterOpeningRefusal({ ...base, current: 20 }, now)!.message, /full \(20 of 20\)/);
  assert.equal(rosterOpeningRefusal({ ...base, rosterLockAt: "2026-10-01T00:00:00Z" }, now)?.reason, "locked");
  assert.equal(rosterOpeningRefusal({ ...base, rosterLockAt: "2026-12-01T00:00:00Z" }, now), null);
});

test("jersey numbers are whole numbers 0-99", () => {
  assert.equal(jerseyNumberRefusal(null), null);
  assert.equal(jerseyNumberRefusal(0), null);
  assert.equal(jerseyNumberRefusal(99), null);
  assert.ok(jerseyNumberRefusal(100));
  assert.ok(jerseyNumberRefusal(-1));
  assert.ok(jerseyNumberRefusal(7.5));
});
