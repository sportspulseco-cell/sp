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
