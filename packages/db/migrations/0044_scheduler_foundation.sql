-- 2026-05-27 — Scheduler foundation.
--
-- The data layer the constraint engine (greedy v1 → CP-SAT) solves
-- against, plus the provenance store that makes every placement
-- defensible. Design: doc/avario-reverse-engineering/scheduler-debate/
-- 00-synthesis-and-final-plan.md (layers 3 & 5).
--
-- New tables:
--   venues          — a facility (org-scoped)
--   surfaces        — a sheet/rink within a venue
--   ice_slots       — bookable (surface × start × duration) inventory
--   schedule_runs   — one row per generation; stores the FULL solution
--                     + seed + input_hash for determinism-by-persistence
--                     (locked decision #4 — CP-SAT may run multi-worker)
--   game_provenance — per-game placement trail (1:1 with games)
--
-- games extended with: slot_id, surface_id, schedule_run_id, locked_at,
--   locked_by_user_id, published_at, source, time_band. The new
--   `game_slot_uniq` partial index is the no-double-booking invariant
--   (one live game per slot). `locked_at` is the sacred invariant the
--   engine must never mutate.
--
-- Additive + idempotent. Not auto-applied to prod — commit + apply.

-- ---------- venues ----------

CREATE TABLE IF NOT EXISTS venues (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        text NOT NULL,
  address     jsonb NOT NULL DEFAULT '{}'::jsonb,
  timezone    text NOT NULL DEFAULT 'UTC',
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_org_idx ON venues (org_id);

-- ---------- surfaces ----------

CREATE TABLE IF NOT EXISTS surfaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  label       text NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS surface_venue_idx ON surfaces (venue_id);
CREATE UNIQUE INDEX IF NOT EXISTS surface_venue_label_uniq
  ON surfaces (venue_id, label);

-- ---------- ice_slots ----------

CREATE TABLE IF NOT EXISTS ice_slots (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface_id             uuid NOT NULL REFERENCES surfaces(id) ON DELETE CASCADE,
  season_id              uuid REFERENCES seasons(id) ON DELETE SET NULL,
  start_ts_utc           timestamptz NOT NULL,
  duration_min           smallint NOT NULL DEFAULT 60,
  tz                     text NOT NULL DEFAULT 'UTC',
  band                   text,
  hourly_cost_cents      integer NOT NULL DEFAULT 0,
  is_playoff_reservation boolean NOT NULL DEFAULT false,
  status                 text NOT NULL DEFAULT 'available',
  metadata               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ice_slot_status_check
    CHECK (status IN ('available','assigned','blocked','returned')),
  CONSTRAINT ice_slot_band_check
    CHECK (band IS NULL OR band IN ('early','mid','late'))
);
CREATE INDEX IF NOT EXISTS ice_slot_surface_idx
  ON ice_slots (surface_id, start_ts_utc);
CREATE INDEX IF NOT EXISTS ice_slot_season_idx ON ice_slots (season_id);
CREATE INDEX IF NOT EXISTS ice_slot_status_idx ON ice_slots (status);
-- Inventory half of the no-double-booking guarantee: at most one slot
-- per (surface, start). Interval overlap is an engine/Z3 audit concern.
CREATE UNIQUE INDEX IF NOT EXISTS ice_slot_surface_start_uniq
  ON ice_slots (surface_id, start_ts_utc);

-- ---------- schedule_runs ----------

CREATE TABLE IF NOT EXISTS schedule_runs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id              uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  division_id            uuid REFERENCES divisions(id) ON DELETE SET NULL,
  engine                 text NOT NULL DEFAULT 'cpsat',
  seed                   text NOT NULL,
  input_hash             text NOT NULL,
  constraint_snapshot    jsonb NOT NULL DEFAULT '{}'::jsonb,
  solution               jsonb NOT NULL DEFAULT '{}'::jsonb,
  objective_breakdown    jsonb NOT NULL DEFAULT '{}'::jsonb,
  games_created          integer NOT NULL DEFAULT 0,
  games_locked_preserved integer NOT NULL DEFAULT 0,
  status                 text NOT NULL DEFAULT 'queued',
  infeasibility_report   jsonb,
  duration_ms            integer,
  ran_by_user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ran_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_run_engine_check
    CHECK (engine IN ('cpsat','greedy')),
  CONSTRAINT schedule_run_status_check
    CHECK (status IN ('queued','running','completed','failed','partial'))
);
CREATE INDEX IF NOT EXISTS schedule_run_season_idx ON schedule_runs (season_id);
CREATE INDEX IF NOT EXISTS schedule_run_division_idx ON schedule_runs (division_id);
CREATE INDEX IF NOT EXISTS schedule_run_status_idx ON schedule_runs (status);

-- ---------- game_provenance ----------

CREATE TABLE IF NOT EXISTS game_provenance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  schedule_run_id uuid REFERENCES schedule_runs(id) ON DELETE SET NULL,
  placement_pass  text NOT NULL,
  constraint_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  candidate_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  balancing_delta jsonb,
  human_actor_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  override_reason text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_provenance_pass_check CHECK (
    placement_pass IN (
      'initial_assignment','balancing','conflict_resolution',
      'manual_import','manual_override','locked_import','bracket'
    )
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS game_provenance_game_uniq
  ON game_provenance (game_id);
CREATE INDEX IF NOT EXISTS game_provenance_run_idx
  ON game_provenance (schedule_run_id);

-- ---------- games: new scheduling columns ----------

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS slot_id            uuid,
  ADD COLUMN IF NOT EXISTS surface_id         uuid,
  ADD COLUMN IF NOT EXISTS schedule_run_id    uuid,
  ADD COLUMN IF NOT EXISTS locked_at          timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by_user_id  uuid,
  ADD COLUMN IF NOT EXISTS published_at       timestamptz,
  ADD COLUMN IF NOT EXISTS source             text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS time_band          text;

-- FKs (guarded — pg_constraint conname check)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'games_slot_id_fk') THEN
    ALTER TABLE games ADD CONSTRAINT games_slot_id_fk
      FOREIGN KEY (slot_id) REFERENCES ice_slots(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'games_surface_id_fk') THEN
    ALTER TABLE games ADD CONSTRAINT games_surface_id_fk
      FOREIGN KEY (surface_id) REFERENCES surfaces(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'games_schedule_run_id_fk') THEN
    ALTER TABLE games ADD CONSTRAINT games_schedule_run_id_fk
      FOREIGN KEY (schedule_run_id) REFERENCES schedule_runs(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'games_locked_by_user_id_fk') THEN
    ALTER TABLE games ADD CONSTRAINT games_locked_by_user_id_fk
      FOREIGN KEY (locked_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- source check
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_source_check') THEN
    ALTER TABLE games ADD CONSTRAINT game_source_check
      CHECK (source IN ('manual','generated','manual_import','manual_override'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS game_schedule_run_idx ON games (schedule_run_id);
CREATE INDEX IF NOT EXISTS game_locked_idx ON games (locked_at);
CREATE INDEX IF NOT EXISTS game_published_idx ON games (published_at);
-- No two live games may occupy the same slot — the no-double-booking
-- invariant enforced at the DB layer.
CREATE UNIQUE INDEX IF NOT EXISTS game_slot_uniq
  ON games (slot_id)
  WHERE slot_id IS NOT NULL AND status NOT IN ('cancelled','postponed');
