-- 0024_compliance_sprint7.sql
-- Workflow 7C · Sprint 7 — compliance and eligibility extensions.
--
-- 1. eligibility_records — separate waived_at + waived_by_user_id so
--    the audit shows who issued the waiver and when, distinct from
--    the generic evaluatedAt. Add 'expiring' + 'flagged' statuses
--    (USA Hockey approaching expiry / duplicate ID for admin review).
--    Add (person_id, season_id) unique index so the sweep endpoints
--    can rely on UPSERT.
--
-- 2. games — add game_type column (regular vs playoff) so the
--    attendance guard at §4.1 can enforce playoff eligibility only
--    on playoff games.

BEGIN;

-- ---------------------------------------------------------------
-- 1. eligibility_records — extend audit columns + statuses
-- ---------------------------------------------------------------
ALTER TABLE eligibility_records
  ADD COLUMN IF NOT EXISTS waived_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS waived_by_user_id uuid NULL
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE eligibility_records
  DROP CONSTRAINT IF EXISTS eligibility_status_check;
ALTER TABLE eligibility_records
  ADD CONSTRAINT eligibility_status_check CHECK (
    status IN (
      'pending',
      'eligible',
      'ineligible',
      'expiring',
      'expired',
      'flagged',
      'waived'
    )
  );

-- Idempotent upserts in sweep endpoints depend on this.
CREATE UNIQUE INDEX IF NOT EXISTS eligibility_records_person_season_uniq
  ON eligibility_records(person_id, season_id)
  WHERE season_id IS NOT NULL;

-- ---------------------------------------------------------------
-- 2. games.game_type — regular vs playoff (default regular)
-- ---------------------------------------------------------------
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS game_type text NOT NULL DEFAULT 'regular';

DO $$ BEGIN
  ALTER TABLE games
    ADD CONSTRAINT game_type_check CHECK (
      game_type IN ('regular','playoff','exhibition')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS games_game_type_idx
  ON games(game_type)
  WHERE game_type <> 'regular';

COMMIT;
