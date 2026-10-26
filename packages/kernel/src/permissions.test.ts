import { test } from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ROLE_BY_CODE, gameOfficialPermissions, permissionGranted } from "./permissions";

test("an official assigned to a game: referee and scorekeeper run the scoresheet, a linesman only reads, declined gets nothing", () => {
  for (const role of ["referee", "scorekeeper", "timekeeper"]) {
    for (const p of ["game.read", "game.start", "game_event.write", "score.write", "game.finalize"]) {
      assert.equal(permissionGranted(gameOfficialPermissions(role, "confirmed"), p), true, `${role} ${p}`);
    }
    assert.equal(permissionGranted(gameOfficialPermissions(role, "confirmed"), "game.reschedule"), false);
  }
  assert.equal(permissionGranted(gameOfficialPermissions("referee", "tentative"), "suspension.issue"), true);
  assert.equal(permissionGranted(gameOfficialPermissions("scorekeeper", "confirmed"), "suspension.issue"), false);
  assert.deepEqual(gameOfficialPermissions("linesman", "confirmed"), ["game.read"]);
  assert.deepEqual(gameOfficialPermissions("referee", "declined"), []);
});

const perms = (code: string) => SYSTEM_ROLE_BY_CODE[code]!.defaultPermissions;

test("wildcards: root, module and exact", () => {
  assert.equal(permissionGranted(["*"], "game.finalize"), true);
  assert.equal(permissionGranted(["game.*"], "game.finalize"), true);
  assert.equal(permissionGranted(["game.read"], "game.finalize"), false);
  assert.equal(permissionGranted(["scheduler.*"], "scheduler.report.read"), true);
  assert.equal(permissionGranted(["games.*"], "game.read"), false);
});

test("SCH-12: league admin, scorekeeper and referee can run the scoresheet", () => {
  for (const role of ["league_admin", "scorekeeper", "referee"]) {
    for (const p of ["game.start", "game_event.write", "score.write", "game.finalize"]) {
      assert.equal(permissionGranted(perms(role), p), true, `${role} ${p}`);
    }
  }
});

test("officials cannot reschedule, publish, cancel or assign officials; league admin can", () => {
  for (const p of ["game.reschedule", "game.publish", "game.cancel", "game.assign_officials"]) {
    assert.equal(permissionGranted(perms("scorekeeper"), p), false, `scorekeeper ${p}`);
    assert.equal(permissionGranted(perms("referee"), p), false, `referee ${p}`);
    assert.equal(permissionGranted(perms("league_admin"), p), true, `league_admin ${p}`);
    assert.equal(permissionGranted(perms("org_admin"), p), true, `org_admin ${p}`);
  }
});

test("captain and player get no game operations", () => {
  for (const role of ["captain", "player", "coach"]) {
    for (const p of ["game.start", "game_event.write", "score.write", "game.finalize", "game.read"]) {
      assert.equal(permissionGranted(perms(role), p), false, `${role} ${p}`);
    }
  }
});
