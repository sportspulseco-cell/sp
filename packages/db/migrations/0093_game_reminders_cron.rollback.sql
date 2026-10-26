-- Rollback 0093: stop the hourly game-reminder job.
DO $$
BEGIN
  PERFORM cron.unschedule('game-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
