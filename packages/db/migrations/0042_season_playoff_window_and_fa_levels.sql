-- 2026-05-20 — Two related schema changes:
--
-- 1. seasons.playoff_start_date + seasons.playoff_end_date
--    Optional playoff window distinct from the season window. The
--    org-setup wizard validates: startDate ≤ playoffStartDate ≤
--    playoffEndDate ≤ endDate. The day before playoffStartDate is the
--    implicit "regular season finale" — no separate field.
--
-- 2. free_agent_pool_entries.level_primary check constraint widened.
--    The funnel's Player profile card now uses A / B / C1 / C2 / C3
--    (hockey spec from 2026-05-20). Older rows wrote C and D; the
--    constraint accepts both old and new values so historical pool
--    entries don't break. The funnel + player-web only emit the
--    canonical five going forward.
--
-- Additive + idempotent.

-- ---------- (1) seasons.playoff_*_date ----------

ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS playoff_start_date date,
  ADD COLUMN IF NOT EXISTS playoff_end_date date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'season_playoff_dates_check'
  ) THEN
    ALTER TABLE seasons ADD CONSTRAINT season_playoff_dates_check CHECK (
      (
        playoff_start_date IS NULL
        OR (playoff_start_date >= start_date AND playoff_start_date <= end_date)
      ) AND (
        playoff_end_date IS NULL
        OR (playoff_end_date >= start_date AND playoff_end_date <= end_date)
      ) AND (
        playoff_start_date IS NULL
        OR playoff_end_date IS NULL
        OR playoff_end_date >= playoff_start_date
      )
    );
  END IF;
END $$;

-- ---------- (2) free_agent_pool_entries.level_primary ----------

ALTER TABLE free_agent_pool_entries
  DROP CONSTRAINT IF EXISTS fa_pool_level_check;

ALTER TABLE free_agent_pool_entries
  ADD CONSTRAINT fa_pool_level_check CHECK (
    level_primary IN ('A','B','C','C1','C2','C3','D')
  );
