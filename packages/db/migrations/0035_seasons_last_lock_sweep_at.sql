-- Backlog #20 — track when the compliance lock-sweep last ran for a
-- season so the cron-driven sweep can skip already-swept seasons.
--
-- The new pg_cron job (migration 0036) fires hourly, finds seasons
-- where roster_lock_at <= now() AND (last_lock_sweep_at IS NULL OR
-- last_lock_sweep_at < roster_lock_at), and posts to the API's
-- compliance cron endpoint with the X-Cron-Secret header.
--
-- Additive + idempotent.

DO $$
BEGIN
  ALTER TABLE seasons
    ADD COLUMN last_lock_sweep_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
