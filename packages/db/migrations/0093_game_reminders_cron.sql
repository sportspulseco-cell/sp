-- pg_cron job: game reminders (FR-3.17.3). 2026-10-26.
--
-- Fires hourly at :15. pg_net POSTs to /games/cron/reminders on the API
-- with the X-Cron-Secret header. The API reminds both teams about
-- published, scheduled games that start in the next 24 hours, once per
-- person per game start time (idempotent), and honours each person's
-- `game.reminder` preferences.
--
-- Same pattern as 0036 / 0043: URL and secret come from Vault
-- (`cron_api_base_url`, `cron_secret`). Deferred on staging by the
-- runner like the other HTTP crons. Apply after the API that serves the
-- endpoint is deployed.

DO $$
BEGIN
  PERFORM cron.unschedule('game-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'game-reminders',
  '15 * * * *',
  $cron$
    SELECT net.http_post(
      url := (
        SELECT decrypted_secret
          FROM vault.decrypted_secrets
         WHERE name = 'cron_api_base_url'
      ) || '/games/cron/reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', (
          SELECT decrypted_secret
            FROM vault.decrypted_secrets
           WHERE name = 'cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);
