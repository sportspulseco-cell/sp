-- 0095: the two frequent HTTP crons call the API only when there is work.
--
-- `scheduled-broadcasts` (every minute, 0087) and `retry-failed-notifications`
-- (every 5 minutes, 0034) POSTed to the API on every tick, about 1,700 calls
-- a day with nothing to do. Each call runs the API function, and on Vercel's
-- Hobby plan that CPU time ran out on 30 Oct 2026 (every app returned 402).
-- The cron now checks the database first, with the same conditions the API
-- uses to pick its rows (BroadcastService.runDue, RetryFailedHandler), and
-- POSTs only when a row qualifies. Same URL, headers and secrets as before.
--
-- Deferred on staging by the runner, like 0034 and 0087. Idempotent.

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
    )
    WHERE EXISTS (
      SELECT 1 FROM scheduled_broadcasts
       WHERE (status = 'scheduled' AND send_at <= now())
          OR (status = 'sending' AND claimed_at < now() - interval '10 minutes')
    );
  $cron$
);

DO $$
BEGIN
  PERFORM cron.unschedule('retry-failed-notifications');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'retry-failed-notifications',
  '*/5 * * * *',
  $cron$
    SELECT net.http_post(
      url := (
        SELECT decrypted_secret
          FROM vault.decrypted_secrets
         WHERE name = 'cron_api_base_url'
      ) || '/notifications/cron/retry-failed',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', (
          SELECT decrypted_secret
            FROM vault.decrypted_secrets
           WHERE name = 'cron_secret'
        )
      ),
      body := '{}'::jsonb
    )
    WHERE EXISTS (
      SELECT 1 FROM notifications
       WHERE (status = 'failed' AND attempt_count < 3
              AND CASE attempt_count
                    WHEN 1 THEN updated_at < now() - interval '5 minutes'
                    WHEN 2 THEN updated_at < now() - interval '30 minutes'
                    ELSE false
                  END)
          OR (status = 'queued'
              AND channel IN ('email', 'in_app', 'sms', 'push')
              AND created_at > now() - interval '24 hours'
              AND created_at < now() - interval '2 minutes')
    );
  $cron$
);
