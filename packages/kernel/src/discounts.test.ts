import { test } from "node:test";
import assert from "node:assert/strict";
import {
  discountAmountCents,
  discountCodeRefusal,
  discountCodeTextProblem,
  discountRuleLabel,
  discountRuleProblem,
  familyCapCents,
  familyPricingProblem,
  MAX_DISCOUNT_CENTS,
  normalizeDiscountCode,
  priceRegistration,
  type DiscountCodeTerms,
  type FamilyPricingRule
} from "./discounts";
import { invoiceLineTotals } from "./invoice-terms";

const pct = (bp: number) => ({ kind: "percent" as const, percentBasisPoints: bp });
const fixed = (c: number) => ({ kind: "fixed" as const, amountCents: c });

test("rule problems: zero, negative, over 100%, huge, non-integer", () => {
  assert.equal(discountRuleProblem(pct(1000)), null);
  assert.equal(discountRuleProblem(pct(10_000)), null);
  assert.match(discountRuleProblem(pct(0))!, /more than 0/);
  assert.match(discountRuleProblem(pct(-5))!, /more than 0/);
  assert.match(discountRuleProblem(pct(10_001))!, /100%/);
  assert.match(discountRuleProblem(pct(12.5))!, /percent/);
  assert.equal(discountRuleProblem(fixed(1)), null);
  assert.match(discountRuleProblem(fixed(0))!, /more than/);
  assert.match(discountRuleProblem(fixed(-100))!, /more than/);
  assert.match(discountRuleProblem(fixed(MAX_DISCOUNT_CENTS + 1))!, /too large/);
  assert.match(discountRuleProblem({ kind: "fixed", amountCents: null })!, /amount/);
});

test("amount off: percent rounds to the cent, never above the price, never negative", () => {
  assert.equal(discountAmountCents(pct(1000), 15000), 1500);
  assert.equal(discountAmountCents(pct(10_000), 15000), 15000, "100% is the whole price");
  assert.equal(discountAmountCents(pct(1250), 999), 125, "12.5% of $9.99 = 124.875 -> 125");
  assert.equal(discountAmountCents(pct(5000), 1), 1, "half of one cent rounds up");
  assert.equal(discountAmountCents(pct(4900), 1), 0, "49% of one cent is nothing");
  assert.equal(discountAmountCents(fixed(1), 1), 1, "one cent off one cent");
  assert.equal(discountAmountCents(fixed(5000), 3000), 3000, "fixed above the price stops at the price");
  assert.equal(discountAmountCents(fixed(500), 0), 0, "nothing off a free price");
  assert.equal(discountAmountCents(fixed(500), -100), 0, "negative price treated as 0");
  assert.equal(discountAmountCents(fixed(-500), 1000), 0, "invalid rule takes nothing");
  assert.equal(discountAmountCents(pct(2000), 2_000_000_000), 400_000_000, "huge price stays exact");
  assert.equal(discountAmountCents(null, 1000), 0);
  assert.equal(discountAmountCents(pct(1000), Number.NaN), 0);
});

test("labels", () => {
  assert.equal(discountRuleLabel(pct(1000)), "10% off");
  assert.equal(discountRuleLabel(pct(1250)), "12.50% off");
  assert.equal(discountRuleLabel(fixed(2500)), "$25.00 off");
});

test("codes are typed without case or spaces", () => {
  assert.equal(normalizeDiscountCode(" spring10 "), "SPRING10");
  assert.equal(normalizeDiscountCode("Spring 10"), "SPRING10");
  assert.equal(normalizeDiscountCode("\tearly-bird\n"), "EARLY-BIRD");
  assert.equal(normalizeDiscountCode(null), "");
  assert.equal(discountCodeTextProblem("SPRING10"), null);
  assert.match(discountCodeTextProblem("AB")!, /at least 3/);
  assert.match(discountCodeTextProblem("A".repeat(33))!, /at most 32/);
  assert.match(discountCodeTextProblem("-ABC")!, /letters/);
  assert.match(discountCodeTextProblem("AB$C")!, /letters/);
});

