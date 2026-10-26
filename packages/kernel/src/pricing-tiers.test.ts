import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coveredInstallments,
  planInstallments,
  priceAudienceFor,
  teamTierForDivision,
  teamTierForPath,
  tierIsFull,
  tierDivisionIds,
  tierOffersDivision,
  tierOffersPath,
  tierOffersPlan,
  tierPathRefusal,
  tiersForDivision,
  tiersForPath
} from "./pricing-tiers";

const A = "div-a";
const B = "div-b";

test("audience: each path pays as team, player or free agent", () => {
  assert.equal(priceAudienceFor("team"), "team");
  assert.equal(priceAudienceFor("individual"), "player");
  assert.equal(priceAudienceFor("captain_invite"), "player");
  assert.equal(priceAudienceFor("free_agent"), "free_agent");
  assert.equal(priceAudienceFor(null), "player");
});

test("audience: a team price is refused on a player path and the other way round", () => {
  assert.equal(tierOffersPath("team", "team"), true);
  assert.equal(tierOffersPath("team", "individual"), false);
  assert.equal(tierOffersPath("player", "team"), false);
  assert.equal(tierOffersPath("player", "captain_invite"), true);
  assert.equal(tierOffersPath("free_agent", "individual"), false);
  assert.equal(tierOffersPath("free_agent", "free_agent"), true);
});

test("audience: any, missing or unknown fits every path (older prices)", () => {
  for (const p of ["team", "individual", "free_agent", "captain_invite"]) {
    assert.equal(tierOffersPath("any", p), true);
    assert.equal(tierOffersPath(null, p), true);
    assert.equal(tierOffersPath("bogus", p), true);
  }
});

test("audience: the funnel list keeps only the path's prices in the division", () => {
  const tiers = [
    { id: "team", isActive: true, divisionIds: [], audience: "team" },
    { id: "player", isActive: true, divisionIds: [], audience: "player" },
    { id: "any", isActive: true, divisionIds: [], audience: "any" },
    { id: "playerB", isActive: true, divisionIds: [B], audience: "player" },
    { id: "off", isActive: false, divisionIds: [], audience: "team" }
  ];
  assert.deepEqual(tiersForPath(tiers, A, "team").map((t) => t.id), ["team", "any"]);
  assert.deepEqual(tiersForPath(tiers, A, "individual").map((t) => t.id), ["player", "any"]);
  assert.deepEqual(tiersForPath(tiers, B, "captain_invite").map((t) => t.id), ["player", "any", "playerB"]);
  assert.deepEqual(tiersForPath(tiers, A, "free_agent").map((t) => t.id), ["any"]);
  assert.equal(teamTierForPath(tiers, A)?.id, "team");
  assert.equal(teamTierForPath([tiers[1]!], A), null);
});

test("audience: the refusal names both sides", () => {
  assert.equal(
    tierPathRefusal("player", "team"),
    "That price is for a player registration, and this is a team registration. Pick one of the prices shown."
  );
});

test("the Divisions grid decides; a tier from before the grid keeps its one division", () => {
  assert.deepEqual(tierDivisionIds([A, B], A), [A, B]);
  assert.deepEqual(tierDivisionIds([], B), [B]);
  assert.deepEqual(tierDivisionIds([], null), []);
  assert.deepEqual(tierDivisionIds([A, A], null), [A]);
});

test("a season-wide tier fits every division; a division tier only its own", () => {
  assert.equal(tierOffersDivision([], A), true);
  assert.equal(tierOffersDivision([], null), true);
  assert.equal(tierOffersDivision([A], A), true);
  assert.equal(tierOffersDivision([A], B), false);
  assert.equal(tierOffersDivision([A], null), false);
});

const tiers = [
  { id: "wide", isActive: true, divisionIds: [] as string[] },
  { id: "a-only", isActive: true, divisionIds: [A] },
  { id: "b-only", isActive: true, divisionIds: [B] },
  { id: "a-off", isActive: false, divisionIds: [A] }
];

