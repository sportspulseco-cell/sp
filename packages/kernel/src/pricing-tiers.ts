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
