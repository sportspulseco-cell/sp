/**
 * Which divisions a registration price is for (REG-18). The Divisions
 * grid (pricing_tier_divisions) is the one place an admin sets it. A tier
 * saved before the grid existed keeps its single pricing_tiers.division_id.
 * A tier for no division is the season-wide price. The player funnel, the
 * submission and payment checks, and captain team registration all use
 * these rules, so a player cannot pick another division's price.
 */

/** The divisions a tier is offered to; empty means every division. */
export function tierDivisionIds(gridDivisionIds: readonly string[], legacyDivisionId: string | null): string[] {
  if (gridDivisionIds.length > 0) return [...new Set(gridDivisionIds)];
  return legacyDivisionId ? [legacyDivisionId] : [];
}

/** A season-wide tier fits any registration; a division tier fits only its divisions. */
export function tierOffersDivision(divisionIds: readonly string[], divisionId: string | null): boolean {
  if (divisionIds.length === 0) return true;
  return divisionId !== null && divisionIds.includes(divisionId);
}

export interface TierForDivision {
  id: string;
  isActive: boolean;
  divisionIds: readonly string[];
}

/** The active tiers a registration in this division may pick. */
export function tiersForDivision<T extends TierForDivision>(tiers: readonly T[], divisionId: string | null): T[] {
  return tiers.filter((t) => t.isActive && tierOffersDivision(t.divisionIds, divisionId));
}

/**
 * The one price for a team entering a division: a tier set for that
 * division first, else the season-wide tier, else none.
 */
export function teamTierForDivision<T extends TierForDivision>(tiers: readonly T[], divisionId: string): T | null {
  const active = tiers.filter((t) => t.isActive);
  return active.find((t) => t.divisionIds.includes(divisionId)) ?? active.find((t) => t.divisionIds.length === 0) ?? null;
}

/**
 * Who a price is for (F-2). A team fee and a player fee in the same
 * season must never be swapped: a captain registering a team sees only
 * team prices, a player only player prices. `any` is every path; prices
 * saved before audiences existed are `any`, so nothing changes for them.
 */
export const PRICE_AUDIENCES = ["any", "team", "player", "free_agent"] as const;
export type PriceAudience = (typeof PRICE_AUDIENCES)[number];

export const PRICE_AUDIENCE_LABELS: Record<PriceAudience, string> = {
  any: "Anyone",
  team: "Team registration",
  player: "Player registration",
  free_agent: "Free agent registration"
};

export function isPriceAudience(v: unknown): v is PriceAudience {
  return typeof v === "string" && (PRICE_AUDIENCES as readonly string[]).includes(v);
}

/**
 * The audience a registration path pays as. A captain invite is a
 * player joining a team. An unknown path is read as a player.
 */
export function priceAudienceFor(submissionType: string | null | undefined): Exclude<PriceAudience, "any"> {
  if (submissionType === "team") return "team";
  if (submissionType === "free_agent") return "free_agent";
  return "player";
}

/** Whether a price with this audience may be picked on this path. */
export function tierOffersPath(audience: string | null | undefined, submissionType: string | null | undefined): boolean {
  const a = isPriceAudience(audience) ? audience : "any";
  return a === "any" || a === priceAudienceFor(submissionType);
}

/** The sentence for a price picked on the wrong path. */
export function tierPathRefusal(audience: string | null | undefined, submissionType: string | null | undefined): string {
  const a = isPriceAudience(audience) ? audience : "any";
  const path = priceAudienceFor(submissionType);
  const said = { team: "a team registration", player: "a player registration", free_agent: "a free agent registration", any: "any registration" };
  return `That price is for ${said[a]}, and this is ${said[path]}. Pick one of the prices shown.`;
}

export interface TierForPath extends TierForDivision {
  audience?: string | null;
}

/** The active tiers a registration on this path, in this division, may pick. */
export function tiersForPath<T extends TierForPath>(
  tiers: readonly T[],
  divisionId: string | null,
  submissionType: string | null | undefined
): T[] {
  return tiersForDivision(tiers, divisionId).filter((t) => tierOffersPath(t.audience, submissionType));
}

/**
 * The one price for a team entering a division: a team (or any) price
 * set for that division first, else the season-wide one, else none.
 */
export function teamTierForPath<T extends TierForPath>(tiers: readonly T[], divisionId: string): T | null {
  return teamTierForDivision(tiers.filter((t) => tierOffersPath(t.audience, "team")), divisionId);
}

/** One charge in a payment plan. Number 0 is the deposit, due today. */
export interface PlanInstallment {
  installmentNumber: number;
  amountCents: number;
  dueInDays: number;
}

/**
 * A payment plan for one invoice: the deposit today, then the rest in
 * equal installments at the interval, the last one taking the rounding
 * so the plan adds up to the total exactly. The funnel shows these
 * amounts; the registration pay step and captain team registration write
 * them to installment_schedules; the daily installment job charges each
 * one when it falls due. With no installments the whole total is due
 * today. Every amount is zero or more.
 */
export function planInstallments(
  totalCents: number,
  depositCents: number,
  installmentCount: number,
  intervalDays: number
): PlanInstallment[] {
  const total = Math.max(0, Math.round(totalCents));
  const count = Math.max(0, Math.floor(installmentCount));
  if (count === 0) return [{ installmentNumber: 0, amountCents: total, dueInDays: 0 }];
  const deposit = Math.min(total, Math.max(0, Math.round(depositCents)));
  const rest = total - deposit;
  const each = Math.floor(rest / count);
  const plan: PlanInstallment[] = [{ installmentNumber: 0, amountCents: deposit, dueInDays: 0 }];
  for (let n = 1; n <= count; n++) {
    plan.push({ installmentNumber: n, amountCents: n === count ? rest - each * (count - 1) : each, dueInDays: intervalDays * n });
  }
  return plan;
}

/** Whether a tier offers a payment plan the pay step can honour. */
export function tierOffersPlan(tier: { paymentPlanEnabled: boolean; installmentCount: number; fullPriceCents: number }): boolean {
  return tier.paymentPlanEnabled && tier.installmentCount > 0 && tier.fullPriceCents > 0;
}

export interface PlanRow {
  installmentNumber: number;
  amountCents: number;
  status: string;
}

/**
 * The open installments an invoice's paid amount now covers, earliest
 * first. Paid installments count against the paid amount; cancelled ones
 * are skipped. After a payer pays by hand, these are marked paid, so the
 * plan on screen matches the money and the card job never charges them.
 */
export function coveredInstallments<T extends PlanRow>(rows: readonly T[], paidCents: number): T[] {
  let left = paidCents;
  const covered: T[] = [];
  for (const r of [...rows].sort((a, b) => a.installmentNumber - b.installmentNumber)) {
    if (r.status === "cancelled") continue;
    if (left < r.amountCents) break;
    left -= r.amountCents;
    if (r.status !== "succeeded") covered.push(r);
  }
  return covered;
}

/** Whether a price with a usage limit has no seat left. */
export function tierIsFull(tier: { usageLimit: number | null; usageCount: number }): boolean {
  return tier.usageLimit !== null && tier.usageLimit > 0 && tier.usageCount >= tier.usageLimit;
}
