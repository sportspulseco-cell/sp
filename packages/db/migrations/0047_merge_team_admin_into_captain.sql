-- Merge the team_admin role into captain (repo owner directive
-- 2026-06-04: "team admin and captain roles are becoming too confusing,
-- best we merge them both into one captain role itself"). Captain
-- becomes the canonical team-scope admin: roster, lineups, invites,
-- store, dues, paperwork, comms. team_admin row is removed.
--
-- Steps (additive + idempotent per the CLAUDE.md migration rules):
--   1. Widen the captain role's permissions array to absorb team_admin's
--      surface (team.create + team.dissolve already covered by 'team.*').
--      Re-applies cleanly on a database where it's already been run.
--   2. Re-point every active user_role_assignments row currently
--      pointing at roles.code='team_admin' to roles.code='captain'.
--   3. Remove the team_admin roles row. Safe to run twice — uses an
--      EXISTS check.
--
-- Do NOT auto-apply to production from CI. Per CLAUDE.md, apply
-- manually via `mcp__supabase__apply_migration` or psql after explicit
-- confirmation.

-- 1. Captain role gets the team.* + management bundle that absorbed
--    team_admin's two extra permissions (team.create / team.dissolve).
UPDATE roles
SET permissions = '[
    "team.*",
    "roster.read",
    "roster.write",
    "lineup.write",
    "invite.issue",
    "invite.revoke",
    "free_agent.read",
    "free_agent.claim",
    "self.read"
  ]'::jsonb,
  description = 'Team-scope admin — runs roster, lineups, invites, store, dues, and team profile. Replaces the former team_admin role.',
  updated_at = now()
WHERE code = 'captain' AND is_system = true;

-- 2. Re-point existing assignments. NOT NULL-safe: skipped when either
--    role row is missing (fresh dbs that never seeded team_admin).
DO $$
DECLARE
  team_admin_id uuid;
  captain_id uuid;
BEGIN
  SELECT id INTO team_admin_id FROM roles WHERE code = 'team_admin' AND is_system = true;
  SELECT id INTO captain_id FROM roles WHERE code = 'captain' AND is_system = true;
  IF team_admin_id IS NOT NULL AND captain_id IS NOT NULL THEN
    UPDATE user_role_assignments
    SET role_id = captain_id
    WHERE role_id = team_admin_id;
  END IF;
END $$;

-- 3. Drop the team_admin row. Guarded so re-running is a no-op.
DELETE FROM roles WHERE code = 'team_admin' AND is_system = true;
