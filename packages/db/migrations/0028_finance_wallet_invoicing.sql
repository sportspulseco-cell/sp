-- 0028_finance_wallet_invoicing.sql
-- Payments & Invoicing — Phase 2 schema extensions.
-- Additive + idempotent. All IF NOT EXISTS.

BEGIN;

-- ── invoices: missing columns per spec ─────────────────────────────
-- invoice_type + parent_invoice_id already added in 0021 (no-op here).
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS wallet_credit_applied_cents integer
    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_fee_applied_cents integer
    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_scope text NULL,
  ADD COLUMN IF NOT EXISTS team_id uuid NULL
    REFERENCES teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS division_id uuid NULL
    REFERENCES divisions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS league_id uuid NULL
    REFERENCES leagues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS season_id uuid NULL
    REFERENCES seasons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bulk_job_id uuid NULL,
  ADD COLUMN IF NOT EXISTS fee_schedule_id uuid NULL
    REFERENCES fee_schedules(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE invoices
    ADD CONSTRAINT invoices_billing_scope_check CHECK (
      billing_scope IS NULL OR
      billing_scope IN ('individual','team','division','league','season','org')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── wallet_transactions (immutable; new alongside existing wallet_ledger) ──
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL
    REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'credit_issued','credit_applied','refund_received','expired'
  )),
  amount_cents integer NOT NULL,
  invoice_id uuid NULL REFERENCES invoices(id) ON DELETE SET NULL,
  reason text NULL,
  expires_at timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── quickbooks_sync_events (outbox; new alongside existing quickbooks_sync_logs) ──
CREATE TABLE IF NOT EXISTS quickbooks_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','synced','failed','dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempted_at timestamptz NULL,
  synced_at timestamptz NULL,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── installment_schedules: attempt counter for retry logic ─────────
ALTER TABLE installment_schedules
  ADD COLUMN IF NOT EXISTS paid_at timestamptz NULL;

-- ── indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS invoices_bulk_job_id_idx
  ON invoices(bulk_job_id) WHERE bulk_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_status_due_idx
  ON invoices(status, due_at);
CREATE INDEX IF NOT EXISTS invoices_billing_scope_idx
  ON invoices(billing_scope) WHERE billing_scope IS NOT NULL;
CREATE INDEX IF NOT EXISTS wallet_tx_wallet_id_idx
  ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS wallet_tx_expires_idx
  ON wallet_transactions(expires_at)
  WHERE expires_at IS NOT NULL AND type = 'credit_issued';
CREATE INDEX IF NOT EXISTS qb_sync_events_status_idx
  ON quickbooks_sync_events(status)
  WHERE status IN ('pending','failed');

COMMIT;
