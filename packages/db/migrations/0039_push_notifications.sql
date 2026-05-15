-- Backlog #16 — push channel scaffolding. Adds 'push' to the
-- notification channel CHECK constraints (so notifications + prefs
-- can be queued for push) and a push_subscriptions table for storing
-- web-push / FCM tokens per user. The dispatch path runs in log-only
-- mode until a real provider is wired; pg_cron's retry-failed sweep
-- (0034) re-tries push rows the same way it retries email today.
--
-- Additive + idempotent.

-- 1. push_subscriptions ------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,
  -- web | ios | android — web-push first, native later.
  platform          text NOT NULL DEFAULT 'web',
  -- For web-push: endpoint URL. For FCM/APNs: device token.
  endpoint          text NOT NULL,
  -- web-push only: p256dh + auth keys.
  p256dh_key        text,
  auth_key          text,
  user_agent        text,
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  -- Soft-disable when the provider returns "gone" / 410.
  is_active         boolean NOT NULL DEFAULT true,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE push_subscriptions
    ADD CONSTRAINT push_subscriptions_platform_check
    CHECK (platform IN ('web', 'ios', 'android'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_uniq
  ON push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON push_subscriptions (user_id, is_active);

-- 2. Relax channel CHECK on notifications + prefs ----------------------
-- Drop and recreate the channel CHECK so 'push' is allowed alongside
-- 'email' / 'in_app' / 'sms'. Constraint names are guessed from the
-- migration history.

DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_channel_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE notifications
    ADD CONSTRAINT notifications_channel_check
    CHECK (channel IN ('email', 'in_app', 'sms', 'push'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE notification_preferences DROP CONSTRAINT IF EXISTS notif_prefs_channel_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE notification_preferences
    ADD CONSTRAINT notif_prefs_channel_check
    CHECK (channel IN ('email', 'in_app', 'sms', 'push'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
