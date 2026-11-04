-- Rollback 0096: one live registration per person and season again,
-- team registrations included (as in 0032). Fails if a captain already
-- holds two live team registrations in one season; end one of them
-- first (withdraw or cancel), then rerun.

DROP INDEX IF EXISTS registrations_active_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS registrations_active_uniq
  ON registrations (subject_person_id, season_id)
  WHERE status NOT IN ('rejected','withdrawn','cancelled')
    AND season_id IS NOT NULL;
