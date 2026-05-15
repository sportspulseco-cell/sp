-- Backlog #5 — game lineups table. Captain-managed pre-kickoff;
-- locked when game.status flips to in_play.
--
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS game_lineups (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id               uuid NOT NULL,
  team_id               uuid NOT NULL,
  lineup                jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_by_user_id  uuid,
  submitted_at          timestamptz,
  locked_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE game_lineups
    ADD CONSTRAINT game_lineups_game_id_fkey
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE game_lineups
    ADD CONSTRAINT game_lineups_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE game_lineups
    ADD CONSTRAINT game_lineups_submitted_by_user_id_fkey
    FOREIGN KEY (submitted_by_user_id) REFERENCES auth.users (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS game_lineup_game_team_uniq
  ON game_lineups (game_id, team_id);
CREATE INDEX IF NOT EXISTS game_lineup_game_idx ON game_lineups (game_id);
CREATE INDEX IF NOT EXISTS game_lineup_team_idx ON game_lineups (team_id);
