import { test } from "node:test";
import assert from "node:assert/strict";
import { teamTierForDivision, tierDivisionIds, tierOffersDivision, tiersForDivision } from "./pricing-tiers";

const A = "div-a";
const B = "div-b";

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
