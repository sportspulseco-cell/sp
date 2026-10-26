-- Rollback for 0070_schedule_blackouts.sql. Never applied automatically.
--
-- Refuses while blackout rows exist: they are admin input the generator
-- relies on. Export them first, then delete them on purpose.
DO $$ BEGIN
  IF to_regclass('public.schedule_blackouts') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.schedule_blackouts) THEN
      RAISE EXCEPTION 'schedule_blackouts has rows; export them before rolling back 0070';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS public.schedule_blackouts;
