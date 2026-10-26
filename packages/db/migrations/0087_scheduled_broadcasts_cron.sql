-- pg_cron job: scheduled announcements (UC-19 schedule for later). 2026-10-26.
--
-- Every minute pg_net POSTs to /org-admin/broadcast/cron/due on the API
-- with the X-Cron-Secret header. The API claims scheduled_broadcasts rows
-- whose send_at has passed (scheduled -> sending), sends them idempotently
-- and marks them sent or failed. A row stuck in `sending` for 10 minutes
-- (a crashed run) is claimed again; the send is idempotent per person and
-- channel, so nobody gets it twice.
--
-- Same pattern as 0093: URL and secret come from Vault
-- (`cron_api_base_url`, `cron_secret`). Deferred on staging by the runner
-- like the other HTTP crons. Apply after the API that serves the endpoint
-- is deployed.

DO $$
BEGIN
  PERFORM cron.unschedule('scheduled-broadcasts');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'scheduled-broadcasts',
  '* * * * *',
  $cron$
    SELECT net.http_post(
      url := (
        SELECT decrypted_secret
          FROM vault.decrypted_secrets
         WHERE name = 'cron_api_base_url'
      ) || '/org-admin/broadcast/cron/due',
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
