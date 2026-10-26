-- 0076_substitute_requests.sql
-- UC-31 / FR-3.3.1 / FR-3.3.3: a captain asks a player to sub for one
-- game; the player accepts or declines; on accept the API adds them to
-- the game as a guest (game_attendance is_guest + roster_moves guest_add)
-- and points the request at that attendance row. A league admin may
-- assign a sub directly (roster_override = true).
--
-- * One open request per player per game (partial unique index): a
--   double click, or both teams asking the same player, cannot open two.
-- * log: append-only confirmation log [{ at, status, byUserId, note }].
-- * RLS on, no policies (same stance as 0050/0070): the API connects as
--   postgres.
--
-- Drafted with `drizzle-kit generate --name=substitute_requests`; the
-- draft also carried the baseline catch-up for 0057-0070 (already applied
-- by their own files), which is left out here.
-- Additive and idempotent. Rollback: 0076_substitute_requests.rollback.sql.
-- Drizzle: packages/db/src/schema/substitutes.ts (substituteRequests).

CREATE TABLE IF NOT EXISTS public.substitute_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  game_id uuid NOT NULL,
  team_id uuid NOT NULL,
  season_id uuid NOT NULL,
  substitute_person_id uuid NOT NULL,
  status text DEFAULT 'requested' NOT NULL,
  source text,
  roster_override boolean DEFAULT false NOT NULL,
  note text,
  cancel_reason text,
  requested_by_user_id uuid,
  decided_by_user_id uuid,
  decided_at timestamp with time zone,
  attendance_id uuid,
  log jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE public.substitute_requests
    ADD CONSTRAINT substitute_request_status_check
    CHECK (status IN ('requested','accepted','declined','cancelled','expired'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.substitute_requests
    ADD CONSTRAINT substitute_request_source_check
    CHECK (source IS NULL OR source IN ('free_agent','league_player'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.substitute_requests
    ADD CONSTRAINT substitute_requests_game_id_games_id_fk
    FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.substitute_requests
    ADD CONSTRAINT substitute_requests_team_id_teams_id_fk
    FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.substitute_requests
    ADD CONSTRAINT substitute_requests_season_id_seasons_id_fk
    FOREIGN KEY (season_id) REFERENCES public.seasons(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.substitute_requests
    ADD CONSTRAINT substitute_requests_substitute_person_id_persons_id_fk
    FOREIGN KEY (substitute_person_id) REFERENCES public.persons(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.substitute_requests
    ADD CONSTRAINT substitute_requests_requested_by_user_id_users_id_fk
    FOREIGN KEY (requested_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.substitute_requests
    ADD CONSTRAINT substitute_requests_decided_by_user_id_users_id_fk
    FOREIGN KEY (decided_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.substitute_requests
    ADD CONSTRAINT substitute_requests_attendance_id_game_attendance_id_fk
    FOREIGN KEY (attendance_id) REFERENCES public.game_attendance(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS substitute_request_open_uniq
  ON public.substitute_requests USING btree (game_id, substitute_person_id)
  WHERE status = 'requested';
CREATE INDEX IF NOT EXISTS substitute_request_game_idx
  ON public.substitute_requests USING btree (game_id, team_id);
CREATE INDEX IF NOT EXISTS substitute_request_person_idx
  ON public.substitute_requests USING btree (substitute_person_id, status);

ALTER TABLE public.substitute_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.substitute_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.substitute_requests FROM authenticated;
