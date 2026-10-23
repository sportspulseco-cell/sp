-- Team movement (PPHL item 8): a team's season-specific instance is a
-- division_team_entries row (the master team stays in teams). Moving a
-- team across seasons, divisions, leagues or organisations creates a new
-- instance and closes the old one, so history is never rewritten.
--
-- Additive only: new nullable columns, one new status value, one new
-- audit table. Rollback: 0052_team_movement.rollback.sql.

ALTER TABLE division_team_entries
  ADD COLUMN IF NOT EXISTS previous_entry_id uuid
    REFERENCES division_team_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS movement_kind text,
  ADD COLUMN IF NOT EXISTS carry_standings boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compliance_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  ALTER TABLE division_team_entries
    ADD CONSTRAINT dte_movement_kind_check
    CHECK (movement_kind IS NULL OR movement_kind IN ('rollover','division_shift','league_migration'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 'moved': the source instance of a mid-season shift or a league
-- migration. Distinct from 'withdrawn' so reports can tell them apart.
ALTER TABLE division_team_entries DROP CONSTRAINT IF EXISTS dte_entry_status_check;
ALTER TABLE division_team_entries
  ADD CONSTRAINT dte_entry_status_check
  CHECK (entry_status IN ('pending_approval','applied','accepted','confirmed','withdrawn','disqualified','rejected','moved'));

-- A moved-out entry must not block the team from re-entering that division.
DROP INDEX IF EXISTS dte_team_division_active_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS dte_team_division_active_uniq
  ON division_team_entries (team_id, division_id)
  WHERE entry_status NOT IN ('withdrawn', 'rejected', 'disqualified', 'moved');

CREATE INDEX IF NOT EXISTS dte_previous_entry_idx ON division_team_entries (previous_entry_id);

CREATE TABLE IF NOT EXISTS team_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  kind text NOT NULL,
  from_entry_id uuid REFERENCES division_team_entries(id) ON DELETE SET NULL,
  to_entry_id uuid REFERENCES division_team_entries(id) ON DELETE SET NULL,
  from_division_id uuid REFERENCES divisions(id) ON DELETE SET NULL,
  to_division_id uuid REFERENCES divisions(id) ON DELETE SET NULL,
  from_org_id uuid REFERENCES orgs(id) ON DELETE SET NULL,
  to_org_id uuid REFERENCES orgs(id) ON DELETE SET NULL,
  reset_standings boolean,
  roster_copied integer NOT NULL DEFAULT 0,
  compliance_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  moved_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_movement_kind_check
    CHECK (kind IN ('rollover','division_shift','league_migration','org_move'))
);
CREATE UNIQUE INDEX IF NOT EXISTS team_movement_idempotency_uniq
  ON team_movements (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS team_movement_team_idx ON team_movements (team_id, created_at DESC);

ALTER TABLE team_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON team_movements FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON team_movements FROM authenticated;
