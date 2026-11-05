-- Created with Supabase CLI migration new; numbered for this repository's migration runner.
-- One RPC is one transaction: preserve existing drafts on insert/provenance failure.
CREATE OR REPLACE FUNCTION public.sp_replace_schedule_drafts(
  p_run_id uuid, p_scope_snapshot jsonb, p_replaced_ids uuid[], p_games jsonb, p_provenance jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE v_season uuid; v_division uuid; v_league uuid; v_sport text; v_count integer;
BEGIN
  LOCK TABLE public.games IN SHARE ROW EXCLUSIVE MODE;
  SELECT r.season_id, r.division_id, s.league_id, s.sport_code
    INTO v_season, v_division, v_league, v_sport
    FROM public.schedule_runs r JOIN public.seasons s ON s.id=r.season_id
    WHERE r.id=p_run_id AND r.status='running' FOR UPDATE OF r;
  IF NOT FOUND OR v_division IS NULL THEN RAISE EXCEPTION 'schedule_run_not_writable'; END IF;
  IF EXISTS (
    (SELECT g.id, g.updated_at FROM public.games g WHERE g.season_id=v_season AND g.division_id=v_division
     EXCEPT SELECT x.id, x.updated_at FROM jsonb_to_recordset(p_scope_snapshot) AS x(id uuid, updated_at timestamptz))
    UNION ALL
    (SELECT x.id, x.updated_at FROM jsonb_to_recordset(p_scope_snapshot) AS x(id uuid, updated_at timestamptz)
     EXCEPT SELECT g.id, g.updated_at FROM public.games g WHERE g.season_id=v_season AND g.division_id=v_division)
  ) THEN RAISE EXCEPTION 'schedule_changed_during_generation'; END IF;
  IF EXISTS (SELECT id FROM unnest(p_replaced_ids) AS d(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.games g WHERE g.id=d.id AND g.season_id=v_season AND g.division_id=v_division
      AND g.source='generated' AND g.game_type='regular' AND g.status='scheduled'
      AND g.locked_at IS NULL AND g.published_at IS NULL AND g.finalized_at IS NULL))
  THEN RAISE EXCEPTION 'schedule_drafts_changed'; END IF;
  IF jsonb_typeof(p_games) <> 'array' OR jsonb_typeof(p_provenance) <> 'array' THEN
    RAISE EXCEPTION 'schedule_payload_invalid'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_games) AS x(
    season_id uuid, division_id uuid, league_id uuid, sport_code text, schedule_run_id uuid,
    home_team_id uuid, away_team_id uuid, source text, game_type text, status text
  ) WHERE x.season_id IS DISTINCT FROM v_season OR x.division_id IS DISTINCT FROM v_division
    OR x.league_id IS DISTINCT FROM v_league OR x.sport_code IS DISTINCT FROM v_sport
    OR x.schedule_run_id IS DISTINCT FROM p_run_id OR x.home_team_id=x.away_team_id
    OR x.source IS DISTINCT FROM 'generated' OR x.game_type IS DISTINCT FROM 'regular' OR x.status IS DISTINCT FROM 'scheduled')
  THEN RAISE EXCEPTION 'schedule_payload_outside_run'; END IF;
  DELETE FROM public.games WHERE id=ANY(p_replaced_ids);
  INSERT INTO public.games (id,league_id,season_id,division_id,sport_code,home_team_id,away_team_id,
    scheduled_start_ts_utc,tz,venue_name,surface_label,slot_id,surface_id,schedule_run_id,source,time_band,game_type,status)
  SELECT x.id,x.league_id,x.season_id,x.division_id,x.sport_code,x.home_team_id,x.away_team_id,
    x.scheduled_start_ts_utc,x.tz,x.venue_name,x.surface_label,x.slot_id,x.surface_id,p_run_id,'generated',x.time_band,'regular','scheduled'
  FROM jsonb_to_recordset(p_games) AS x(id uuid,league_id uuid,season_id uuid,division_id uuid,sport_code text,
    home_team_id uuid,away_team_id uuid,scheduled_start_ts_utc timestamptz,tz text,venue_name text,surface_label text,
    slot_id uuid,surface_id uuid,time_band text);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF jsonb_array_length(p_provenance) <> v_count THEN RAISE EXCEPTION 'schedule_provenance_incomplete'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_provenance) AS p(game_id uuid,schedule_run_id uuid)
    WHERE p.schedule_run_id IS DISTINCT FROM p_run_id OR NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_games) AS g(id uuid) WHERE g.id=p.game_id))
  THEN RAISE EXCEPTION 'schedule_provenance_outside_run'; END IF;
  INSERT INTO public.game_provenance(game_id,schedule_run_id,placement_pass,constraint_ids)
    SELECT x.game_id,p_run_id,'initial_assignment',x.constraint_ids
    FROM jsonb_to_recordset(p_provenance) AS x(game_id uuid,constraint_ids jsonb);
  UPDATE public.schedule_runs SET games_created=v_count WHERE id=p_run_id;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.sp_replace_schedule_drafts(uuid,jsonb,uuid[],jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sp_replace_schedule_drafts(uuid,jsonb,uuid[],jsonb,jsonb) TO service_role;
