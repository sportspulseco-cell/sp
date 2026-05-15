-- pg_cron job: compliance lock-sweep auto-trigger. Backlog #20 / H1.
--
-- Fires hourly. pg_net POSTs to /compliance/eligibility/cron/lock-sweep
-- on the API with the X-Cron-Secret header. The API finds seasons
-- whose roster_lock_at has passed and that haven't been swept (or
-- whose roster_lock_at moved forward), then runs the per-season
-- lock sweep + stamps seasons.last_lock_sweep_at.
--
-- Idempotent — already-swept seasons are filtered out at the API
-- layer; re-running the cron is safe.

DO $$
BEGIN
  PERFORM cron.unschedule('compliance-lock-sweep');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'compliance-lock-sweep',
  '0 * * * *',
  $cron$
    SELECT net.http_post(
      url := (
        SELECT decrypted_secret
          FROM vault.decrypted_secrets
         WHERE name = 'cron_api_base_url'
      ) || '/compliance/eligibility/cron/lock-sweep',
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
