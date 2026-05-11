-- 0021_invoices_parent_and_type.sql
-- Workflow 7A · Sprint 4 — give invoices a master/sub linkage.
--
-- The captain rollover wizard fans a team's master invoice (one
-- per division_team_entries) out to one sub-invoice per invited
-- player. Sub-invoices are linked via `parent_invoice_id`; the
-- type discriminator (`invoice_type`) tells the AR/finance UI how
-- to render and total them.

BEGIN;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS parent_invoice_id uuid NULL
    REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'standard';

-- Allow the workflow-7A discriminator values alongside legacy rows
-- that don't carry a type.
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_type_check;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_type_check CHECK (
    invoice_type IN (
      'standard',      -- legacy single-invoice records
      'team_dues',     -- master invoice for one division_team_entries
      'sub_invoice'    -- per-player slice of a team_dues master
    )
  );

-- A sub-invoice MUST have a parent; legacy + master invoices must
-- not. Defer this as a trigger-equivalent CHECK for clarity.
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_parent_link_check;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_parent_link_check CHECK (
    (invoice_type = 'sub_invoice' AND parent_invoice_id IS NOT NULL)
    OR (invoice_type <> 'sub_invoice' AND parent_invoice_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS invoices_parent_idx
  ON invoices(parent_invoice_id)
  WHERE parent_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoices_type_idx
  ON invoices(invoice_type);

COMMIT;
