-- Add season_id to games for fast scheduler-scoped queries.
-- Scheduler Edge Functions (generate, publish, conflicts-list, fairness-
-- report, conflict-apply, conflict-resolve, parity-window-apply, bracket-
-- generate, bracket-advance, tournament-round-init, tournament-round-
-- advance) all filter by (season_id, division_id) or just season_id;
-- without this column they have to JOIN through divisions. Denormalising
-- the season pointer onto games is cheap (one uuid per row), avoids the
-- JOIN, and matches how the rest of the schema thinks about games.

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS season_id uuid
  REFERENCES seasons(id) ON DELETE CASCADE;

-- Backfill: every existing game inherits its division's season.
UPDATE games g
SET season_id = d.season_id
FROM divisions d
WHERE g.division_id = d.id
  AND g.season_id IS NULL;

CREATE INDEX IF NOT EXISTS game_season_idx ON games(season_id);
CREATE INDEX IF NOT EXISTS game_season_division_idx ON games(season_id, division_id);
