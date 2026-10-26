import { test } from "node:test";
import assert from "node:assert/strict";
import { grantableRoleCodes, roleGrantAllowed } from "./role-grants";

const org = { roleCode: "org_admin", scopeType: "org" };
const league = { roleCode: "league_admin", scopeType: "league" };

test("org admin grants inside the org, never super admin or platform roles", () => {
  assert.equal(roleGrantAllowed(org, "org_admin", "org"), true);
  assert.equal(roleGrantAllowed(org, "league_admin", "league"), true);
  assert.equal(roleGrantAllowed(org, "captain", "team"), true);
  assert.equal(roleGrantAllowed(org, "registrar", "org"), true);
  assert.equal(roleGrantAllowed(org, "super_admin", "platform"), false);
  assert.equal(roleGrantAllowed(org, "parent", "platform"), false);
  assert.equal(roleGrantAllowed(org, "org_admin", "platform"), false);
});

test("league admin never grants above their own level or scope", () => {
  assert.equal(roleGrantAllowed(league, "league_admin", "league"), true);
  assert.equal(roleGrantAllowed(league, "season_admin", "season"), true);
  assert.equal(roleGrantAllowed(league, "referee", "game"), true);
  assert.equal(roleGrantAllowed(league, "coach", "team"), true);
  assert.equal(roleGrantAllowed(league, "org_admin", "org"), false);
  assert.equal(roleGrantAllowed(league, "registrar", "org"), false);
  assert.equal(roleGrantAllowed(league, "super_admin", "platform"), false);
});

test("roles are granted only at their own scopes (no league_admin on a team)", () => {
  assert.equal(roleGrantAllowed(league, "league_admin", "team"), false);
  assert.equal(roleGrantAllowed(org, "org_admin", "league"), false);
  assert.equal(roleGrantAllowed(org, "captain", "league"), false);
});

test("roles without role.assign grant nothing", () => {
  for (const code of ["season_admin", "division_admin", "captain", "coach", "player", "registrar", "referee"]) {
    assert.equal(roleGrantAllowed({ roleCode: code, scopeType: "team" }, "player", "team"), false, code);
  }
  assert.equal(roleGrantAllowed({ roleCode: "custom_thing", scopeType: "org" }, "player", "team"), false);
});

test("grantableRoleCodes filters candidates and keeps super admin unrestricted", () => {
  const candidates = ["league_admin", "registrar", "referee", "scorekeeper"];
  assert.deepEqual(grantableRoleCodes([league], "league", candidates), candidates);
  assert.deepEqual(grantableRoleCodes([league], "org", ["org_admin", "registrar"]), []);
  assert.deepEqual(grantableRoleCodes([org], "org", ["org_admin", "registrar"]), ["org_admin", "registrar"]);
  assert.deepEqual(grantableRoleCodes([], "org", ["org_admin"], true), ["org_admin"]);
});
