-- Rollback 0075: stop the automatic team-invite reminder job.
DO $$
BEGIN
  PERFORM cron.unschedule('team-invite-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
