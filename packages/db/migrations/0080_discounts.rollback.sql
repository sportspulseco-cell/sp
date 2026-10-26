-- 0080_discounts.rollback.sql (never auto-applied)
-- Drops the discount tables. Invoices already written keep their
-- discount lines and totals; only the code list, the use log and the
-- family pricing settings are lost.
DROP TABLE IF EXISTS "discount_code_redemptions";
DROP TABLE IF EXISTS "discount_codes";
DROP TABLE IF EXISTS "season_family_pricing";
