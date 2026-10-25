-- 0055_cron_notice_recipients.sql
-- COMP-19: two database cron functions wrote email notices that name
-- nobody, so they could never be sent. Production, 25 Oct: 455
-- COMPLIANCE_SWEEP_COMPLETE rows since 26 May and 6 INVITE_EXPIRED_CAPTAIN
-- rows, all without recipient_person_id or recipient_email.
--
-- sp_roster_lock_sweep (daily, 02:00 UTC, every locked season):
--   * the "sweep complete" summary is no longer written here. This job
--     re-checks every locked season each day, so a summary would email the
--     admins daily. The API lock sweep (hourly job, once per season at
--     roster lock) now sends the summary to the season's admins.
--   * the player's "USA Hockey expired" and "expires soon" notices carry
--     the player's sign-in email and a subject; a person with no account
--     (no email) gets no row, since nothing could reach them.
-- sp_expire_team_invites (hourly): one "invite expired" notice per captain
--   of the team (active captain role on the team), with the team name.
--
-- Both functions are defined in full. Production ran a variant of both
-- that differed from 0025 (no comments; the invite sweep counted inserted
-- notices instead of expired invites); after this file both databases run
-- the same definitions. CREATE OR REPLACE keeps the signatures, so it is
-- safe to re-run.

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
BEGIN
  SELECT * INTO v_season FROM seasons WHERE id = p_season_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;

  -- Already-expired USA Hockey IDs: eligibility records
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

  -- The player is told, at their sign-in email
  INSERT INTO notifications
    (org_id, idempotency_key, template_code, channel, subject, body,
     recipient_person_id, recipient_email, payload, source_event, status)
  SELECT
    t.org_id,
    'usah-expired-' || tm.person_id::text || '-' || p_season_id::text,
    'USA_HOCKEY_EXPIRED',
    'email',
    'Your USA Hockey membership has expired',
    'Your USA Hockey membership has expired. Renew at usahockey.com to remain eligible.',
    tm.person_id,
    pr.email,
    jsonb_build_object('expiresAt', iv.expires_at, 'seasonId', p_season_id),
    'cron.lock_sweep',
    'queued'
  FROM team_memberships tm
  JOIN identity_verifications iv ON iv.person_id = tm.person_id
  JOIN teams t ON t.id = tm.team_id
  JOIN persons p ON p.id = tm.person_id
  JOIN profiles pr ON pr.id = p.user_id
  WHERE tm.season_id = p_season_id
    AND tm.current_status = 'active'
    AND iv.expires_at < now()
    AND pr.email IS NOT NULL
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- IDs expiring within the season window: eligibility records
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

  INSERT INTO notifications
    (org_id, idempotency_key, template_code, channel, subject, body,
     recipient_person_id, recipient_email, payload, source_event, status)
  SELECT
    t.org_id,
    'usah-expiring-' || tm.person_id::text || '-' || p_season_id::text,
    'USA_HOCKEY_EXPIRING_SOON',
    'email',
    'Your USA Hockey membership expires soon',
    'Your USA Hockey membership expires soon. Renew at usahockey.com to remain eligible.',
    tm.person_id,
    pr.email,
    jsonb_build_object('expiresAt', iv.expires_at, 'seasonId', p_season_id),
    'cron.lock_sweep',
    'queued'
  FROM team_memberships tm
  JOIN identity_verifications iv ON iv.person_id = tm.person_id
  JOIN teams t ON t.id = tm.team_id
  JOIN persons p ON p.id = tm.person_id
  JOIN profiles pr ON pr.id = p.user_id
  WHERE tm.season_id = p_season_id
    AND tm.current_status = 'active'
    AND iv.expires_at >= now()
    AND iv.expires_at <= v_season.end_date::timestamptz
    AND pr.email IS NOT NULL
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- No summary row here: see the header.
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
  -- Each captain of the team (active captain role scoped to the team)
  captains AS (
    SELECT DISTINCT e.id AS invite_id, e.invitee_email, t.org_id, t.name AS team_name,
           p.id AS person_id, pr.email
    FROM expired e
    JOIN teams t ON t.id = e.team_id
    JOIN user_role_assignments ura
      ON ura.scope_type = 'team' AND ura.scope_id = e.team_id AND ura.revoked_at IS NULL
    JOIN roles r ON r.id = ura.role_id AND r.code = 'captain'
    JOIN persons p ON p.user_id = ura.user_id
    JOIN profiles pr ON pr.id = ura.user_id
    WHERE pr.email IS NOT NULL
  ),
  notes AS (
    INSERT INTO notifications
      (org_id, idempotency_key, template_code, channel, subject, body,
       recipient_person_id, recipient_email, payload, source_event, status)
    SELECT
      c.org_id,
      'invite-expired-cap-' || c.invite_id::text || ':' || c.person_id::text,
      'INVITE_EXPIRED_CAPTAIN',
      'email',
      'Invite expired: ' || coalesce(c.invitee_email, 'a player'),
      'The invite for ' || coalesce(c.invitee_email, 'a player') || ' on ' || c.team_name ||
        ' has expired. They have not been added to your roster. You can extend the invite or invite someone else.',
      c.person_id,
      c.email,
      jsonb_build_object('inviteId', c.invite_id, 'inviteeEmail', c.invitee_email, 'teamName', c.team_name),
      'cron.invite_expiry',
      'queued'
    FROM captains c
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN COALESCE(v_count, 0);
END $$;