const code: DiscountCodeTerms = {
  seasonId: "s1",
  isActive: true,
  validFrom: "2026-10-01",
  validTo: "2026-10-31",
  usageLimit: 2,
  usageCount: 0,
  divisionIds: [],
  pricingTierIds: []
};
const ctx = { seasonId: "s1", divisionId: "d1", pricingTierId: "t1", today: "2026-10-26" };

test("code refusals: season, active, dates (inclusive), used up, division, price", () => {
  assert.equal(discountCodeRefusal(code, ctx), null);
  assert.equal(discountCodeRefusal(code, { ...ctx, seasonId: "s2" })?.error, "code_wrong_season");
  assert.equal(discountCodeRefusal({ ...code, isActive: false }, ctx)?.error, "code_inactive");
  assert.equal(discountCodeRefusal(code, { ...ctx, today: "2026-09-30" })?.error, "code_not_started");
  assert.equal(discountCodeRefusal(code, { ...ctx, today: "2026-10-01" }), null, "first day works");
  assert.equal(discountCodeRefusal(code, { ...ctx, today: "2026-10-31" }), null, "last day works");
  assert.equal(discountCodeRefusal(code, { ...ctx, today: "2026-11-01" })?.error, "code_expired");
  assert.equal(discountCodeRefusal({ ...code, usageCount: 1 }, ctx), null, "one use left");
  assert.equal(discountCodeRefusal({ ...code, usageCount: 2 }, ctx)?.error, "code_used_up");
  assert.equal(discountCodeRefusal({ ...code, usageLimit: 0 }, ctx)?.error, "code_used_up", "limit 0 never works");
  assert.equal(discountCodeRefusal({ ...code, usageLimit: null, usageCount: 999 }, ctx), null, "no limit");
  assert.equal(discountCodeRefusal({ ...code, divisionIds: ["d2"] }, ctx)?.error, "code_wrong_division");
  assert.equal(discountCodeRefusal({ ...code, divisionIds: ["d2"] }, { ...ctx, divisionId: null })?.error, "code_wrong_division");
  assert.equal(discountCodeRefusal({ ...code, divisionIds: ["d1"] }, ctx), null);
  assert.equal(discountCodeRefusal({ ...code, pricingTierIds: ["t9"] }, ctx)?.error, "code_wrong_price");
  assert.equal(discountCodeRefusal({ ...code, validFrom: null, validTo: null }, { ...ctx, today: "2030-01-01" }), null);
});

test("family maximum: under, at, over, already over, zero, one cent", () => {
  assert.equal(familyCapCents(40000, 0, 15000), 0, "first child under the max");
  assert.equal(familyCapCents(40000, 30000, 15000), 5000, "third child crosses the max");
  assert.equal(familyCapCents(40000, 25000, 15000), 0, "exactly at the max");
  assert.equal(familyCapCents(40000, 45000, 15000), 15000, "already over: free");
  assert.equal(familyCapCents(0, 0, 15000), 15000, "max of 0: everything free");
  assert.equal(familyCapCents(null, 99999, 15000), 0, "no max");
  assert.equal(familyCapCents(40000, 39999, 2), 1, "one cent over");
  assert.equal(familyCapCents(40000, 0, 0), 0, "free registration");
  assert.equal(familyCapCents(40000, -500, 15000), 0, "negative prior treated as 0");
});

test("family rule problems", () => {
  const ok: FamilyPricingRule = { familyMaxCents: 40000, siblingDiscount: null, siblingFromNth: 2 };
  assert.equal(familyPricingProblem(ok), null);
  assert.equal(familyPricingProblem({ ...ok, familyMaxCents: null, siblingDiscount: pct(1000) }), null);
  assert.match(familyPricingProblem({ ...ok, familyMaxCents: null })!, /family maximum, a sibling discount/);
  assert.match(familyPricingProblem({ ...ok, familyMaxCents: -1 })!, /\$0.00 or more/);
  assert.match(familyPricingProblem({ ...ok, siblingFromNth: 1 })!, /2nd/);
  assert.match(familyPricingProblem({ ...ok, siblingDiscount: pct(20000) })!, /100%/);
});

