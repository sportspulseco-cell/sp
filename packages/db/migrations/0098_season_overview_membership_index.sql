-- Season dashboards count unique rostered people without fetching every
-- membership page. Existing indexes start with team or person, not season.
CREATE INDEX IF NOT EXISTS team_membership_season_person_idx
  ON public.team_memberships (season_id, person_id);
