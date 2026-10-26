-- 0070_schedule_blackouts.sql
-- FR-3.8.4 blackout dates for the schedule generator. An admin enters
-- days (or ranges) when no regular-season game may be placed, for the
-- whole season or for one rink, on the schedule generate page.
-- scheduler-generate leaves every ice slot on those days out before the
-- CP-SAT solve and reports how many it left out.
--
-- * schedule_blackouts: start_date..end_date inclusive, read in the
--   season's time zone; surface_id NULL = every rink.
-- * RLS on, no policies (same stance as 0050): the API connects as
--   postgres and the edge functions as service_role.
--
-- Additive and idempotent. Rollback: 0070_schedule_blackouts.rollback.sql.
-- Drizzle: packages/db/src/schema/scheduling.ts (scheduleBlackouts).

CREATE TABLE IF NOT EXISTS public.schedule_blackouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  season_id uuid NOT NULL,
  surface_id uuid,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  created_by_user_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE public.schedule_blackouts
    ADD CONSTRAINT schedule_blackouts_season_id_seasons_id_fk
    FOREIGN KEY (season_id) REFERENCES public.seasons(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.schedule_blackouts
    ADD CONSTRAINT schedule_blackouts_surface_id_surfaces_id_fk
    FOREIGN KEY (surface_id) REFERENCES public.surfaces(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.schedule_blackouts
    ADD CONSTRAINT schedule_blackouts_created_by_user_id_users_id_fk
    FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.schedule_blackouts
    ADD CONSTRAINT schedule_blackout_dates_check CHECK (end_date >= start_date);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS schedule_blackout_season_idx
  ON public.schedule_blackouts USING btree (season_id);

ALTER TABLE public.schedule_blackouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schedule_blackouts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.schedule_blackouts FROM authenticated;
