-- Rollback 0090: prices lose their audience (every price offered on every path again).
ALTER TABLE "pricing_tiers" DROP CONSTRAINT IF EXISTS "pricing_tier_audience_check";
ALTER TABLE "pricing_tiers" DROP COLUMN IF EXISTS "audience";
