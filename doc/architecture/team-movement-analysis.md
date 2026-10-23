# Team movement across seasons, divisions, leagues and regions — structural analysis

Requested in SP-Changes item 8 (review call, 23 Oct 2026): "outline the
exact structural changes needed without writing the code yet. Tell me
what might break." This document answers that from the current code and
schema (`packages/db/src/schema`). No code has been written for it.

## 1. What already exists (the model is closer than it looks)

| Requirement term | Exists today as | Notes |
|---|---|---|
| Organization / Region | `orgs` + `org_relations` (parent → child org) | No "region" type; a region would be an org node under a parent org. |
| League → Season → Division | `leagues` → `seasons` (`league_id`) → `divisions` (`season_id`) | A division belongs to exactly one season. |
| **Master Team Profile** | `teams` (name, short name, colors, logo, `org_id`, sport, captain) | Global and season-independent already. |
| **Team Instance** | `division_team_entries` (team, division, entry status, dues invoice, deposit tracking, roster snapshot) | One row per team per division; a partial unique index allows only one live entry per (team, division). |
| Seasonal roster | `team_memberships` keyed by (team, person, **season**) | Season-scoped, not division-scoped. |
| Games | `games.home_team_id` / `away_team_id` → `teams.id`, plus `season_id`, `division_id` | Anchored to the master team plus the division, not to the entry. |
| Standings | `standings` unique on (league, **division**, team) | Because a division is one season, standings are already per season. |
| Player stats | `stat_lines` (game, person, team, season, league, division) | Per game; never stored as a team total. |
| Dues | master invoice on the entry, sub-invoices per player | Tied to the entry. |

There is no service that moves a team today. `modules/transfers` moves
**players** between teams; it does not move a team between divisions,
seasons, leagues or orgs.

## 2. Recommended direction (backward compatible)

Treat `division_team_entries` as the Team Instance instead of adding a
parallel table. Adding a second "team instance" table would leave two
sources of truth for the same fact (which division a team plays in),
which the "compatibility first" rule warns against.

All changes are additive: new nullable columns, new tables, new indexes.
No existing column is dropped, renamed or made NOT NULL.

### 2.1 Schema changes

| # | Change | Why |
|---|---|---|
| S1 | `division_team_entries.previous_entry_id uuid NULL → division_team_entries.id` | Links a moved or rolled-over instance to where it came from. History stays intact. |
| S2 | `division_team_entries.movement_kind text NULL` (`rollover`, `division_shift`, `league_migration`) | Says why the instance exists. |
| S3 | `division_team_entries.compliance_flags jsonb NOT NULL DEFAULT '{}'` | Rule C: "flag for billing / roster validation in the target league". |
| S4 | Add `'moved'` to `dte_entry_status_check` (constraint replaced by a superset) | The source instance of a mid-season shift ends as `moved` (not `withdrawn`), so reports can tell the two apart. |
| S5 | `games.home_entry_id`, `games.away_entry_id uuid NULL → division_team_entries.id` | Optional anchor of a game to the instance. Existing columns stay; old games keep working with null. |
| S6 | `standings.entry_id uuid NULL` + partial unique on `entry_id` where not null | Lets "reset standings" create a fresh row in the target division without touching the old one. The current unique (league, division, team) still holds because the division changes. |
| S7 | `team_org_moves` (team, from_org, to_org, moved_by, reason, moved_at) | Audit for Rule D; `teams.org_id` itself is updated in place. |
| S8 | Region: `orgs.kind text NULL` (`organization`, `region`) | Lets a region be an org node under a parent org (Massachusetts → New Hampshire is a move between two region nodes). Users' "Country/Region" filter (item 7) can then use it. |

### 2.2 Service layer (new, isolated)

A new `TeamMovementService` in `apps/superadmin-api/src/modules/team-movement/`
that only calls existing repositories and the shared books-style
transaction pattern. One transaction per move, idempotency key per
request, readback after write.

