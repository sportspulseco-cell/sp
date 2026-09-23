-- The captain join-request table was present in the schema but absent from
-- the migration history. Create it before 0030 tightens season_id.
CREATE TABLE IF NOT EXISTS public.team_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  player_person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending',
  message text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_join_status_check CHECK (status IN ('pending','approved','rejected','withdrawn'))
);

CREATE INDEX IF NOT EXISTS team_join_team_idx ON public.team_join_requests(team_id);
CREATE INDEX IF NOT EXISTS team_join_player_idx ON public.team_join_requests(player_person_id);
CREATE INDEX IF NOT EXISTS team_join_status_idx ON public.team_join_requests(status);
CREATE UNIQUE INDEX IF NOT EXISTS team_join_pending_uniq
  ON public.team_join_requests(team_id, player_person_id, season_id)
  WHERE status = 'pending';