const family: FamilyPricingRule = { familyMaxCents: 40000, siblingDiscount: pct(1000), siblingFromNth: 2 };

test("three children: sibling discount from the 2nd, family max caps the 3rd", () => {
  const c1 = priceRegistration({ priceCents: 15000, priceDescription: "Youth", family: { rule: family, priorRegistrations: 0, priorBilledCents: 0 } });
  assert.equal(c1.totalCents, 15000);
  assert.equal(c1.lines.length, 1);
  assert.equal(c1.familyPosition, 1);
  const c2 = priceRegistration({ priceCents: 15000, priceDescription: "Youth", family: { rule: family, priorRegistrations: 1, priorBilledCents: c1.totalCents } });
  assert.equal(c2.siblingCents, 1500);
  assert.equal(c2.totalCents, 13500);
  assert.match(c2.lines[1]!.description, /Sibling discount \(2nd player, 10% off\)/);
  const c3 = priceRegistration({ priceCents: 15000, priceDescription: "Youth", family: { rule: family, priorRegistrations: 2, priorBilledCents: c1.totalCents + c2.totalCents } });
  assert.equal(c3.siblingCents, 1500);
  assert.equal(c3.familyMaxCents, 28500 + 13500 - 40000);
  assert.equal(c1.totalCents + c2.totalCents + c3.totalCents, 40000, "the family pays exactly the max");
  assert.match(c3.lines.at(-1)!.description, /Family maximum reached \(\$400\.00 a season\)/);
});

test("code after the sibling discount; lines add up through the invoice rule", () => {
  const p = priceRegistration({
    priceCents: 20000,
    priceDescription: "Adult",
    family: { rule: { familyMaxCents: null, siblingDiscount: fixed(2000), siblingFromNth: 2 }, priorRegistrations: 1, priorBilledCents: 20000 },
    code: { code: "SPRING10", rule: pct(1000) }
  });
  assert.equal(p.siblingCents, 2000);
  assert.equal(p.codeCents, 1800, "10% of the price after the sibling discount");
  assert.equal(p.totalCents, 16200);
  const t = invoiceLineTotals(p.lines.map((l) => ({ kind: l.kind, unitAmountCents: l.amountCents })));
  assert.ok(t.ok);
  assert.equal(t.ok && t.totalCents, p.totalCents);
  assert.equal(t.ok && t.discountCents, p.discountCents);
});

test("100% code makes the registration free; a code on a free price adds no line", () => {
  const p = priceRegistration({ priceCents: 15000, priceDescription: "Adult", code: { code: "FREE", rule: pct(10_000) } });
  assert.equal(p.totalCents, 0);
  assert.equal(p.codeCents, 15000);
  const z = priceRegistration({ priceCents: 0, priceDescription: "Free", code: { code: "TEN", rule: fixed(1000) } });
  assert.equal(z.totalCents, 0);
  assert.equal(z.lines.length, 1);
});

test("no family rule, no code: the price is the total; negative and huge prices", () => {
  assert.equal(priceRegistration({ priceCents: 12345, priceDescription: "x" }).totalCents, 12345);
  assert.equal(priceRegistration({ priceCents: -100, priceDescription: "x" }).totalCents, 0);
  const huge = priceRegistration({ priceCents: MAX_DISCOUNT_CENTS, priceDescription: "x", code: { code: "C", rule: pct(3333) } });
  assert.equal(huge.codeCents, 333_300_000);
  assert.equal(huge.totalCents, MAX_DISCOUNT_CENTS - 333_300_000);
});
