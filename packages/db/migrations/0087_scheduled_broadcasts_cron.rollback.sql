-- Rollback 0087: stop the every-minute scheduled-announcement job.
-- Announcements still `scheduled` stay in the table and do not go out
-- until the job runs again.
DO $$
BEGIN
  PERFORM cron.unschedule('scheduled-broadcasts');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
