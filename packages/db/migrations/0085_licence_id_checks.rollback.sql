-- Rollback for 0085_licence_id_checks.sql. Never applied automatically.
--
-- Refuses while any check exists: the rows are the evidence of which
-- admin checked which licence against which person. Export them first,
-- then delete them on purpose (the append-only trigger must be dropped
-- by hand to do that) before rolling back.

DO $$ BEGIN
  IF to_regclass('public.compliance_id_checks') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.compliance_id_checks) THEN
      RAISE EXCEPTION 'compliance_id_checks has rows; export them before rolling back 0085';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS public.compliance_id_checks;
DROP FUNCTION IF EXISTS public.compliance_id_checks_append_only();
