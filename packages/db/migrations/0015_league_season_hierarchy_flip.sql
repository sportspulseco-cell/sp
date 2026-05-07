-- 0015_league_season_hierarchy_flip.sql
--
-- Flips the league/season relationship per repo owner directive
-- 2026-05-09:
--   Old:  Org → Season → League → Division → Team
--   New:  Org → League → Season → Division → Team
--
-- Conceptually, "league" (e.g. PPHL — Power Play Hockey League) is
-- the persistent container; "season" (e.g. PPHL Spring 2026) is a
-- time-windowed instance of the league.
--
-- Strategy
-- 1. ADD new FK columns nullable so the table is still queryable
--    mid-migration.
-- 2. Backfill:
--    a. For every org that has seasons, ensure at least one league
--       exists (create a "Main League" if none).
--    b. seasons.league_id ← that org's first league (best effort —
--       see note on multi-league orgs below).
--    c. divisions.season_id ← derived through the OLD chain
--       (divisions.league_id → leagues_old.season_id).
--    d. leagues.org_id ← orgs they belonged to via their old season.
-- 3. NOT NULL the new FK columns.
-- 4. DROP the old columns (leagues.season_id, divisions.league_id).
--    seasons.org_id is RETAINED as a denormalised convenience column
--    (matches league.org_id; kept in sync by trigger below).
--
-- This is destructive only in that the OLD "leagues" rows previously
-- representing sub-containers of seasons are re-parented to the org.
-- For pre-launch dev data this is acceptable; production migrations
-- should run a manual data-mapping pass before applying this.

-- Idempotent guard — bail if already applied.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'seasons' AND column_name = 'league_id'
  ) THEN
    RAISE NOTICE 'Migration 0015 already applied — skipping.';
    RETURN;
  END IF;

  -- ---------- 1. Add new FK columns (nullable) ----------
  ALTER TABLE leagues  ADD COLUMN org_id    uuid REFERENCES orgs(id)    ON DELETE CASCADE;
  ALTER TABLE seasons  ADD COLUMN league_id uuid REFERENCES leagues(id) ON DELETE CASCADE;
  ALTER TABLE divisions ADD COLUMN season_id uuid REFERENCES seasons(id) ON DELETE CASCADE;

  -- ---------- 2a. leagues.org_id from the OLD chain ----------
  UPDATE leagues l
     SET org_id = s.org_id
    FROM seasons s
   WHERE l.season_id = s.id
     AND l.org_id IS NULL;

  -- ---------- 2b. Ensure each org has at least one league ----------
  -- For orgs that have seasons but no legacy league rows pointing at
  -- those seasons, create a default "Main League".
  INSERT INTO leagues (org_id, sport_code, name, format, status)
  SELECT DISTINCT s.org_id, s.sport_code, 'Main League', 'regular', 'active'
    FROM seasons s
   WHERE NOT EXISTS (
     SELECT 1 FROM leagues l WHERE l.org_id = s.org_id
   );

  -- ---------- 2c. seasons.league_id ← any league of the same org ----------
  -- For pre-launch data this is fine. Multi-league orgs will need a
  -- manual mapping pass before this migration runs in prod.
  UPDATE seasons s
     SET league_id = (
       SELECT l.id FROM leagues l
        WHERE l.org_id = s.org_id
        ORDER BY l.created_at
        LIMIT 1
     )
   WHERE s.league_id IS NULL;

  -- ---------- 2d. divisions.season_id from the OLD chain ----------
  -- division.league_id (old) → leagues.season_id (old) = the season
  -- the division logically belongs to under the new model.
  UPDATE divisions d
     SET season_id = l.season_id
    FROM leagues l
   WHERE d.league_id = l.id
     AND d.season_id IS NULL;

  -- ---------- 3. Make FK columns NOT NULL ----------
  ALTER TABLE leagues   ALTER COLUMN org_id    SET NOT NULL;
  ALTER TABLE seasons   ALTER COLUMN league_id SET NOT NULL;
  ALTER TABLE divisions ALTER COLUMN season_id SET NOT NULL;

  -- ---------- 4. Drop old columns ----------
  -- Drop the old indexes first so the column drops don't trip on them.
  DROP INDEX IF EXISTS league_season_idx;
  DROP INDEX IF EXISTS division_league_idx;
  ALTER TABLE leagues   DROP COLUMN IF EXISTS season_id;
  ALTER TABLE divisions DROP COLUMN IF EXISTS league_id;

  -- New indexes to match the new FKs.
  CREATE INDEX IF NOT EXISTS league_org_idx     ON leagues   (org_id);
  CREATE INDEX IF NOT EXISTS season_league_idx  ON seasons   (league_id);
  CREATE INDEX IF NOT EXISTS division_season_idx ON divisions (season_id);

  -- Status-set tightening on leagues — old constraint allowed
  -- season-style values (registration_open, in_progress, playoffs,
  -- completed). League-level status only needs draft/active/archived;
  -- season-level statuses stay on seasons.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'league_status_check'
      AND conrelid = 'leagues'::regclass
  ) THEN
    ALTER TABLE leagues DROP CONSTRAINT league_status_check;
  END IF;
  ALTER TABLE leagues
    ADD CONSTRAINT league_status_check
    CHECK (status IN ('draft','active','archived'));

  -- Trigger to keep seasons.org_id in lockstep with league.org_id.
  -- Inserts: NEW.org_id := (SELECT org_id FROM leagues WHERE id = NEW.league_id)
  -- Updates of league_id propagate. updates of org_id directly are
  -- still allowed (registration writes the denormalised value), but
  -- mismatches with league.org_id get rewritten back.
  CREATE OR REPLACE FUNCTION seasons_sync_org_id() RETURNS trigger AS $sync$
  DECLARE
    v_org uuid;
  BEGIN
    SELECT org_id INTO v_org FROM leagues WHERE id = NEW.league_id;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'season.league_id % has no matching league', NEW.league_id;
    END IF;
    NEW.org_id := v_org;
    RETURN NEW;
  END;
  $sync$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS seasons_sync_org_id_trg ON seasons;
  CREATE TRIGGER seasons_sync_org_id_trg
    BEFORE INSERT OR UPDATE OF league_id, org_id ON seasons
    FOR EACH ROW EXECUTE FUNCTION seasons_sync_org_id();
END $$;
