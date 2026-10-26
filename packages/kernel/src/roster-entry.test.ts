import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assignJerseyNumber,
  inviteAutoReminderDue,
  jerseyNumberRefusal,
  joinTeamSubmissionType,
  requestedJerseyNumber,
  rosterEntryReadiness,
  rosterOpeningRefusal,
  submissionTypeCarriesTeam,
  teamRegistrationPath
} from "./roster-entry";

test("jersey: the asked-for number when free", () => {
  assert.equal(assignJerseyNumber(9, [1, 2]), 9);
  assert.equal(assignJerseyNumber(0, []), 0);
});

test("jersey: a taken number falls back to the lowest free from 1", () => {
  assert.equal(assignJerseyNumber(9, [9]), 1);
  assert.equal(assignJerseyNumber(9, [1, 9, 2, null]), 3);
});

test("jersey: no request, or an unusable one, gets the lowest free", () => {
  assert.equal(assignJerseyNumber(null, [0, 1]), 2);
  assert.equal(assignJerseyNumber(100, []), 1);
  assert.equal(assignJerseyNumber(-1, []), 1);
  assert.equal(assignJerseyNumber(4.5, [1]), 2);
  assert.equal(assignJerseyNumber("9", []), 1);
});

test("jersey: a full 1-99 gives no number", () => {
  const all = Array.from({ length: 99 }, (_, i) => i + 1);
  assert.equal(assignJerseyNumber(null, all), null);
  assert.equal(assignJerseyNumber(0, all), 0);
  assert.equal(assignJerseyNumber(50, all), null);
});

test("jersey: a form answer is read as a number 0-99", () => {
  assert.equal(requestedJerseyNumber(9), 9);
  assert.equal(requestedJerseyNumber("12"), 12);
  assert.equal(requestedJerseyNumber(""), null);
  assert.equal(requestedJerseyNumber("abc"), null);
  assert.equal(requestedJerseyNumber(120), null);
  assert.equal(requestedJerseyNumber(null), null);
});

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

test("invite reminders: once after 3 days, once before the lock", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  const d = (h: number) => new Date(now.getTime() - h * 3600_000);
  assert.equal(inviteAutoReminderDue({ createdAt: d(24), rosterLockAt: null, sent: [] }, now), null);
  assert.equal(inviteAutoReminderDue({ createdAt: d(73), rosterLockAt: null, sent: [] }, now), "after_days");
  assert.equal(inviteAutoReminderDue({ createdAt: d(73), rosterLockAt: null, sent: ["after_days"] }, now), null);
  const lockSoon = new Date(now.getTime() + 20 * 3600_000);
  assert.equal(inviteAutoReminderDue({ createdAt: d(30), rosterLockAt: lockSoon, sent: [] }, now), "before_lock");
  assert.equal(inviteAutoReminderDue({ createdAt: d(80), rosterLockAt: lockSoon, sent: ["before_lock"] }, now), "after_days");
  assert.equal(inviteAutoReminderDue({ createdAt: d(30), rosterLockAt: lockSoon, sent: ["before_lock"] }, now), null);
  assert.equal(inviteAutoReminderDue({ createdAt: d(2), rosterLockAt: lockSoon, sent: [] }, now), null);
  assert.equal(inviteAutoReminderDue({ createdAt: d(100), rosterLockAt: d(1), sent: [] }, now), null);
});

test("jersey numbers are whole numbers 0-99", () => {
  assert.equal(jerseyNumberRefusal(null), null);
  assert.equal(jerseyNumberRefusal(0), null);
  assert.equal(jerseyNumberRefusal(99), null);
  assert.ok(jerseyNumberRefusal(100));
  assert.ok(jerseyNumberRefusal(-1));
  assert.ok(jerseyNumberRefusal(7.5));
});
