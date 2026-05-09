-- 0018_registration_setup.sql
--
-- Backs the 6-section "Registration setup" wizard at /forms/[id]:
--   1) registration_forms.season_id  — tie a form to its season
--   2) registration_forms.scope CHECK — admit 'season' alongside the
--      existing org/league/division values
--   3) pricing_tier_divisions       — N:M between pricing_tiers and
--      divisions (mockup checkbox grid)
--
-- Everything is additive + idempotent. Existing rows keep working
-- because:
--   - season_id is nullable
--   - the new CHECK constraint is a strict superset of the old one
--   - the N:M join table doesn't replace pricingTiers.divisionId
--     (which stays as the back-compat 1:1 pointer until callers migrate)

-- =====================================================================
-- registration_forms.season_id (nullable)
-- =====================================================================
ALTER TABLE "registration_forms"
  ADD COLUMN IF NOT EXISTS "season_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "registration_forms"
    ADD CONSTRAINT "registration_forms_season_id_seasons_id_fk"
    FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_season_idx" ON "registration_forms" USING btree ("season_id");

-- =====================================================================
-- registration_forms.scope CHECK — admit 'season'
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'form_scope_check'
      AND conrelid = 'public.registration_forms'::regclass
  ) THEN
    ALTER TABLE "registration_forms" DROP CONSTRAINT "form_scope_check";
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "registration_forms"
  ADD CONSTRAINT "form_scope_check"
  CHECK ("scope" IN ('org','league','division','season'));

-- =====================================================================
-- pricing_tier_divisions — N:M
-- =====================================================================
CREATE TABLE IF NOT EXISTS "pricing_tier_divisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pricing_tier_id" uuid NOT NULL,
  "division_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pricing_tier_divisions"
    ADD CONSTRAINT "pricing_tier_divisions_pricing_tier_id_pricing_tiers_id_fk"
    FOREIGN KEY ("pricing_tier_id") REFERENCES "public"."pricing_tiers"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pricing_tier_divisions"
    ADD CONSTRAINT "pricing_tier_divisions_division_id_divisions_id_fk"
    FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ptd_tier_division_uniq"
  ON "pricing_tier_divisions" USING btree ("pricing_tier_id","division_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ptd_tier_idx"
  ON "pricing_tier_divisions" USING btree ("pricing_tier_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ptd_division_idx"
  ON "pricing_tier_divisions" USING btree ("division_id");
