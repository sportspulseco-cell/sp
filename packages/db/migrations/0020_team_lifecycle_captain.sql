-- 0020_team_lifecycle_captain.sql
-- Workflow 7A · Team Creation & Season Registration Rollover (Sprint 1)
--
-- Adds the two captain/rollover columns to `teams` and the four
-- rollover/billing columns to `division_team_entries`. All additive
-- (CREATE INDEX IF NOT EXISTS · ADD COLUMN IF NOT EXISTS · DROP/RECREATE
-- of the check constraint guarded by name lookups), safe to re-run.
--
-- Architecture rule (ARCH 1): `teams` is the persistent, org-level
-- entity. It has NO leagueId/seasonId/divisionId — those columns are
-- explicitly NOT added here. Seasonal participation lives on
-- `division_team_entries`.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. teams · captain + confirmation threshold
-- ---------------------------------------------------------------------

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS captain_user_id uuid NULL
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmation_threshold_cents integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS teams_captain_user_id_idx
  ON teams(captain_user_id)
  WHERE captain_user_id IS NOT NULL;

-- Case-insensitive uniqueness per org. Prevents two teams in the same
-- org from sharing a name. UI converts collisions into a 422 with the
-- existing team's id so admins can navigate to it instead.
CREATE UNIQUE INDEX IF NOT EXISTS teams_org_name_lower_uniq
  ON teams(org_id, lower(name))
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 2. division_team_entries · billing snapshot + roster snapshot
-- ---------------------------------------------------------------------

ALTER TABLE division_team_entries
  ADD COLUMN IF NOT EXISTS invoice_id uuid NULL
    REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmation_threshold_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collected_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS roster_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Allow the workflow-7A status values alongside the existing ones.
-- Old: applied · accepted · withdrawn · disqualified
-- New: + confirmed (deposits cleared the threshold)
--      + rejected  (league admin declined the entry)
ALTER TABLE division_team_entries
  DROP CONSTRAINT IF EXISTS dte_entry_status_check;
ALTER TABLE division_team_entries
  ADD CONSTRAINT dte_entry_status_check CHECK (
    entry_status IN (
      'applied', 'accepted', 'confirmed',
      'withdrawn', 'disqualified', 'rejected'
    )
  );

-- Replace the unconditional unique (team_id, division_id) with a
-- partial one — a withdrawn or rejected entry should NOT block a
-- later re-apply. The DDL is idempotent: drop-if-exists then create.
DROP INDEX IF EXISTS dte_division_team_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS dte_team_division_active_uniq
  ON division_team_entries(team_id, division_id)
  WHERE entry_status NOT IN ('withdrawn', 'rejected', 'disqualified');

CREATE INDEX IF NOT EXISTS dte_invoice_idx
  ON division_team_entries(invoice_id)
  WHERE invoice_id IS NOT NULL;

COMMIT;
