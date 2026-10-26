import { test } from "node:test";
import assert from "node:assert/strict";
import { auditTargetFromPath } from "./audit.interceptor";

const U = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

test("record update and record verb keep their resource", () => {
  assert.deepEqual(
    [auditTargetFromPath("PATCH", `/api/league/seasons/${U}`).resourceType, auditTargetFromPath("PATCH", `/api/league/seasons/${U}`).verb],
    ["seasons", "update"]
  );
  const t = auditTargetFromPath("POST", `/api/games/${U}/finalize`);
  assert.equal(`${t.resourceType}.${t.verb}`, "games.finalize");
});

test("a verb after a non-UUID token names the action, not the resource", () => {
  const t = auditTargetFromPath("POST", "/api/captain/roster/invites/k7Tq9xZ2mP4vR8sL1wN3/accept");
  assert.equal(`${t.resourceType}.${t.verb}`, "invites.accept");
});

test("a verb on a collection names the collection", () => {
  const t = auditTargetFromPath("POST", "/api/registration-v2/admin/submissions/bulk");
  assert.equal(`${t.resourceType}.${t.verb}`, "submissions.bulk");
  const d = auditTargetFromPath("POST", "/api/finance/discount-codes/redeem");
  assert.equal(`${d.resourceType}.${d.verb}`, "discount-codes.redeem");
});

test("a plain collection POST is still a create", () => {
  const t = auditTargetFromPath("POST", "/api/league/leagues");
  assert.equal(`${t.resourceType}.${t.verb}`, "leagues.create");
});
