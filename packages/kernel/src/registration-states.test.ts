import { test } from "node:test";
import assert from "node:assert/strict";
import { canAdminDecide, registrationWaitingOn } from "./registration-states";

test("canAdminDecide follows the state rules", () => {
  assert.deepEqual(canAdminDecide("pending_payment"), { approve: false, reject: false });
  assert.deepEqual(canAdminDecide("pending_review"), { approve: true, reject: true });
  assert.deepEqual(canAdminDecide("pending_offline"), { approve: true, reject: true });
  assert.deepEqual(canAdminDecide("approved"), { approve: false, reject: false });
  assert.deepEqual(canAdminDecide("not_a_state"), { approve: false, reject: false });
});

test("registrationWaitingOn names who acts next, only where the admin cannot", () => {
  assert.equal(registrationWaitingOn("pending_payment"), "Waiting for player to pay");
  assert.equal(registrationWaitingOn("pending_consent"), "Waiting for parent consent");
  assert.equal(registrationWaitingOn("pending_review"), null);
  assert.equal(registrationWaitingOn("approved"), null);
});
