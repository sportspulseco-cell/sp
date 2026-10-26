-- pg_cron job: automatic team-invite reminders (UC-04, FR-3.4.4). 2026-10-26.
--
-- Fires hourly at :20. pg_net POSTs to /captain/roster-cron/invite-reminders
-- on the API with the X-Cron-Secret header. The API sends a pending
-- personal invite one reminder after 3 days and one in the 48 hours before
-- the season's roster lock; each is claimed on the invite row and the
-- notice is idempotent, so re-running is safe.
--
-- Same pattern as 0043 (season auto-transition). No schema change.
-- Idempotent: unschedules the job first.

DO $$
BEGIN
  PERFORM cron.unschedule('team-invite-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'team-invite-reminders',
  '20 * * * *',
  $cron$
    SELECT net.http_post(
      url := (
        SELECT decrypted_secret
          FROM vault.decrypted_secrets
         WHERE name = 'cron_api_base_url'
      ) || '/captain/roster-cron/invite-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', (
          SELECT decrypted_secret
            FROM vault.decrypted_secrets
           WHERE name = 'cron_secret'
        )
      ),
      body := '{}'::jsonb
    );
  $cron$
);
