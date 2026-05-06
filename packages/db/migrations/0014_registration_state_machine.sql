-- 0014_registration_state_machine.sql
--
-- Workflow 1 v2.0 §10. Relaxes registrations.status CHECK constraint
-- to admit the full set of states the spec defines:
--   draft, pending_verification, pending_consent, pending_payment,
--   pending_offline, pending_review, incomplete, approved, rejected,
--   cancelled
--
-- Existing values (submitted, under_review, waitlisted, withdrawn) are
-- preserved — the new constraint is a strict superset of the old one
-- so existing rows remain valid. We DO add a "cancelled" alongside the
-- existing "withdrawn" rather than renaming, because audit history
-- references the old label.
--
-- Idempotent: drops the old CHECK if present before adding the new one.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registration_status_check'
      AND conrelid = 'registrations'::regclass
  ) THEN
    ALTER TABLE registrations DROP CONSTRAINT registration_status_check;
  END IF;
END $$;

ALTER TABLE registrations
  ADD CONSTRAINT registration_status_check
  CHECK (status IN (
    -- New v2 states
    'draft',
    'pending_verification',
    'pending_consent',
    'pending_payment',
    'pending_offline',
    'pending_review',
    'incomplete',
    'approved',
    'rejected',
    'cancelled',
    -- Legacy v1 values kept for audit/back-compat
    'submitted',
    'under_review',
    'waitlisted',
    'withdrawn'
  ));
