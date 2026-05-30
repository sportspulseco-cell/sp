-- 2026-05-27 — Schema for pains #2, #3, #4, #6.
--
-- New tables:
--   rink_integrations         — per-venue notification endpoint config
--                               (pain #2 — direct rink notify, no vendor chain)
--   rink_notification_outbox  — delivery log + retry surface (pain #2)
--   playoff_brackets          — bracket state + seed map (pain #3)
--   tournament_rounds         — round container for dynamic-tier tournaments
--                               (pain #4); also reusable for playoff rounds
--   tournament_tier_assignments — per-round per-team tier (upper/middle/lower)
--                               (pain #4)
--   parity_windows            — 2-week parity window with recommendations
--                               (pain #6)
--
-- Additive + idempotent. Not auto-applied to prod — commit + apply.

-- ---------- rink_integrations ----------

CREATE TABLE IF NOT EXISTS rink_integrations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  kind              text NOT NULL,
  endpoint_url      text,
  auth_header_name  text,
  auth_secret_ref   text,
  contact_email     text,
  active            boolean NOT NULL DEFAULT true,
  last_delivery_at  timestamptz,
  last_failure_at   timestamptz,
  failure_count     integer NOT NULL DEFAULT 0,
  circuit_state     text NOT NULL DEFAULT 'closed',
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rink_integration_kind_check
    CHECK (kind IN ('webhook','email','sportsengine','crossbar','horizon','manual')),
  CONSTRAINT rink_integration_circuit_check
    CHECK (circuit_state IN ('closed','open','half_open'))
);
CREATE INDEX IF NOT EXISTS rink_integration_venue_idx ON rink_integrations (venue_id);
CREATE INDEX IF NOT EXISTS rink_integration_active_idx ON rink_integrations (active);

-- ---------- rink_notification_outbox ----------

CREATE TABLE IF NOT EXISTS rink_notification_outbox (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id              uuid REFERENCES games(id) ON DELETE CASCADE,
  rink_integration_id  uuid NOT NULL REFERENCES rink_integrations(id) ON DELETE CASCADE,
  event_type           text NOT NULL,
  payload              jsonb NOT NULL,
  idempotency_key      text NOT NULL,
  status               text NOT NULL DEFAULT 'pending',
  attempt_count        integer NOT NULL DEFAULT 0,
  last_error           text,
  next_retry_at        timestamptz,
  delivered_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rink_notification_event_check
    CHECK (event_type IN ('game_scheduled','game_rescheduled','game_cancelled','game_postponed')),
  CONSTRAINT rink_notification_status_check
    CHECK (status IN ('pending','delivered','failed','dead_letter'))
);
CREATE UNIQUE INDEX IF NOT EXISTS rink_notification_idempotency_uniq
  ON rink_notification_outbox (idempotency_key);
CREATE INDEX IF NOT EXISTS rink_notification_status_idx
  ON rink_notification_outbox (status, next_retry_at);
CREATE INDEX IF NOT EXISTS rink_notification_integration_idx
  ON rink_notification_outbox (rink_integration_id);

-- ---------- playoff_brackets ----------

CREATE TABLE IF NOT EXISTS playoff_brackets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id           uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  division_id         uuid REFERENCES divisions(id) ON DELETE CASCADE,
  format              text NOT NULL DEFAULT 'single_elim',
  state               text NOT NULL DEFAULT 'pending',
  seed_map            jsonb NOT NULL DEFAULT '[]'::jsonb,
  slots               jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT playoff_bracket_format_check
    CHECK (format IN ('single_elim','double_elim','round_robin_consolation')),
  CONSTRAINT playoff_bracket_state_check
    CHECK (state IN ('pending','active','complete','archived'))
);
CREATE INDEX IF NOT EXISTS playoff_bracket_season_idx ON playoff_brackets (season_id);
CREATE INDEX IF NOT EXISTS playoff_bracket_division_idx ON playoff_brackets (division_id);
CREATE INDEX IF NOT EXISTS playoff_bracket_state_idx ON playoff_brackets (state);

-- ---------- tournament_rounds ----------

CREATE TABLE IF NOT EXISTS tournament_rounds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id     uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  round_index   integer NOT NULL,
  label         text,
  state         text NOT NULL DEFAULT 'pending',
  starts_at     timestamptz,
  ends_at       timestamptz,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_round_state_check
    CHECK (state IN ('pending','active','complete','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS tournament_round_uniq
  ON tournament_rounds (season_id, round_index);
CREATE INDEX IF NOT EXISTS tournament_round_state_idx ON tournament_rounds (state);

-- ---------- tournament_tier_assignments ----------

CREATE TABLE IF NOT EXISTS tournament_tier_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id    uuid NOT NULL REFERENCES tournament_rounds(id) ON DELETE CASCADE,
  team_id     uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  tier        text NOT NULL,
  reasoning   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_tier_check
    CHECK (tier IN ('upper','middle','lower'))
);
CREATE UNIQUE INDEX IF NOT EXISTS tournament_tier_round_team_uniq
  ON tournament_tier_assignments (round_id, team_id);
CREATE INDEX IF NOT EXISTS tournament_tier_team_idx
  ON tournament_tier_assignments (team_id);

-- ---------- parity_windows ----------

CREATE TABLE IF NOT EXISTS parity_windows (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id             uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  window_index          integer NOT NULL,
  start_date            date NOT NULL,
  end_date              date NOT NULL,
  review_due_date       date,
  state                 text NOT NULL DEFAULT 'pending',
  recommendations       jsonb NOT NULL DEFAULT '[]'::jsonb,
  decisions             jsonb NOT NULL DEFAULT '[]'::jsonb,
  applied_at            timestamptz,
  applied_by_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  schedule_run_id       uuid REFERENCES schedule_runs(id) ON DELETE SET NULL,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parity_window_state_check
    CHECK (state IN ('pending','review_open','applied','skipped','archived')),
  CONSTRAINT parity_window_dates_check
    CHECK (end_date >= start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS parity_window_season_index_uniq
  ON parity_windows (season_id, window_index);
CREATE INDEX IF NOT EXISTS parity_window_state_idx ON parity_windows (state);
