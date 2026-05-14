-- P0-1 — team_join_requests.season_id must be NOT NULL.
--
-- Why: the captain-decide handler inserts a team_memberships row on
-- approve, and team_memberships.season_id is NOT NULL → with a null
-- season the insert crashed inside the transaction. The unique-pending
-- index also treated null season as "always distinct", so duplicate
-- applications slipped through.
--
-- The table has zero rows at the time of writing (verified
-- 2026-05-15), so no backfill clause is needed. The ALTER tightens
-- the FK behaviour from `set null` to `restrict` to match — a
-- season cannot be deleted while pending requests reference it.
--
-- Idempotent: every step uses DO blocks so reruns are no-ops.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'team_join_requests'
      AND column_name = 'season_id'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE team_join_requests
      ALTER COLUMN season_id SET NOT NULL;
  END IF;
END $$;

-- Re-point the FK to `restrict` so a referenced season can't vanish
-- while pending requests still reference it. Drop+recreate is the
-- only way Postgres lets you change ON DELETE behaviour.
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT tc.constraint_name
    INTO fk_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
   WHERE tc.table_name = 'team_join_requests'
     AND tc.constraint_type = 'FOREIGN KEY'
     AND ccu.table_name = 'seasons'
   LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE team_join_requests DROP CONSTRAINT %I',
      fk_name
    );
  END IF;

  ALTER TABLE team_join_requests
    ADD CONSTRAINT team_join_requests_season_id_fkey
    FOREIGN KEY (season_id)
    REFERENCES seasons (id)
    ON DELETE RESTRICT;
END $$;
