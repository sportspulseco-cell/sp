-- 0025_cron_sweeps.sql
-- Workflow 7B + 7C — scheduled sweeps via pg_cron.
--
-- 1. Roster-lock sweep (Workflow 7C §3) — runs daily at 02:00 UTC.
--    For every season whose rosterLockAt has passed, flag USA
--    Hockey IDs that have expired or are expiring within the
--    season window. Idempotent via stable notification
--    idempotency keys and partial unique on eligibility_records.
--
-- 2. Invite expiry sweep (Workflow 7B §3) — runs hourly.
--    Flips team_invites.status to 'expired' once expires_at < now().
--
-- 3. Invite reminders (Workflow 7B §3) — runs daily at 09:00 UTC.
--    Sends INVITE_REMINDER_1 at age >= 7 days, INVITE_REMINDER_2 at
--    age >= 12 days; rate-limited to one per (invite, template) via
--    idempotency keys.
--
-- All functions are SECURITY DEFINER so pg_cron's `postgres` role can
-- read tenant data without RLS surprises.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ----------------------------------------------------------------
-- 1. Roster lock sweep
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_roster_lock_sweep(p_season_id uuid)
RETURNS TABLE(seasons_run int, expiring int, expired int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_season seasons%ROWTYPE;
  v_expiring int := 0;
  v_expired int := 0;
  v_team_org_id uuid;
BEGIN
  SELECT * INTO v_season FROM seasons WHERE id = p_season_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;

  -- Members whose USA Hockey ID has already expired
  FOR v_team_org_id IN
    SELECT DISTINCT t.org_id
    FROM team_memberships tm
    JOIN identity_verifications iv ON iv.person_id = tm.person_id
    JOIN teams t ON t.id = tm.team_id
    WHERE tm.season_id = p_season_id
      AND tm.current_status = 'active'
      AND iv.expires_at < now()
  LOOP
    NULL; -- placeholder; the work happens in the bulk UPSERT below
  END LOOP;

  -- Bulk upsert eligibility_records for already-expired IDs
  WITH expired_members AS (
    SELECT tm.person_id, t.org_id, iv.external_id, iv.expires_at, iv.source
    FROM team_memberships tm
    JOIN identity_verifications iv ON iv.person_id = tm.person_id
    JOIN teams t ON t.id = tm.team_id
    WHERE tm.season_id = p_season_id
      AND tm.current_status = 'active'
      AND iv.expires_at < now()
  ),
  upserted AS (
    INSERT INTO eligibility_records (person_id, season_id, rule_evaluation, status)
    SELECT
      em.person_id,
      p_season_id,
      jsonb_build_object(
        'usaHockeyId', jsonb_build_object(
          'provided', em.external_id,
          'expiresAt', em.expires_at,
          'source', em.source,
          'status', 'expired',
          'checkedAt', now(),
          'adminWaived', false,
          'waiveReason', null
        )
      ),
      'expired'
    FROM expired_members em
    ON CONFLICT (person_id, season_id) WHERE season_id IS NOT NULL
    DO UPDATE SET
      rule_evaluation = eligibility_records.rule_evaluation || EXCLUDED.rule_evaluation,
      status = EXCLUDED.status,
      evaluated_at = now(),
      updated_at = now()
    RETURNING person_id
  )
  SELECT count(*) INTO v_expired FROM upserted;

  -- Notifications for already-expired (player + captain)
  INSERT INTO notifications
    (org_id, idempotency_key, template_code, channel, body, recipient_person_id, payload, source_event, status)
  SELECT
    t.org_id,
    'usah-expired-' || tm.person_id::text || '-' || p_season_id::text,
    'USA_HOCKEY_EXPIRED',
    'email',
    'Your USA Hockey membership has expired. Renew at usahockey.com to remain eligible.',
    tm.person_id,
    jsonb_build_object('expiresAt', iv.expires_at, 'seasonId', p_season_id),
    'cron.lock_sweep',
    'queued'
  FROM team_memberships tm
  JOIN identity_verifications iv ON iv.person_id = tm.person_id
  JOIN teams t ON t.id = tm.team_id
  WHERE tm.season_id = p_season_id
    AND tm.current_status = 'active'
    AND iv.expires_at < now()
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- Bulk upsert for expiring (within season window)
  WITH expiring_members AS (
    SELECT tm.person_id, t.org_id, iv.external_id, iv.expires_at, iv.source
    FROM team_memberships tm
    JOIN identity_verifications iv ON iv.person_id = tm.person_id
    JOIN teams t ON t.id = tm.team_id
    WHERE tm.season_id = p_season_id
      AND tm.current_status = 'active'
      AND iv.expires_at >= now()
      AND iv.expires_at <= v_season.end_date::timestamptz
  ),
  upserted AS (
    INSERT INTO eligibility_records (person_id, season_id, rule_evaluation, status)
    SELECT
      em.person_id,
      p_season_id,
      jsonb_build_object(
        'usaHockeyId', jsonb_build_object(
          'provided', em.external_id,
          'expiresAt', em.expires_at,
          'source', em.source,
          'status', 'expiring',
          'checkedAt', now(),
          'adminWaived', false,
          'waiveReason', null
        )
      ),
      'expiring'
    FROM expiring_members em
    ON CONFLICT (person_id, season_id) WHERE season_id IS NOT NULL
    DO UPDATE SET
      rule_evaluation = eligibility_records.rule_evaluation || EXCLUDED.rule_evaluation,
      status = CASE
        WHEN eligibility_records.status IN ('expired', 'waived') THEN eligibility_records.status
        ELSE EXCLUDED.status
      END,
      evaluated_at = now(),
      updated_at = now()
    RETURNING person_id
  )
  SELECT count(*) INTO v_expiring FROM upserted;

  -- Expiring-soon player notifications
  INSERT INTO notifications
    (org_id, idempotency_key, template_code, channel, body, recipient_person_id, payload, source_event, status)
  SELECT
    t.org_id,
    'usah-expiring-' || tm.person_id::text || '-' || p_season_id::text,
    'USA_HOCKEY_EXPIRING_SOON',
    'email',
    'Your USA Hockey membership expires soon. Renew at usahockey.com to remain eligible.',
    tm.person_id,
    jsonb_build_object('expiresAt', iv.expires_at, 'seasonId', p_season_id),
    'cron.lock_sweep',
    'queued'
  FROM team_memberships tm
  JOIN identity_verifications iv ON iv.person_id = tm.person_id
  JOIN teams t ON t.id = tm.team_id
  WHERE tm.season_id = p_season_id
    AND tm.current_status = 'active'
    AND iv.expires_at >= now()
    AND iv.expires_at <= v_season.end_date::timestamptz
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- Sweep-complete summary for league admin
  INSERT INTO notifications
    (org_id, idempotency_key, template_code, channel, body, payload, source_event, status)
  SELECT
    DISTINCT t.org_id,
    'lock-sweep-' || p_season_id::text || '-' || to_char(now(), 'YYYY-MM-DD'),
    'COMPLIANCE_SWEEP_COMPLETE',
    'email',
    'Compliance sweep complete: ' || v_expiring || ' expiring, ' || v_expired || ' expired.',
    jsonb_build_object(
      'seasonId', p_season_id,
      'expiring', v_expiring,
      'expired', v_expired,
      'sweepRunAt', now()
    ),
    'cron.lock_sweep',
    'queued'
  FROM team_memberships tm
  JOIN teams t ON t.id = tm.team_id
  WHERE tm.season_id = p_season_id
  LIMIT 1
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN QUERY SELECT 1, v_expiring, v_expired;
END $$;

-- Wrapper: walk every season whose rosterLockAt has passed and run the sweep.
CREATE OR REPLACE FUNCTION public.sp_run_daily_lock_sweep()
RETURNS TABLE(seasons_run int, expiring int, expired int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_season_id uuid;
  v_seasons_run int := 0;
  v_total_expiring int := 0;
  v_total_expired int := 0;
  v_result RECORD;
BEGIN
  FOR v_season_id IN
    SELECT s.id FROM seasons s
    WHERE s.deleted_at IS NULL
      AND s.roster_lock_at IS NOT NULL
      AND s.roster_lock_at < now()
      AND s.status IN ('registration_open', 'in_progress', 'playoffs')
  LOOP
    FOR v_result IN SELECT * FROM public.sp_roster_lock_sweep(v_season_id)
    LOOP
      v_seasons_run := v_seasons_run + 1;
      v_total_expiring := v_total_expiring + v_result.expiring;
      v_total_expired := v_total_expired + v_result.expired;
    END LOOP;
  END LOOP;
  RETURN QUERY SELECT v_seasons_run, v_total_expiring, v_total_expired;
END $$;

-- ----------------------------------------------------------------
-- 2. Invite expiry sweep — hourly
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_expire_team_invites()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_count int;
BEGIN
  WITH expired AS (
    UPDATE team_invites
    SET status = 'expired', updated_at = now()
    WHERE status IN ('pending', 'extended')
      AND expires_at IS NOT NULL
      AND expires_at < now()
    RETURNING id, team_id, invitee_email, season_id
  ),
  notes AS (
    INSERT INTO notifications
      (org_id, idempotency_key, template_code, channel, body, payload, source_event, status)
    SELECT
      t.org_id,
      'invite-expired-cap-' || e.id::text,
      'INVITE_EXPIRED_CAPTAIN',
      'email',
      'A player invite has expired and they have not been added to your roster.',
      jsonb_build_object('inviteId', e.id, 'inviteeEmail', e.invitee_email),
      'cron.invite_expiry',
      'queued'
    FROM expired e
    JOIN teams t ON t.id = e.team_id
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN COALESCE(v_count, 0);
END $$;

-- ----------------------------------------------------------------
-- 3. Invite reminders — daily
-- Sends INVITE_REMINDER_1 at age 7d, INVITE_REMINDER_2 at age 12d.
-- Idempotent per invite via stable idempotency keys.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_send_invite_reminders()
RETURNS TABLE(reminders_1 int, reminders_2 int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_r1 int := 0;
  v_r2 int := 0;
BEGIN
  -- Reminder 1: invites >= 7 days old, still pending/extended
  WITH eligible AS (
    SELECT ti.id, ti.invitee_email, ti.team_id, t.org_id
    FROM team_invites ti
    JOIN teams t ON t.id = ti.team_id
    WHERE ti.status IN ('pending', 'extended')
      AND ti.created_at <= now() - INTERVAL '7 days'
      AND (ti.expires_at IS NULL OR ti.expires_at > now())
  ),
  inserted AS (
    INSERT INTO notifications
      (org_id, idempotency_key, template_code, channel, body, recipient_email, payload, source_event, status)
    SELECT
      org_id,
      'invite-reminder-1-' || id::text,
      'INVITE_REMINDER_1',
      'email',
      'Reminder: you have a pending team invite. Complete your registration to keep your spot.',
      invitee_email,
      jsonb_build_object('inviteId', id),
      'cron.invite_reminder',
      'queued'
    FROM eligible
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_r1 FROM inserted;

  -- Reminder 2: invites >= 12 days old
  WITH eligible AS (
    SELECT ti.id, ti.invitee_email, ti.team_id, t.org_id
    FROM team_invites ti
    JOIN teams t ON t.id = ti.team_id
    WHERE ti.status IN ('pending', 'extended')
      AND ti.created_at <= now() - INTERVAL '12 days'
      AND (ti.expires_at IS NULL OR ti.expires_at > now())
  ),
  inserted AS (
    INSERT INTO notifications
      (org_id, idempotency_key, template_code, channel, body, recipient_email, payload, source_event, status)
    SELECT
      org_id,
      'invite-reminder-2-' || id::text,
      'INVITE_REMINDER_2',
      'email',
      'Second reminder: your team invite expires soon. Finish registration now.',
      invitee_email,
      jsonb_build_object('inviteId', id),
      'cron.invite_reminder',
      'queued'
    FROM eligible
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_r2 FROM inserted;

  RETURN QUERY SELECT v_r1, v_r2;
END $$;

-- ----------------------------------------------------------------
-- Schedule the jobs
-- ----------------------------------------------------------------

-- Roster lock sweep — daily at 02:00 UTC
SELECT cron.schedule(
  'sp-daily-lock-sweep',
  '0 2 * * *',
  $cron$ SELECT public.sp_run_daily_lock_sweep(); $cron$
);

-- Invite expiry — hourly at :05
SELECT cron.schedule(
  'sp-hourly-invite-expiry',
  '5 * * * *',
  $cron$ SELECT public.sp_expire_team_invites(); $cron$
);

-- Invite reminders — daily at 09:00 UTC (sane hour for outbound email)
SELECT cron.schedule(
  'sp-daily-invite-reminders',
  '0 9 * * *',
  $cron$ SELECT public.sp_send_invite_reminders(); $cron$
);
