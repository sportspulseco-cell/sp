-- Reference row for USA Hockey, the governing body the kernel already
-- validates IDs for (packages/kernel/src/governing-body-ids.ts). Without
-- it, a player's "USA Hockey ID" submit on /compliance returned 404
-- "Unknown governing body code" (COMP-2; table was empty on staging and
-- production, 2026-10-23).
--
-- Additive + idempotent. Do NOT auto-apply to production from CI.

INSERT INTO public.governing_bodies (code, name, sport_code, country_code, scope, rules_url)
VALUES ('USA_HOCKEY', 'USA Hockey', 'HOCKEY_ICE', 'US', 'national', 'https://www.usahockey.com')
ON CONFLICT (code) DO NOTHING;
