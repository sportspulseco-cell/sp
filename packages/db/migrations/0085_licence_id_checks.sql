-- 0085_licence_id_checks.sql
-- UC-29 / FR-3.15.5: an admin reviewing a submitted ID document can scan
-- the PDF417 barcode on a US or Canadian driver's licence (device camera
-- or a photo). The API parses the AAMVA fields, compares them with the
-- person on file and writes one evidence row here. The admin's approve /
-- reject stays on compliance_document_decisions (0054).
--
-- * Never the licence number in clear: licence_last4 plus licence_hash,
--   an HMAC-SHA256 keyed by the API's ID_CHECK_HASH_KEY. The same licence
--   on two people can be spotted without keeping the number.
-- * Names and date of birth from the card are not stored; mismatched_fields
--   says which ones disagreed with the person on file.
-- * Append-only: a trigger refuses UPDATE and direct DELETE; rows go only
--   by cascade with their submission, person or org.
-- * RLS on, no policies, anon and authenticated hold nothing (identity
--   evidence; the API connects as postgres). Same stance as 0050 / 0054.
--
-- Drafted with `drizzle-kit generate --name=licence_id_checks`; the draft
-- also carried tables other branches add (schedule_blackouts, invoice
-- columns), which were cut: this file only adds compliance_id_checks.
-- Additive and idempotent. Rollback: 0085_licence_id_checks.rollback.sql.
-- Drizzle: packages/db/src/schema/registration.ts. Enums: @sportspulse/kernel aamva.ts.

CREATE TABLE IF NOT EXISTS public.compliance_id_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  submission_id uuid NOT NULL,
  person_id uuid NOT NULL,
  org_id uuid NOT NULL,
  method text NOT NULL,
  result text NOT NULL,
  mismatched_fields text[] DEFAULT '{}'::text[] NOT NULL,
  document_type text NOT NULL,
  jurisdiction text,
  country text,
  aamva_version integer,
  licence_last4 text NOT NULL,
  licence_hash text NOT NULL,
  expires_on date,
  checked_by_user_id uuid,
  checked_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT cic_method_check CHECK (method IN ('camera','photo')),
  CONSTRAINT cic_result_check CHECK (result IN ('match','mismatch')),
  CONSTRAINT cic_document_type_check CHECK (document_type IN ('DL','ID')),
  CONSTRAINT cic_last4_check CHECK (licence_last4 ~ '^[A-Z0-9]{1,4}$'),
  CONSTRAINT cic_hash_check CHECK (licence_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT cic_fields_check CHECK (mismatched_fields <@ ARRAY['last_name','first_name','date_of_birth','date_of_birth_not_on_file','expired','expiry_unreadable','seen_on_another_person']::text[]),
  CONSTRAINT cic_result_fields_check CHECK ((result = 'match') = (cardinality(mismatched_fields) = 0))
);

DO $$ BEGIN
  ALTER TABLE public.compliance_id_checks
    ADD CONSTRAINT compliance_id_checks_submission_id_compliance_document_submissions_id_fk
    FOREIGN KEY (submission_id) REFERENCES public.compliance_document_submissions(id) ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_id_checks
    ADD CONSTRAINT compliance_id_checks_person_id_persons_id_fk
    FOREIGN KEY (person_id) REFERENCES public.persons(id) ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_id_checks
    ADD CONSTRAINT compliance_id_checks_org_id_orgs_id_fk
    FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public.compliance_id_checks
    ADD CONSTRAINT compliance_id_checks_checked_by_user_id_users_id_fk
    FOREIGN KEY (checked_by_user_id) REFERENCES auth.users(id) ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS cic_submission_idx ON public.compliance_id_checks (submission_id, checked_at);
CREATE INDEX IF NOT EXISTS cic_hash_idx ON public.compliance_id_checks (licence_hash);
CREATE INDEX IF NOT EXISTS cic_person_idx ON public.compliance_id_checks (person_id);

-- Append-only evidence. A delete cascaded from the submission, person or
-- org runs inside the foreign-key trigger (depth 2) and is allowed; a
-- direct UPDATE or DELETE (depth 1) is refused.
CREATE OR REPLACE FUNCTION public.compliance_id_checks_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'compliance_id_checks is append-only: % refused', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;

DROP TRIGGER IF EXISTS cic_append_only ON public.compliance_id_checks;
CREATE TRIGGER cic_append_only
  BEFORE UPDATE OR DELETE ON public.compliance_id_checks
  FOR EACH ROW EXECUTE FUNCTION public.compliance_id_checks_append_only();

ALTER TABLE public.compliance_id_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compliance_id_checks FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compliance_id_checks_append_only() FROM PUBLIC, anon, authenticated;
