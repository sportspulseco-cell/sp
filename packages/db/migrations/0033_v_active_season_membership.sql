-- P2-3 (part B) — single source of truth for "is this player rostered
-- for this season?". Materialises team_memberships filtered to
-- current_status='active' with an attribution column that resolves
-- which of the four paths put the player on the team:
--
--   1. team_join_requests (player applied → captain approved)
--   2. team_invites       (captain invited → player accepted)
--   3. free_agent_pool    (player listed → captain claimed)
--   4. admin_direct       (catchall — admin inserted directly /
--                          captain used Add player flow)
--
-- The view is keyed by membership_id so refresh-concurrently works
-- even if a (person, season) shows up twice across historical rows
-- (only active rows are included, but uniqueness on membership_id
-- is the safest invariant).
--
-- Refresh:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY v_active_season_membership;
-- Hit by POST /admin/views/v-active-season-membership/refresh from
-- the application (SuperAdminGuard) — see communications retry-
-- failed cron for the pattern.
--
-- Idempotent: DROP IF EXISTS + CREATE so reruns rebuild cleanly.

DROP MATERIALIZED VIEW IF EXISTS v_active_season_membership;

CREATE MATERIALIZED VIEW v_active_season_membership AS
SELECT
  tm.id                AS membership_id,
  tm.person_id,
  tm.season_id,
  tm.team_id,
  tm.membership_type,
  tm.effective_from,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM team_join_requests j
       WHERE j.team_id           = tm.team_id
         AND j.player_person_id  = tm.person_id
         AND j.season_id         = tm.season_id
         AND j.status            = 'approved'
    ) THEN 'team_join_request'
    WHEN EXISTS (
      SELECT 1
        FROM team_invites i
        JOIN persons p ON p.user_id = i.accepted_by_user_id
       WHERE i.team_id   = tm.team_id
         AND i.season_id = tm.season_id
         AND i.status    = 'accepted'
         AND p.id        = tm.person_id
    ) THEN 'team_invite'
    WHEN EXISTS (
      SELECT 1 FROM free_agent_pool_entries f
       WHERE f.player_person_id = tm.person_id
         AND f.season_id        = tm.season_id
         AND f.placed_team_id   = tm.team_id
         AND f.status           = 'placed'
    ) THEN 'free_agent'
    ELSE 'admin_direct'
  END AS source,
  tm.created_at,
  tm.updated_at
FROM team_memberships tm
WHERE tm.current_status = 'active';

-- Unique on membership_id — required by REFRESH MATERIALIZED VIEW
-- CONCURRENTLY (Postgres needs a unique index to do a no-lock swap).
CREATE UNIQUE INDEX IF NOT EXISTS v_active_season_membership_pk
  ON v_active_season_membership (membership_id);

-- Lookup indexes — the natural query patterns are
-- "is this player rostered for this season" and
-- "who's on this team in this season".
CREATE INDEX IF NOT EXISTS v_active_season_membership_person_season_idx
  ON v_active_season_membership (person_id, season_id);

CREATE INDEX IF NOT EXISTS v_active_season_membership_team_season_idx
  ON v_active_season_membership (team_id, season_id);

CREATE INDEX IF NOT EXISTS v_active_season_membership_source_idx
  ON v_active_season_membership (source);
