import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceLineLabel, invoiceLineTotals, invoicePayRange, invoiceTitle, registrationInvoiceDueAt, signedLineAmount } from "./invoice-terms";

test("aging buckets by days past due", async () => {
  const { agingBucket } = await import("./invoice-terms");
  const now = new Date("2026-10-26T12:00:00Z");
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000);
  assert.equal(agingBucket(null, now), "Current");
  assert.equal(agingBucket(ago(-3), now), "Current");
  assert.equal(agingBucket(ago(0.5), now), "1-30 days");
  assert.equal(agingBucket(ago(30), now), "1-30 days");
  assert.equal(agingBucket(ago(31), now), "31-60 days");
  assert.equal(agingBucket(ago(90), now), "61-90 days");
  assert.equal(agingBucket(ago(91), now), "Over 90 days");
});

const plan = [
  { installmentNumber: 0, amountCents: 5000, status: "succeeded" },
  { installmentNumber: 1, amountCents: 5000, status: "scheduled" },
  { installmentNumber: 2, amountCents: 5000, status: "scheduled" }
];

test("captain cover amount: one cent to the balance", async () => {
  const { coverAmountProblem } = await import("./invoice-terms");
  assert.equal(coverAmountProblem(1, 5000), null);
  assert.equal(coverAmountProblem(5000, 5000), null);
  assert.match(coverAmountProblem(5001, 5000)!, /more than/);
  assert.match(coverAmountProblem(0, 5000)!, /at least/);
  assert.match(coverAmountProblem(-100, 5000)!, /at least/);
  assert.match(coverAmountProblem(10.5, 5000)!, /dollars and cents/);
  assert.match(coverAmountProblem(100, 0)!, /already paid/);
  assert.equal(coverAmountProblem(2_000_000_000, 2_000_000_000), null);
});

test("no plan: the whole balance is due", () => {
  assert.deepEqual(invoicePayRange({ totalCents: 9000, paidCents: 2000, installments: [] }), { minCents: 7000, maxCents: 7000, nextInstallment: null });
});

test("a plan: pay the next installment, or anything up to the balance", () => {
  const r = invoicePayRange({ totalCents: 15000, paidCents: 5000, installments: plan });
  assert.equal(r.minCents, 5000);
  assert.equal(r.maxCents, 10000);
  assert.equal(r.nextInstallment?.installmentNumber, 1);
});

test("a part-paid installment asks only for the rest of it", () => {
  const r = invoicePayRange({ totalCents: 15000, paidCents: 7000, installments: plan });
  assert.equal(r.minCents, 3000);
  assert.equal(r.nextInstallment?.installmentNumber, 1);
});

test("a late fee beyond a covered plan is the balance; a paid invoice has nothing to pay", () => {
  assert.deepEqual(invoicePayRange({ totalCents: 17500, paidCents: 15000, installments: plan }), { minCents: 2500, maxCents: 2500, nextInstallment: null });
  assert.deepEqual(invoicePayRange({ totalCents: 15000, paidCents: 15000, installments: plan }), { minCents: 0, maxCents: 0, nextInstallment: null });
});

test("cancelled installments are skipped", () => {
  const r = invoicePayRange({ totalCents: 10000, paidCents: 5000, installments: [plan[0]!, { ...plan[1]!, status: "cancelled" }, plan[2]!] });
  assert.equal(r.nextInstallment?.installmentNumber, 2);
  assert.equal(r.minCents, 5000);
});

test("a discount line takes its amount off the charges", () => {
  const t = invoiceLineTotals([{ kind: "registration_fee", unitAmountCents: 10000 }, { kind: "discount", unitAmountCents: 1000 }]);
  assert.deepEqual(t, { ok: true, chargesCents: 10000, discountCents: 1000, totalCents: 9000 });
  assert.deepEqual(invoiceLineTotals([{ kind: "jersey", unitAmountCents: 2500, quantity: 2 }]), { ok: true, chargesCents: 5000, discountCents: 0, totalCents: 5000 });
});

test("a total can reach zero but never go below it", () => {
  assert.deepEqual(invoiceLineTotals([{ kind: "other", unitAmountCents: 1000 }, { kind: "discount", unitAmountCents: 1000 }]), { ok: true, chargesCents: 1000, discountCents: 1000, totalCents: 0 });
  assert.equal(invoiceLineTotals([{ kind: "other", unitAmountCents: 1000 }, { kind: "discount", unitAmountCents: 1001 }]).ok, false);
  assert.equal(invoiceLineTotals([{ kind: "discount", unitAmountCents: 1 }]).ok, false);
});

test("discount lines are stored negative so lines add up to the total", () => {
  assert.equal(signedLineAmount("discount", 1000), -1000);
  assert.equal(signedLineAmount("discount", -1000), -1000);
  assert.equal(signedLineAmount("jersey", 1000), 1000);
});

test("an invoice is titled by what it is for", () => {
  assert.equal(invoiceTitle({ invoiceType: "standard", metadata: { kind: "store_order" }, lines: [{ kind: "store_item", description: "Jersey (L)" }] }), "Team store order");
  assert.equal(invoiceTitle({ invoiceType: "sub_invoice", lines: [{ kind: "registration_fee", description: "INV-1: your share" }] }), "Team dues share");
  assert.equal(invoiceTitle({ invoiceType: "team_dues" }), "Team dues");
  assert.equal(invoiceTitle({ invoiceType: "standard", registrationId: "r1", lines: [{ kind: "registration_fee", description: "Adult" }] }), "Registration");
  assert.equal(invoiceTitle({ invoiceType: "standard", lines: [{ kind: "jersey", description: "Away jersey" }, { kind: "late_fee", description: "Late fee" }] }), "Away jersey");
  assert.equal(invoiceTitle({ invoiceType: "standard", lines: [{ kind: "jersey", description: "Away jersey" }, { kind: "other", description: "Socks" }] }), "Away jersey and 1 more");
  assert.equal(invoiceTitle({ invoiceType: "standard" }), "Invoice");
  assert.equal(invoiceLineLabel({ kind: "late_fee", description: "" }), "Late fee");
  assert.equal(invoiceLineLabel({ kind: "jersey", description: "Home jersey" }), "Home jersey");
});

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
