-- Rollback for 0052_team_movement.sql. Refuses while any entry is in
-- status 'moved' or has a movement, because dropping those would destroy
-- movement history; resolve or export them first.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM division_team_entries WHERE entry_status = 'moved' OR previous_entry_id IS NOT NULL) THEN
    RAISE EXCEPTION 'division_team_entries has moved/linked rows; export them before rolling back 0052';
  END IF;
END $$;
DROP TABLE IF EXISTS team_movements;
DROP INDEX IF EXISTS dte_previous_entry_idx;
DROP INDEX IF EXISTS dte_team_division_active_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS dte_team_division_active_uniq
  ON division_team_entries (team_id, division_id)
  WHERE entry_status NOT IN ('withdrawn', 'rejected', 'disqualified');
ALTER TABLE division_team_entries DROP CONSTRAINT IF EXISTS dte_entry_status_check;
ALTER TABLE division_team_entries
  ADD CONSTRAINT dte_entry_status_check
  CHECK (entry_status IN ('pending_approval','applied','accepted','confirmed','withdrawn','disqualified','rejected'));
ALTER TABLE division_team_entries DROP CONSTRAINT IF EXISTS dte_movement_kind_check;
ALTER TABLE division_team_entries
  DROP COLUMN IF EXISTS previous_entry_id,
  DROP COLUMN IF EXISTS movement_kind,
  DROP COLUMN IF EXISTS carry_standings,
  DROP COLUMN IF EXISTS compliance_flags;