| Rule | Method | What it does |
|---|---|---|
| A. Rollover | `cloneTeamToNewSeason(teamId, targetDivisionId, { copyRoster })` | Validates the target division is in a later season, creates a new entry (`movement_kind=rollover`, `previous_entry_id`), optionally copies active `team_memberships` of the source season into the target season. Never touches the old season. |
| B. Division shift | `moveTeamToDivision(entryId, targetDivisionId, { resetStandings })` | Same season only. Pre-season (no games played): update the entry's `division_id`. Mid-season: close the source entry as `moved`, create a new entry, and with `resetStandings=true` start a 0-0-0 standings row in the target division. Player `stat_lines` are untouched either way. |
| C. League migration | `migrateTeamToLeague(entryId, targetDivisionId)` | Target division must be in another league. Creates a new entry with `compliance_flags` (fee schedule differs, roster rules to re-check), closes the source as `moved`. Dues are not moved automatically; the flag routes it to an admin. |
| D. Region / org move | `moveTeamToOrg(teamId, targetOrgId)` | Updates `teams.org_id`, writes `team_org_moves`, re-evaluates which admins can see the team (scope is computed from the org, so this is immediate). Refuses if the team has a live entry in a league of the old org unless forced, because that league's admins would lose sight of a team still playing for them. |

Validation that prevents orphans and corrupted history:
- Never update or delete a completed season's entry, games, standings or stat lines.
- Every move checks that the target division exists, is not archived, and belongs to the expected season/league.
- The roster cap of the target division is checked inside the transaction (same `SELECT … FOR UPDATE` pattern as the captain's add).
- Moves are refused while the team has a game `in_play`.

## 3. What might break (and how each is handled)

| Area | Risk | Mitigation |
|---|---|---|
| Captain pages | Several pick "the team's newest division entry" (`loadActiveSeason`, dues, free-agent pool before today's fix). A rollover or shift creates a newer entry, so those pages jump to it. | Same fix as the free-agent pool (live entries, not newest of any status); add a season switcher. |
| Scheduling | The scheduler loads teams by division entries with status in (applied, accepted, confirmed). A `moved` source entry drops out, which is correct; already-generated games still point at the old division. | Moves mid-season must re-run conflicts for both divisions; the service refuses a shift while generated-but-unpublished runs exist. |
| Standings recompute | **Already wrong today**: `recompute-standings.handler.ts` tallies every game in the league by team only and overwrites the division with the last game's division, so a team's record mixes seasons and divisions. Any division move makes this visibly worse. | Fix first, independent of movement: tally by (division, team), one standings row per division. Then a shift with reset=true is a clean new row; without reset, carry the tally over explicitly. |
| Unique index `dte_team_division_active_uniq` | Moving back to a division the team left earlier collides if the old entry is still live. | Source entries end as `moved` (excluded like withdrawn). |
| Dues and invoices | Master invoice hangs off the source entry. | Rule B keeps it (same season, same fee); Rule C flags for admin; never auto-moved. |
| Role scope | Captain role is team-scoped, so it survives every move. Org admins of the old org lose sight of a team moved under Rule D. | Intended; logged in `team_org_moves`. |
| Reports and stats | Use `stat_lines.team_id` + season. Unaffected. | — |
| Existing UI that reads `teams.org_id` | Lists by org update immediately after Rule D. | — |

## 4. Before writing any of it: the checkpoint

The review call asked for a checkpoint that lets both code and database
go back. Findings:
- **Code**: tag the commit before the change (`git tag pre-team-movement-<date>`) and keep the change on its own branch until verified on staging.
- **Database**: production currently has **no backups** (`supabase backups list` → empty, point-in-time recovery disabled). A database checkpoint therefore needs either a plan with daily backups / PITR turned on, or a manual `pg_dump` of production taken immediately before the migration. All changes above are additive, so rollback of code alone is safe, but data written through the new paths would remain.

## 5. Open questions for PPHL

1. Is a region always an org node (Massachusetts, New Hampshire) under one parent org, or a free label on an org? (Affects S8 and the Users "Region" filter.)
2. Mid-season division shift default: reset standings or carry them? 
3. League migration: should dues paid in the source league be credited automatically or always reviewed by an admin?
