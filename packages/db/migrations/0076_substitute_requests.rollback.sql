-- Rollback for 0076_substitute_requests.sql. Never applied automatically.
--
-- Refuses while request rows exist: they are the confirmation log of who
-- was asked to sub and who added a guest (UC-31). The guests themselves
-- live in game_attendance and are not touched. Export the rows first,
-- then delete them on purpose.
DO $$ BEGIN
  IF to_regclass('public.substitute_requests') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.substitute_requests) THEN
      RAISE EXCEPTION 'substitute_requests has rows; export them before rolling back 0076';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS public.substitute_requests;
