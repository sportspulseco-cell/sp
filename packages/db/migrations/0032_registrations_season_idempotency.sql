-- P2-3 (part A) — registration idempotency at the DB level.
--
-- Same player resubmitting via the funnel produced a fresh
-- registration each time (no uniqueness across idempotency keys
-- = no uniqueness across submissions). The acceptance fix in the
-- audit: unique-active partial index on
-- `(subject_person_id, season_id) WHERE status NOT IN
-- (rejected, withdrawn, cancelled)`.
--
-- Implementation notes:
--   * `season_id` column is added nullable — org-only
--     registrations may not be season-bound. The partial index
--     skips NULL rows so those are unaffected.
--   * Backfill resolves season from `division.season_id` first
--     (most specific), then `form.season_id` (org-/league-scoped
--     forms still know their season).
--   * The partial unique excludes rejected/withdrawn/cancelled so
--     re-applying after a decline / withdraw is allowed.
--
-- Idempotent: every step uses IF NOT EXISTS / DO blocks so reruns
-- are no-ops.

DO $$
BEGIN
  ALTER TABLE registrations ADD COLUMN season_id uuid;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE registrations
    ADD CONSTRAINT registrations_season_id_fkey
    FOREIGN KEY (season_id) REFERENCES seasons (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One-shot backfill: division.season_id first, form.season_id fallback.
-- Safe to re-run — the SET only touches rows that still have NULL.
UPDATE registrations r
   SET season_id = COALESCE(d.season_id, rf.season_id)
  FROM divisions d, registration_form_versions rfv, registration_forms rf
 WHERE r.season_id IS NULL
   AND d.id = r.division_id
   AND rfv.id = r.form_version_id
   AND rf.id = rfv.form_id;

-- Backfill for rows that didn't match the division join (no division
-- set) — fall through to form season_id only.
UPDATE registrations r
   SET season_id = rf.season_id
  FROM registration_form_versions rfv
  JOIN registration_forms rf ON rf.id = rfv.form_id
 WHERE r.season_id IS NULL
   AND rfv.id = r.form_version_id
   AND rf.season_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS registrations_active_uniq
  ON registrations (subject_person_id, season_id)
  WHERE status NOT IN ('rejected','withdrawn','cancelled')
    AND season_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS registrations_season_idx
  ON registrations (season_id);
