-- 0023_roster_mgmt_sprint6.sql
-- Workflow 7B · Sprint 6 — Roster management cases 6, 8, 9, 10.
--
-- 1. transfer_requests — three-actor state machine (source captain →
--    destination captain → admin). Separate table from roster_moves
--    because the request lifecycle has its own status field that
--    mutates (pending → pending_admin → approved/rejected), while
--    roster_moves stays append-only and only gains new rows when the
--    transfer is actually approved + executed.

BEGIN;

CREATE TABLE IF NOT EXISTS transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  from_team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  to_team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  -- pending_destination | pending_admin | approved | rejected | cancelled
  status text NOT NULL DEFAULT 'pending_destination',
  reason text NULL,
  -- Audit trail of each actor that touched the row.
  initiated_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  accepted_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz NULL,
  approved_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz NULL,
  rejected_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at timestamptz NULL,
  rejection_reason text NULL,
  -- The new sub-invoice issued on destination side at approval time.
  destination_invoice_id uuid NULL REFERENCES invoices(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE transfer_requests
    ADD CONSTRAINT transfer_request_status_check CHECK (
      status IN ('pending_destination','pending_admin','approved','rejected','cancelled')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE transfer_requests
    ADD CONSTRAINT transfer_request_different_teams CHECK (
      from_team_id <> to_team_id
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS transfer_requests_status_idx
  ON transfer_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS transfer_requests_org_idx
  ON transfer_requests(org_id, status);
CREATE INDEX IF NOT EXISTS transfer_requests_person_idx
  ON transfer_requests(person_id, season_id);
CREATE INDEX IF NOT EXISTS transfer_requests_to_team_idx
  ON transfer_requests(to_team_id, status);
CREATE INDEX IF NOT EXISTS transfer_requests_from_team_idx
  ON transfer_requests(from_team_id, status);

-- A single player should not have two open transfers in the same season
-- (one of them must resolve first). Partial unique covers only the
-- in-flight statuses.
CREATE UNIQUE INDEX IF NOT EXISTS transfer_requests_open_uniq
  ON transfer_requests(person_id, season_id)
  WHERE status IN ('pending_destination','pending_admin');

COMMIT;
