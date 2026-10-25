-- 0055_cron_notice_recipients.rollback.sql (never auto-applied)
-- Restores the 0025 definitions of sp_roster_lock_sweep and
-- sp_expire_team_invites. Those write notices with no recipient (COMP-19);
-- roll back only together with whatever replaces 0055.

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
