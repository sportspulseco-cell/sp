import { test } from "node:test";
import assert from "node:assert/strict";
import { registrationReference } from "./registration-reference";

test("reference: season initials, start year, first 8 of the id in capitals", () => {
  assert.equal(
    registrationReference({ id: "491b9381-ef45-4966-beb3-8d7ee24849af", seasonName: "E2EMVPUILDS Season", seasonStartDate: "2026-11-25" }),
    "ES-2026-491B9381"
  );
  assert.equal(registrationReference({ id: "2d3fdb53-0000-0000-0000-000000000000", seasonName: "October season 1", seasonStartDate: "2026-10-01" }), "OS1-2026-2D3FDB53");
});

test("reference: no season gives REG and no empty year part", () => {
  assert.equal(registrationReference({ id: "2d3fdb53-0000-0000-0000-000000000000" }), "REG-2D3FDB53");
});
