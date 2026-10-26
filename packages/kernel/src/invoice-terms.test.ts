import { test } from "node:test";
import assert from "node:assert/strict";
import { registrationInvoiceDueAt } from "./invoice-terms";

const DAY = 86_400_000;
const issued = new Date("2026-10-26T10:00:00Z");
const after = (days: number) => new Date(issued.getTime() + days * DAY);

test("a registration fee is due when registration closes", () => {
  assert.equal(registrationInvoiceDueAt({ issuedAt: issued, registrationClosesAt: after(40) }).toISOString(), after(40).toISOString());
});

test("never sooner than 14 days after issue, even on the last day of registration", () => {
  assert.equal(registrationInvoiceDueAt({ issuedAt: issued, registrationClosesAt: after(1) }).toISOString(), after(14).toISOString());
  assert.equal(registrationInvoiceDueAt({ issuedAt: issued, registrationClosesAt: after(-3) }).toISOString(), after(14).toISOString());
});

test("a season with no close date gives 14 days", () => {
  assert.equal(registrationInvoiceDueAt({ issuedAt: issued, registrationClosesAt: null }).toISOString(), after(14).toISOString());
});

test("a payment plan is due no sooner than its last installment", () => {
  assert.equal(
    registrationInvoiceDueAt({ issuedAt: issued, registrationClosesAt: after(20), planDueInDays: [0, 30, 60] }).toISOString(),
    after(60).toISOString()
  );
  assert.equal(
    registrationInvoiceDueAt({ issuedAt: issued, registrationClosesAt: after(90), planDueInDays: [0, 30, 60] }).toISOString(),
    after(90).toISOString()
  );
});
