-- Private regional substitute invitations. API authorization owns all
-- access; browsers cannot query subscription or recipient directories.
CREATE TABLE IF NOT EXISTS public.substitute_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  region_id uuid NOT NULL REFERENCES public.regions(id) ON DELETE CASCADE,
  positions text[] NOT NULL CHECK (cardinality(positions) BETWEEN 1 AND 5 AND positions <@ ARRAY['C','LW','RW','D','G']::text[]),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, region_id)
);
CREATE INDEX IF NOT EXISTS substitute_subscription_match_idx
  ON public.substitute_subscriptions(org_id,region_id) WHERE enabled;
CREATE TABLE IF NOT EXISTS public.substitute_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key uuid NOT NULL UNIQUE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  region_id uuid NOT NULL REFERENCES public.regions(id) ON DELETE RESTRICT,
  position text NOT NULL CHECK (position IN ('goalie','skater','any')),
  needed smallint NOT NULL CHECK (needed BETWEEN 1 AND 10),
  filled smallint NOT NULL DEFAULT 0 CHECK (filled >= 0 AND filled <= needed),
  note text NOT NULL DEFAULT '' CHECK (length(note)<=500),
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected','cancelled','filled')),
  requested_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS substitute_broadcast_open_idx ON public.substitute_broadcasts(game_id,team_id)
  WHERE status IN ('pending_review','approved');
CREATE INDEX IF NOT EXISTS substitute_broadcast_season_idx ON public.substitute_broadcasts(season_id,status);
CREATE TABLE IF NOT EXISTS public.substitute_broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.substitute_broadcasts(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','accepted','declined','closed')),
  attendance_id uuid REFERENCES public.game_attendance(id) ON DELETE SET NULL,
  answered_at timestamptz,
  UNIQUE (broadcast_id,person_id)
);
CREATE INDEX IF NOT EXISTS substitute_broadcast_person_idx ON public.substitute_broadcast_recipients(person_id,status);
ALTER TABLE public.substitute_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substitute_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substitute_broadcast_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.substitute_subscriptions,public.substitute_broadcasts,public.substitute_broadcast_recipients FROM anon,authenticated;
GRANT ALL ON public.substitute_subscriptions,public.substitute_broadcasts,public.substitute_broadcast_recipients TO service_role;
