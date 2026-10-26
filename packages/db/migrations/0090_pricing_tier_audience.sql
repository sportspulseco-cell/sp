-- F-2 (2026-10-26 integration test): a price has an audience, so a
-- captain registering a team cannot pay the player price.
--
-- any | team | player | free_agent. Every existing price becomes `any`,
-- which every path may pick, so nothing changes until an admin sets one.
-- Additive and idempotent.

ALTER TABLE "pricing_tiers" ADD COLUMN IF NOT EXISTS "audience" text DEFAULT 'any' NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "pricing_tiers"
    ADD CONSTRAINT "pricing_tier_audience_check"
    CHECK ("pricing_tiers"."audience" IN ('any','team','player','free_agent'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
