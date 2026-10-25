-- Rollback for 0054_compliance_document_submissions.sql. Never applied
-- automatically.
--
-- Refuses while any submission exists: the rows are the only index of
-- the identity files in the `compliance-documents` storage bucket and
-- of every admin decision on them. Export them (and the bucket) first,
-- then delete the rows on purpose before rolling back.
-- The bucket itself is not touched here; remove it from Storage by hand
-- once it is empty.

-- Nested IF: the inner query is only planned when the table exists, so
-- the rollback can run again after it already succeeded.
DO $$ BEGIN
  IF to_regclass('public.compliance_document_submissions') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.compliance_document_submissions) THEN
      RAISE EXCEPTION 'compliance_document_submissions has rows; export them and the compliance-documents bucket before rolling back 0054';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS public.compliance_document_decisions;
DROP TABLE IF EXISTS public.compliance_document_submissions;
DROP FUNCTION IF EXISTS public.compliance_document_decisions_append_only();
