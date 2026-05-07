-- 0016_form_builder_unification.sql
--
-- Per repo owner directive 2026-05-09. Unifies the form-builder so
-- one component drives:
--   - per-season player registration forms
--   - per-role profile forms (replaces the hard-coded
--     ROLE_PROFILE_SCHEMAS map in @sportspulse/kernel as the *source*;
--     the kernel map stays as the seed default an admin can override)
--   - per-entity team-application / custom forms
--
-- A form is identified by its scope (already exists) + its purpose +
-- the role codes it applies to. The funnel + role-profile editor
-- query: "give me the form for (scope, purpose, role)" → fall through
-- to the kernel default if no admin-configured row exists.
--
-- Also lands per-season toggles (spec § Divisions & eligibility) so
-- "require USA Hockey ID", "allow free agent", "parental consent
-- required", "max roster size", "roster lock at" are admin-managed
-- per season instead of hard-coded in the funnel.
--
-- Idempotent.

-- ---------- registration_forms: purpose + role tags ----------
ALTER TABLE registration_forms
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'season_registration';

ALTER TABLE registration_forms
  ADD COLUMN IF NOT EXISTS applies_to_roles text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registration_forms_purpose_check'
      AND conrelid = 'registration_forms'::regclass
  ) THEN
    ALTER TABLE registration_forms
      ADD CONSTRAINT registration_forms_purpose_check
      CHECK (purpose IN (
        'season_registration',
        'role_profile',
        'team_application',
        'custom'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS registration_forms_purpose_idx
  ON registration_forms(purpose);

CREATE INDEX IF NOT EXISTS registration_forms_applies_roles_idx
  ON registration_forms USING gin(applies_to_roles);

-- ---------- seasons.config (per-season admin toggles) ----------
-- Documented keys (kept in @sportspulse/kernel SeasonConfig):
--   requireUsaHockeyId       (boolean) — block submission if missing
--   allowFreeAgent           (boolean) — show free-agent path on landing
--   parentalConsentRequired  (boolean) — auto-trigger if DOB < 18
--   requireLiabilityWaiver   (boolean) — hard-block without signature
--   maxRosterSize            (integer)
--   rosterLockAt             (timestamptz, ISO string in JSONB)
--
-- Defaults to {} so existing seasons keep their legacy hard-coded
-- behaviour until the admin opens the wizard and saves.
ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN seasons.config IS
  'Per-season admin toggles. Schema lives in @sportspulse/kernel SeasonConfig. ' ||
  'Keys: requireUsaHockeyId, allowFreeAgent, parentalConsentRequired, ' ||
  'requireLiabilityWaiver, maxRosterSize, rosterLockAt.';
