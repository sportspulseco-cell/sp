-- 0026_approval_gate.sql
-- Captain register approval gate — Spec brief: "Team Registration via
-- Admin Approval".
--
-- Adds a new `pending_approval` entry status that captains land on
-- immediately after applying. The rollover wizard (dues + roster
-- invites) only triggers AFTER an admin approves and the row
-- transitions pending_approval → applied. This replaces the previous
-- self-serve flow where applying went straight to `applied`.

BEGIN;

ALTER TABLE division_team_entries
  DROP CONSTRAINT IF EXISTS dte_entry_status_check;
ALTER TABLE division_team_entries
  ADD CONSTRAINT dte_entry_status_check CHECK (
    entry_status IN (
      'pending_approval',
      'applied',
      'accepted',
      'confirmed',
      'withdrawn',
      'disqualified',
      'rejected'
    )
  );

-- The existing partial unique index already excludes withdrawn / rejected /
-- disqualified. Keep that semantics: a team can have at most one
-- non-terminal entry per (team, division). pending_approval is treated as
-- non-terminal (an open application blocks a re-apply for the same division).
-- No change needed.

COMMIT;
