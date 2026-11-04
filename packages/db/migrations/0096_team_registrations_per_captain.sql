-- 0096: a captain may hold several team registrations in one season.
--
-- registrations_active_uniq (0032) allowed one live registration per
-- person and season. A team registration's subject is the captain, so a
-- captain registering a second team in the same season was refused
-- ("the existing registration must be completed first"; PPHL, 3 Nov
-- 2026). The player paths keep one live registration per person and
-- season; team registrations are excluded from the index. The API's
-- idempotency key now carries the team name, and it refuses the same
-- captain registering the same team name twice in a season.
--
-- Only relaxes the index, so existing rows always satisfy it. Idempotent.

DROP INDEX IF EXISTS registrations_active_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS registrations_active_uniq
  ON registrations (subject_person_id, season_id)
  WHERE status NOT IN ('rejected','withdrawn','cancelled')
    AND season_id IS NOT NULL
    AND coalesce(metadata->>'submissionType', 'individual') <> 'team';
