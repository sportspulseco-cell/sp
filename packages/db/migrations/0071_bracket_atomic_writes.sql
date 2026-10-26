-- 0071_bracket_atomic_writes.sql
-- FR-3.13.2/3.13.3: a playoff bracket and its games are written together.
-- scheduler-bracket-generate inserted the bracket row, then the games in a
-- second call; a failed games insert left a bracket pointing at no games.
-- scheduler-bracket-advance updated the bracket and inserted the next game
-- in separate calls the same way. Edge functions (supabase-js) cannot open
-- a transaction, so each write is one function call = one transaction.
--
-- * sp_bracket_create(bracket, games, provenance): inserts the bracket and
--   its known games; returns the bracket id. Refuses a second live bracket
--   for the same season and division (unique_violation-like error).
-- * sp_bracket_advance(bracket_id, expected_updated_at, slots, state, games,
--   provenance): updates the bracket only if nobody changed it since it was
--   read (optimistic lock; else raises 'bracket_changed'), then inserts the
--   new game(s).
-- * Only service_role may call them (edge functions); not exposed to anon
--   or authenticated (same stance as 0050).
--
-- Idempotent (CREATE OR REPLACE). Rollback: 0071_bracket_atomic_writes.rollback.sql.

CREATE OR REPLACE FUNCTION public.sp_bracket_insert_games(p_games jsonb, p_provenance jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF p_games IS NULL OR jsonb_array_length(p_games) = 0 THEN
    RETURN 0;
  END IF;
  INSERT INTO public.games (
    id, league_id, season_id, division_id, sport_code, home_team_id, away_team_id,
    scheduled_start_ts_utc, tz, venue_name, surface_label, slot_id, surface_id,
    source, game_type, status
  )
  SELECT x.id, x.league_id, x.season_id, x.division_id, x.sport_code, x.home_team_id, x.away_team_id,
         x.scheduled_start_ts_utc, coalesce(x.tz, 'UTC'), x.venue_name, x.surface_label, x.slot_id, x.surface_id,
         'generated', 'playoff', 'scheduled'
  FROM jsonb_to_recordset(p_games) AS x(
    id uuid, league_id uuid, season_id uuid, division_id uuid, sport_code text,
    home_team_id uuid, away_team_id uuid, scheduled_start_ts_utc timestamptz, tz text,
    venue_name text, surface_label text, slot_id uuid, surface_id uuid
  );
  GET DIAGNOSTICS n = ROW_COUNT;
  IF p_provenance IS NOT NULL AND jsonb_array_length(p_provenance) > 0 THEN
    INSERT INTO public.game_provenance (game_id, placement_pass, constraint_ids)
    SELECT x.game_id, 'bracket', coalesce(x.constraint_ids, '["no_venue_double_book"]'::jsonb)
    FROM jsonb_to_recordset(p_provenance) AS x(game_id uuid, constraint_ids jsonb);
  END IF;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.sp_bracket_create(p_bracket jsonb, p_games jsonb, p_provenance jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_id uuid; v_games integer;
BEGIN
  -- One live bracket per season and division.
  PERFORM pg_advisory_xact_lock(hashtext('bracket:' || (p_bracket->>'season_id') || ':' || coalesce(p_bracket->>'division_id', '')));
  IF EXISTS (
    SELECT 1 FROM public.playoff_brackets
     WHERE season_id = (p_bracket->>'season_id')::uuid
       AND division_id IS NOT DISTINCT FROM (p_bracket->>'division_id')::uuid
       AND state IN ('pending', 'active')
  ) THEN
    RAISE EXCEPTION 'active_bracket_exists' USING ERRCODE = 'unique_violation';
  END IF;
  INSERT INTO public.playoff_brackets (
    id, season_id, division_id, format, state, seed_map, slots, metadata,
    generated_by_user_id, generated_at
  ) VALUES (
    coalesce((p_bracket->>'id')::uuid, gen_random_uuid()),
    (p_bracket->>'season_id')::uuid,
    (p_bracket->>'division_id')::uuid,
    coalesce(p_bracket->>'format', 'single_elim'),
    'active',
    coalesce(p_bracket->'seed_map', '[]'::jsonb),
    coalesce(p_bracket->'slots', '[]'::jsonb),
    coalesce(p_bracket->'metadata', '{}'::jsonb),
    (p_bracket->>'generated_by_user_id')::uuid,
    now()
  ) RETURNING id INTO v_id;
  v_games := public.sp_bracket_insert_games(p_games, p_provenance);
  RETURN jsonb_build_object('bracketId', v_id, 'gamesCreated', v_games);
END $$;

CREATE OR REPLACE FUNCTION public.sp_bracket_advance(
  p_bracket_id uuid, p_expected_updated_at timestamptz, p_slots jsonb, p_state text,
  p_games jsonb, p_provenance jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_rows integer; v_games integer;
BEGIN
  UPDATE public.playoff_brackets
     SET slots = p_slots, state = p_state, updated_at = now()
   WHERE id = p_bracket_id AND updated_at = p_expected_updated_at;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'bracket_changed' USING ERRCODE = 'serialization_failure';
  END IF;
  v_games := public.sp_bracket_insert_games(p_games, p_provenance);
  RETURN jsonb_build_object('bracketId', p_bracket_id, 'gamesCreated', v_games);
END $$;

REVOKE EXECUTE ON FUNCTION public.sp_bracket_insert_games(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sp_bracket_create(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sp_bracket_advance(uuid, timestamptz, jsonb, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sp_bracket_insert_games(jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.sp_bracket_create(jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.sp_bracket_advance(uuid, timestamptz, jsonb, text, jsonb, jsonb) TO service_role;
