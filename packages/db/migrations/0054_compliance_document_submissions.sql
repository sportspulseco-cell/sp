-- 0054_compliance_document_submissions.sql
-- COMP-3 + COMP-1 (UC-29): a player, or the guardian of a linked minor,
-- uploads an ID or eligibility document (birth certificate, governing-
-- body card, government ID, scanned signed waiver, other). League and
-- org admins whose scope covers it approve it, reject it with a reason,
-- or ask for a new upload. Before this there was no table, no bucket and
-- no endpoint for player files, and no admin decision at all.
--
-- * compliance_document_submissions: one row per uploaded file. The file
--   itself is in the private Supabase Storage bucket
--   `compliance-documents` at {personId}/{uuid}.{ext}; the API creates
--   the bucket on first use (public = false) and hands out 5-minute
--   signed URLs after a permission check. status = latest decision.
--   The same file for the same person and review target (org + season)
--   is one row (re-upload = replay); NULLS NOT DISTINCT so an org-level
--   upload with no season is covered too (Postgres 15+).
-- * compliance_document_decisions: append-only decision log. A trigger
--   refuses UPDATE and direct DELETE; rows go only by cascade when their
--   submission is deleted.
-- * RLS on, no policies, anon and authenticated hold nothing (identity
--   documents; the API connects as postgres). Same stance as 0050.
--
-- Additive and idempotent. Rollback: 0054_compliance_document_submissions.rollback.sql.
-- Drizzle: packages/db/src/schema/registration.ts. Enums: @sportspulse/kernel
-- compliance-documents.ts.

CREATE TABLE IF NOT EXISTS public.compliance_document_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  person_id uuid NOT NULL,
  org_id uuid NOT NULL,
  season_id uuid,
  registration_id uuid,
  document_version_id uuid,
  kind text NOT NULL,
  storage_bucket text DEFAULT 'compliance-documents' NOT NULL,
  storage_path text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  sha256 text NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  submitted_by_user_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.compliance_document_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  submission_id uuid NOT NULL,
  decision text NOT NULL,
  reason text,
  decided_by_user_id uuid,
  decided_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Constraints, each guarded so a re-run is a no-op.
DO $$ BEGIN
  ALTER TABLE public.compliance_document_submissions
    ADD CONSTRAINT cds_storage_path_uniq UNIQUE (storage_path);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_document_submissions
    ADD CONSTRAINT cds_person_target_sha_uniq
    UNIQUE NULLS NOT DISTINCT (person_id, org_id, season_id, sha256);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_document_submissions
    ADD CONSTRAINT cds_kind_check
    CHECK (kind IN ('birth_certificate','governing_body_card','government_id','signed_waiver','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_document_submissions
    ADD CONSTRAINT cds_status_check
    CHECK (status IN ('pending','approved','rejected','resubmit_requested','withdrawn'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_document_submissions
    ADD CONSTRAINT cds_content_type_check
    CHECK (content_type IN ('application/pdf','image/png','image/jpeg','image/webp'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_document_submissions
    ADD CONSTRAINT cds_size_check CHECK (size_bytes > 0 AND size_bytes <= 3145728);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_document_submissions
    ADD CONSTRAINT cds_sha256_check CHECK (sha256 ~ '^[0-9a-f]{64}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_document_decisions
    ADD CONSTRAINT cdd_decision_check
    CHECK (decision IN ('approved','rejected','resubmit_requested'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_document_decisions
    ADD CONSTRAINT cdd_reason_check CHECK (reason IS NULL OR char_length(reason) <= 500);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Foreign keys (names match what drizzle-kit drafts).
DO $$ BEGIN
  ALTER TABLE public.compliance_document_submissions
    ADD CONSTRAINT compliance_document_submissions_person_id_persons_id_fk
    FOREIGN KEY (person_id) REFERENCES public.persons(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_document_submissions
    ADD CONSTRAINT compliance_document_submissions_org_id_orgs_id_fk
    FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_document_submissions
    ADD CONSTRAINT compliance_document_submissions_season_id_seasons_id_fk
    FOREIGN KEY (season_id) REFERENCES public.seasons(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_document_submissions
    ADD CONSTRAINT compliance_document_submissions_registration_id_registrations_id_fk
    FOREIGN KEY (registration_id) REFERENCES public.registrations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_document_submissions
    ADD CONSTRAINT compliance_document_submissions_document_version_id_document_versions_id_fk
    FOREIGN KEY (document_version_id) REFERENCES public.document_versions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_document_submissions
    ADD CONSTRAINT compliance_document_submissions_submitted_by_user_id_users_id_fk
    FOREIGN KEY (submitted_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_document_decisions
    ADD CONSTRAINT compliance_document_decisions_submission_id_compliance_document_submissions_id_fk
    FOREIGN KEY (submission_id) REFERENCES public.compliance_document_submissions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_document_decisions
    ADD CONSTRAINT compliance_document_decisions_decided_by_user_id_users_id_fk
    FOREIGN KEY (decided_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Review queue reads by status, newest first; the player page by person.
CREATE INDEX IF NOT EXISTS cds_status_created_idx
  ON public.compliance_document_submissions (status, created_at);
CREATE INDEX IF NOT EXISTS cds_person_idx ON public.compliance_document_submissions (person_id);
CREATE INDEX IF NOT EXISTS cds_org_idx ON public.compliance_document_submissions (org_id);
CREATE INDEX IF NOT EXISTS cds_season_idx ON public.compliance_document_submissions (season_id);
CREATE INDEX IF NOT EXISTS cds_registration_idx ON public.compliance_document_submissions (registration_id);
CREATE INDEX IF NOT EXISTS cdd_submission_idx
  ON public.compliance_document_decisions (submission_id, decided_at);

-- Append-only decision log. A delete cascaded from the submission runs
-- inside the foreign-key trigger (depth 2) and is allowed; a direct
-- UPDATE or DELETE (depth 1) is refused.
CREATE OR REPLACE FUNCTION public.compliance_document_decisions_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'compliance_document_decisions is append-only: % refused', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;

DROP TRIGGER IF EXISTS cdd_append_only ON public.compliance_document_decisions;
CREATE TRIGGER cdd_append_only
  BEFORE UPDATE OR DELETE ON public.compliance_document_decisions
  FOR EACH ROW EXECUTE FUNCTION public.compliance_document_decisions_append_only();

-- Identity documents: nothing over the Data API, for anyone.
ALTER TABLE public.compliance_document_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_document_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compliance_document_submissions FROM anon, authenticated;
REVOKE ALL ON public.compliance_document_decisions FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compliance_document_decisions_append_only() FROM PUBLIC, anon, authenticated;
