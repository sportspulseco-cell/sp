-- pg_cron + pg_net schedules for the platform's background jobs.
--
-- Two jobs:
--   * `refresh-active-season-membership` — hourly, pure SQL.
--     REFRESH MATERIALIZED VIEW CONCURRENTLY on v_active_season_membership
--     (P2-3 part B). The unique index on membership_id is what lets the
--     refresh happen without blocking reads.
--   * `retry-failed-notifications` — every 5 min, HTTP-driven via pg_net.
--     Posts to /notifications/cron/retry-failed on the API with the
--     X-Cron-Secret header. The API's CronSecretGuard verifies the
--     header against process.env.CRON_SECRET. P4-2 retry half.
--
-- Configuration:
--   pg_cron + pg_net + supabase_vault are pre-installed in this project.
--   Two secrets sit in `vault.secrets` (managed-only — never UPDATEd
--   directly):
--     * cron_secret        — matches the API's CRON_SECRET env
--     * cron_api_base_url  — base URL of the deployed API
--   This migration ensures both rows exist with placeholder values.
--   Production runs MUST overwrite the real values via
--   `SELECT vault.update_secret(secret_id, '<real value>')`.
--
-- Idempotent: cron.unschedule wrapped in DO blocks; vault.create_secret
-- only runs when the secret doesn't already exist.

-- ---------- 1. Vault entries (placeholders) ----------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN
    PERFORM vault.create_secret(
      'CHANGE-ME-IN-EACH-ENVIRONMENT',
      'cron_secret',
      'Shared secret for pg_cron-driven endpoints (X-Cron-Secret header)'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_api_base_url') THEN
    PERFORM vault.create_secret(
      'https://sp-api-one.vercel.app/api',
      'cron_api_base_url',
      'Base URL for the deployed API; pg_cron jobs target this host'
    );
  END IF;
END $$;

-- ---------- 2. Hourly materialised-view refresh ----------

DO $$
BEGIN
  PERFORM cron.unschedule('refresh-active-season-membership');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'refresh-active-season-membership',
  '0 * * * *',
  $cron$
    REFRESH MATERIALIZED VIEW CONCURRENTLY v_active_season_membership;
  $cron$
);

-- ---------- 3. Notifications retry-failed sweep (every 5 minutes) ----------
--
-- The job reads cron_secret + cron_api_base_url from vault each run so
-- rotating either is a single vault.update_secret call.

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
    );
  $cron$
);

-- ---------- 4. Visibility ----------
--
-- After applying:
--   SELECT jobid, jobname, schedule, command FROM cron.job;
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
-- For pg_net request history:
--   SELECT id, created, status_code, response FROM net._http_response
--     ORDER BY created DESC LIMIT 20;
-- To rotate the cron secret:
--   SELECT vault.update_secret(
--     (SELECT id FROM vault.secrets WHERE name = 'cron_secret'),
--     '<new-secret>'
--   );
--   -- Then update the API's CRON_SECRET env to match.