test("a player in division A sees A's tiers and the season-wide one, never B's or inactive ones", () => {
  assert.deepEqual(tiersForDivision(tiers, A).map((t) => t.id), ["wide", "a-only"]);
  assert.deepEqual(tiersForDivision(tiers, B).map((t) => t.id), ["wide", "b-only"]);
  assert.deepEqual(tiersForDivision(tiers, null).map((t) => t.id), ["wide"]);
});

test("a team entering a division pays that division's tier, else the season-wide one", () => {
  assert.equal(teamTierForDivision(tiers, A)?.id, "a-only");
  assert.equal(teamTierForDivision(tiers, "div-c")?.id, "wide");
  assert.equal(teamTierForDivision([tiers[2]!], A), null);
});

test("a payment plan is the deposit today, then equal installments; the last takes the rounding", () => {
  assert.deepEqual(planInstallments(15000, 5000, 2, 30), [
    { installmentNumber: 0, amountCents: 5000, dueInDays: 0 },
    { installmentNumber: 1, amountCents: 5000, dueInDays: 30 },
    { installmentNumber: 2, amountCents: 5000, dueInDays: 60 }
  ]);
  const odd = planInstallments(20000, 0, 3, 14);
  assert.deepEqual(odd.map((p) => p.amountCents), [0, 6666, 6666, 6668]);
  assert.deepEqual(odd.map((p) => p.dueInDays), [0, 14, 28, 42]);
});

test("every plan adds up to the total and no amount is negative", () => {
  for (const [total, deposit, count] of [[2, 0, 4], [1, 0, 2], [99999, 1, 7], [500, 900, 3], [100, -5, 2], [1, 1, 1]] as const) {
    const plan = planInstallments(total, deposit, count, 30);
    assert.equal(plan.reduce((s, p) => s + p.amountCents, 0), total, `${total}/${deposit}/${count}`);
    assert.ok(plan.every((p) => p.amountCents >= 0), `${total}/${deposit}/${count}`);
  }
});

test("with no installments the whole total is due today", () => {
  assert.deepEqual(planInstallments(12345, 5000, 0, 30), [{ installmentNumber: 0, amountCents: 12345, dueInDays: 0 }]);
});

test("a plan is offered only when enabled, with installments, on a priced tier", () => {
  assert.equal(tierOffersPlan({ paymentPlanEnabled: true, installmentCount: 3, fullPriceCents: 100 }), true);
  assert.equal(tierOffersPlan({ paymentPlanEnabled: true, installmentCount: 0, fullPriceCents: 100 }), false);
  assert.equal(tierOffersPlan({ paymentPlanEnabled: false, installmentCount: 3, fullPriceCents: 100 }), false);
  assert.equal(tierOffersPlan({ paymentPlanEnabled: true, installmentCount: 3, fullPriceCents: 0 }), false);
});

test("a payment by hand covers open installments in order; paid ones count, cancelled ones are skipped", () => {
  const rows = [
    { installmentNumber: 2, amountCents: 5000, status: "scheduled" },
    { installmentNumber: 0, amountCents: 5000, status: "succeeded" },
    { installmentNumber: 1, amountCents: 5000, status: "failed" },
    { installmentNumber: 3, amountCents: 0, status: "cancelled" }
  ];
  assert.deepEqual(coveredInstallments(rows, 5000).map((r) => r.installmentNumber), []);
  assert.deepEqual(coveredInstallments(rows, 9999).map((r) => r.installmentNumber), []);
  assert.deepEqual(coveredInstallments(rows, 10000).map((r) => r.installmentNumber), [1]);
  assert.deepEqual(coveredInstallments(rows, 15000).map((r) => r.installmentNumber), [1, 2]);
  assert.deepEqual(coveredInstallments(rows, 0), []);
});

test("a price is full only when it has a limit and every seat is taken", () => {
  assert.equal(tierIsFull({ usageLimit: null, usageCount: 999 }), false);
  assert.equal(tierIsFull({ usageLimit: 0, usageCount: 5 }), false);
  assert.equal(tierIsFull({ usageLimit: 50, usageCount: 49 }), false);
  assert.equal(tierIsFull({ usageLimit: 50, usageCount: 50 }), true);
});
