-- 0022_roster_mgmt_sprint5.sql
-- Workflow 7B · Sprint 5 — Roster management cases 1–5.
--
-- 1. team_invites.extension_count + 'extended' status — captains can
--    resend an invite up to twice per season (Case 3).
-- 2. game_attendance.is_guest + guest_home_team_id — Case 7 needs a
--    way to mark a player's appearance as a guest without writing
--    to team_memberships.
-- 3. roster_moves.move_type — extend the CHECK to allow the new
--    move types Sprint 5/6 introduce: guest_add, guest_remove,
--    captain_assign, captain_revoke.
-- 4. refund_assessments — drop refund flow (Case 4): when a paid
--    player is dropped, an admin must decide refund amount.

BEGIN;

-- ---------------------------------------------------------------
-- 1. team_invites — extension counter + 'extended' status
-- ---------------------------------------------------------------
ALTER TABLE team_invites
  ADD COLUMN IF NOT EXISTS extension_count integer NOT NULL DEFAULT 0;

ALTER TABLE team_invites
  DROP CONSTRAINT IF EXISTS team_invite_status_check;
ALTER TABLE team_invites
  ADD CONSTRAINT team_invite_status_check CHECK (
    status IN ('pending','accepted','declined','expired','revoked','extended')
  );

CREATE INDEX IF NOT EXISTS team_invite_status_idx
  ON team_invites(status);

-- ---------------------------------------------------------------
-- 2. game_attendance — guest flag + home team (Case 7)
-- ---------------------------------------------------------------
ALTER TABLE game_attendance
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guest_home_team_id uuid NULL
    REFERENCES teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS attendance_guest_idx
  ON game_attendance(team_id, is_guest)
  WHERE is_guest = true;

-- ---------------------------------------------------------------
-- 3. roster_moves — allow guest_* and captain_* move types
-- ---------------------------------------------------------------
ALTER TABLE roster_moves
  DROP CONSTRAINT IF EXISTS roster_move_type_check;
ALTER TABLE roster_moves
  ADD CONSTRAINT roster_move_type_check CHECK (
    move_type IN (
      'add','drop','trade_in','trade_out',
      'call_up','send_down','release','reinstate',
      'guest_add','guest_remove',
      'captain_assign','captain_revoke'
    )
  );

-- ---------------------------------------------------------------
-- 4. refund_assessments — admin review queue for drop refunds
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refund_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  -- The roster_moves row (drop / trade_out / division_rejected etc)
  -- that produced this assessment. Audit trail link.
  source_move_id uuid NULL REFERENCES roster_moves(id) ON DELETE SET NULL,
  source_event text NOT NULL DEFAULT 'drop',
  -- The invoice this assessment is against (a sub-invoice in 99%
  -- of cases). Null when no invoice ever existed.
  invoice_id uuid NULL REFERENCES invoices(id) ON DELETE SET NULL,
  paid_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  -- pending | resolved_refund | resolved_no_refund | void
  status text NOT NULL DEFAULT 'pending',
  decision_notes text NULL,
  refund_amount_cents integer NOT NULL DEFAULT 0,
  resolved_at timestamptz NULL,
  resolved_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE refund_assessments
    ADD CONSTRAINT refund_assessment_status_check CHECK (
      status IN ('pending','resolved_refund','resolved_no_refund','void')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE refund_assessments
    ADD CONSTRAINT refund_assessment_source_check CHECK (
      source_event IN ('drop','transfer','division_rejected','admin_action')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS refund_assessments_status_idx
  ON refund_assessments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS refund_assessments_team_idx
  ON refund_assessments(team_id, season_id);
CREATE INDEX IF NOT EXISTS refund_assessments_org_idx
  ON refund_assessments(org_id, status);

COMMIT;
