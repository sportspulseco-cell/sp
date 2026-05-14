-- P4-2 (prefs half) — per-recipient opt-out grid for notifications.
--
-- Absence-of-row = opted-in (default-on). enabled=false means
-- suppress notifications of this (template_code, channel) for the
-- user. The dispatcher consults this table after resolving the
-- recipient's userId via persons.user_id and marks the row
-- `suppressed` instead of sending.
--
-- Idempotent: every step uses IF NOT EXISTS / DO blocks so reruns
-- are no-ops.

CREATE TABLE IF NOT EXISTS notification_preferences (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  template_code text NOT NULL,
  channel       text NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE notification_preferences
    ADD CONSTRAINT notif_prefs_channel_check
    CHECK (channel IN ('email','in_app','sms'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS notif_prefs_user_template_channel_uniq
  ON notification_preferences (user_id, template_code, channel);

CREATE INDEX IF NOT EXISTS notif_prefs_user_idx
  ON notification_preferences (user_id);
