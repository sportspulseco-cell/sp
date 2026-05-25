-- pg_cron job: season auto-transition. 2026-05-25.
--
-- Fires hourly. pg_net POSTs to
-- /league/seasons/cron/auto-transition on the API with the
-- X-Cron-Secret header. The API walks the seasons table and flips:
--
--   draft              → registration_open
--      when registration_opens_at <= now()
--       AND (registration_closes_at IS NULL OR registration_closes_at > now())
--
--   registration_open  → in_progress
--      when (registration_closes_at <= now()) OR (start_date <= today)
--
-- Both transitions honour `canTransitionSeason` and are
-- idempotent — re-running is safe. Admin-driven transitions
-- (playoffs / completed / archived) are NOT auto-promoted.
--
-- Mirrors the compliance-lock-sweep cron pattern from migration 0036.

DO $$
BEGIN
  PERFORM cron.unschedule('season-auto-transition');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'season-auto-transition',
  '0 * * * *',
  $cron$
    SELECT net.http_post(
      url := (
        SELECT decrypted_secret
          FROM vault.decrypted_secrets
         WHERE name = 'cron_api_base_url'
      ) || '/league/seasons/cron/auto-transition',
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
