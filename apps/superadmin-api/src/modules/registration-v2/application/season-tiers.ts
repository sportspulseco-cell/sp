import { asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { tierDivisionIds } from "@sportspulse/kernel";

type TierRow = typeof schema.pricingTiers.$inferSelect;

export type SeasonTier = TierRow & {
  /** Divisions the tier is offered to; empty means the whole season (REG-18). */
  divisionIds: string[];
};

/**
 * Tiers with the divisions each is offered to, read from the Divisions
 * grid (pricing_tier_divisions) with the tier's own division as the
 * fallback for tiers saved before the grid. One rule for the admin tier
 * list, the funnel context, the submission and payment checks, and the
 * captain's team registration.
 */
export async function withTierDivisions(db: Database, tiers: TierRow[]): Promise<SeasonTier[]> {
  if (tiers.length === 0) return [];
  const grid = await db
    .select({
      tierId: schema.pricingTierDivisions.pricingTierId,
      divisionId: schema.pricingTierDivisions.divisionId
    })
    .from(schema.pricingTierDivisions)
    .where(inArray(schema.pricingTierDivisions.pricingTierId, tiers.map((t) => t.id)));
  return tiers.map((t) => ({
    ...t,
    divisionIds: tierDivisionIds(
      grid.filter((g) => g.tierId === t.id).map((g) => g.divisionId),
      t.divisionId
    )
  }));
}

/** A season's tiers, cheapest first, with their divisions. */
export async function loadSeasonTiers(db: Database, seasonId: string): Promise<SeasonTier[]> {
  const tiers = await db
    .select()
    .from(schema.pricingTiers)
    .where(eq(schema.pricingTiers.seasonId, seasonId))
    .orderBy(asc(schema.pricingTiers.fullPriceCents));
  return withTierDivisions(db, tiers);
}
