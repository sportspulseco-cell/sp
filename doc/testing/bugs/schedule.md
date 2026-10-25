# Schedule cluster bug log (J10, J11)

Tester: schedule cluster agent, 2026-10-23. Target: STAGING only
(staging-*.sportspulse.us, Supabase project `panwqcxwtugfqekxnqsr`).
Specs: `tests/e2e/journeys/j10-schedule.spec.ts`, `tests/e2e/journeys/j11-game-stats.spec.ts`.

Run commands (Git Bash):

```
E2E_OUTPUT_DIR=test-results-schedule     bash <scratchpad>/e2e-staging.sh tests/e2e/journeys/j10-schedule.spec.ts   --reporter=line --workers=1
E2E_OUTPUT_DIR=test-results-schedule-j11 bash <scratchpad>/e2e-staging.sh tests/e2e/journeys/j11-game-stats.spec.ts --reporter=line --workers=1
```

Both specs are a single test with `test.step`s and `expect.soft`, so one bug
does not hide the rest of the walk. Screenshots land in
`test-results-schedule/j10/` and `test-results-schedule-j11/j11/`.

Note for the coordinator: `tests/e2e/journeys/_helpers.ts` imports
`../../playwright.config`, which is one directory short from
`tests/e2e/journeys/` (should be `../../../playwright.config`). Any spec that
imports it fails with "Cannot find module". My two specs inline the same
helpers instead of importing it. I did not edit the shared file.

Staging data observed during the run: other testers create orgs, leagues and
teams in parallel (25+ teams, 25+ leagues). Some bugs below only show because
staging is no longer near-empty, which is also what PPHL production looks like.

---

```
[SCH-1] Scheduler (generate, publish, conflicts, runs, fairness, verify, playoffs, tournament, parity, notifications) · blocker
  Journey: J10 · UC-06, UC-07, UC-08, UC-09
  Surface: superadmin-web /scheduling/[seasonId]/* and org-admin-web /scheduling/[seasonId]/*
  Repro:
    1. super_admin → Schedule → "Staging 2026-27" → Generate.
    2. Keep defaults (Division "Open", 1 game per pair, 60 s), click Generate.
    3. Open each tab: Runs, Conflicts, Fairness, Verify, Playoffs, Tournament, Parity, Notifications.
    4. Repeat Generate as org_admin on staging-org.
  Expected: a schedule run (or a readable "need 2 teams / no ice slots" message).
  Actual: "REQUEST FAILED · Failed to send a request to the Edge Function" on Generate;
    "Load failed / Failed to send a request to the Edge Function" on all 8 tabs and on Playoffs → Generate.
    Console: "Access to fetch at 'https://panwqcxwtugfqekxnqsr.supabase.co/functions/v1/scheduler-generate'
    ... blocked by CORS policy: Response to preflight request doesn't pass access control check".
  Evidence: screenshots test-results-schedule/j10/03-generate.png, 04-tab-*.png, 07-org-generate.png;
    network: requestfailed net::ERR_FAILED. Preflight probe of every function under supabase/functions/
    on the staging project returns 404 {"code":"NOT_FOUND","message":"Requested function was not found"}
    (all 20 functions).
  Root cause: environment, not app code. None of supabase/functions/* (scheduler-generate, scheduler-publish,
    scheduler-*-list, rink-notifications-list, ...) is deployed to the staging Supabase project. The only CI
    workflow is .github/workflows/e2e.yml; there is no `supabase functions deploy` step anywhere, so staging
    (and any new project) never gets them. Secondary: packages/admin-pages/src/scheduling/scheduler-client.ts
    invoke() surfaces supabase-js's generic "Failed to send a request to the Edge Function", which tells the
    admin nothing about who is responsible. Not checked: whether production has them (prod is off-limits).
  Proposed fix: add a deploy step (supabase functions deploy --project-ref <ref> for every dir in
    supabase/functions) to the staging and prod release path, plus a post-deploy smoke that POSTs to
    scheduler-runs-list. In scheduler-client.invoke(), map FunctionsFetchError / 404 to
    "Scheduler service unavailable (SportsPulse). Try again later." so the error names the owner.
```

```
[SCH-2] Ice slots created on /venues are invisible to the scheduler · blocker
  Journey: J10 · UC-06
  Surface: superadmin-web /venues (also org-admin-web /venues, same shared component)
  Repro:
    1. /venues → Add venue (PPHL Staging) → Add surface "Rink A" → Single slot, 2 weeks out 19:00 → Create slot.
    2. Read back the slot row.
  Expected: the slot belongs to the season it is meant for, so scheduler-generate can place games in it.
  Actual: ice_slots.season_id = NULL for every slot created from the UI. The form has no season field.
  Evidence: db-row (stagingSql): season_id null for the RUN_TAG slot, every J10 run.
  Root cause: packages/admin-pages/src/venues/venues-page.tsx:547 (createIceSlot) and :655 (bulkIceSlots)
    never send seasonId; apps/superadmin-api/src/modules/scheduling-inventory/interface/scheduling-inventory.controller.ts:405
    and :477 store `body.seasonId ?? null`. supabase/functions/scheduler-generate/index.ts:139 loads slots with
    `.eq("season_id", body.seasonId)`, so UI-created slots are never inventory. Once SCH-1 is fixed, Generate would
    come back INFEASIBLE / no slots with rinks that look fully set up. Same filter in scheduler-generate at :185, :293, :321.
  Proposed fix: make Season a required picker (seasons of the venue's org) on the Single slot and Bulk weekly forms,
    and make seasonId required in CreateIceSlotDto / bulk DTO. Optionally let the scheduler also take slots with
    season_id NULL inside the season's date window. Add an "is playoff reservation" checkbox too (see SCH-3 gaps).
```

```
[SCH-18] Creating a team without a home rink returns 500 but still creates the team · blocker
  Journey: J10, J11 · UC-06 precondition (need 2+ teams)
  Surface: superadmin-web /teams/new
  Repro:
    1. /teams → New team. Organisation "PPHL Staging", Team name "<RUN_TAG> Wolves", Sport hockey. Leave Home rink empty.
    2. Click Create team.
    3. Click Create team again.
  Expected: team created, redirect to /teams/[id].
  Actual: POST /api/league/teams → 500 {"error":{"code":"INTERNAL_ERROR","message":"An unexpected error occurred"}};
    red banner "An unexpected error occurred". The team row already exists (external_ids = {}), so the retry gets
    409 "A team with this name already exists in this organisation."
  Evidence: http 500 then 409 (watchErrors), db-row: teams row present after the 500 (5 of 5 runs).
  Root cause: apps/superadmin-web/src/app/(admin)/teams/new/new-team-form.tsx:142 sends homeRink: null when blank.
    apps/superadmin-api/src/modules/league-management/interface/teams.controller.ts:175-184 treats null as "set"
    (`body.homeRink !== undefined`) and runs
    `jsonb_set(external_ids, '{homeRink}', to_jsonb(NULL::text))`. jsonb_set is STRICT, returns NULL, and
    teams.external_ids is NOT NULL (packages/db/src/schema/league.ts:367), so the UPDATE throws → unmapped
    error → 500. The team was inserted by createH.execute() just before (:163), outside any transaction,
    so the failure leaves an orphan. Same expression in PATCH at :246. (Root cause from code; the 500 and the
    orphan row are observed, the NOT NULL violation text is not visible because the filter hides it.)
  Proposed fix: in teams.controller create/update, skip the home-rink write when homeRink is null/blank (or use
    `external_ids - 'homeRink'`), and wrap insert + extension update + captain assignment in one db.transaction.
```

```
[SCH-20] New game team pickers show only 25 random teams · major
  Journey: J10, J11 · UC-07 fallback (manual fixture)
  Surface: superadmin-web /games → New game
  Repro:
    1. Have more than 25 teams on the platform (staging now does).
    2. /games → New game. Open Away team.
  Expected: every team in the selected league / org, searchable by name.
  Actual: 7-12 options; the team just created ("<RUN_TAG> Wolves" / "<RUN_TAG> Bears") is missing in every run.
    League picker defaults to "E2EMVK5XKS0 League" (first row), not the admin's league.
  Evidence: dom-snapshot / console: `team picker has 10 options; "E2EMVK7UPLA Wolves" present: false`.
  Root cause: apps/superadmin-web/src/app/(admin)/games/page.tsx:58 calls leagueMgmt.listTeams({}) with no limit and no
    filter. The API clamps to DEFAULT_LIMIT 25 (packages/kernel/src/pagination.ts:14) ordered by teams.id
    (drizzle-team.repository.ts:100), i.e. random. create-game-button.tsx then filters by sport only, never by league
    or org. Leagues come from the same unpaged call.
  Proposed fix: drive both pickers from the selected league (season → division → listTeams({ divisionId }) or
    { orgId }), use a type-ahead entity picker (shared @sportspulse/ui combobox) instead of a preloaded <select>,
    and default the league from the current filter (?leagueId) rather than array[0].
```

```
[SCH-22] Log event: Player picker is empty, goals cannot be attributed · blocker
  Journey: J11 · UC-11, UC-13
  Surface: superadmin-web /games/[id] → Log event
  Repro:
    1. Start play on a game where Staging Skaters (2 active rostered players) is home.
    2. Log event → Team "Skaters (home)" → Player.
  Expected: Staging Player and Staging Captain listed.
  Actual: only "— No specific player —"; hint "No persons found — leave blank for non-attributed events."
    Goal, assist and penalty were logged unattributed, so no stat line can be produced.
  Evidence: screenshot test-results-schedule-j11/journeys-*/test-failed-1.png (run 3), http 400
    GET /api/iam/persons?limit=200 (x3 per game page).
  Root cause: apps/superadmin-web/src/components/games/append-event-button.tsx:114 (deployed version) calls
    iam.listPersons({ limit: 200 }); ListPersonsQueryDto caps limit at 100 (apps/superadmin-api/src/modules/iam/interface/dto/person.dto.ts:46)
    → 400 → catch → []. games/[id]/page.tsx:54 had the same call. The working tree already changes both to
    limit: 100 (uncommitted, not on staging). That is still wrong: the dialog filters the FIRST 100 persons by
    roster membership, so on a real platform the rostered players are usually not in that page and the fallback
    shows all persons (any non-roster person can be credited).
  Proposed fix: return person names from roster.listMemberships (join persons server-side) and build the picker
    from that only; no global listPersons call. Sweep other `limit: 200` callers (communications, roles pages).
```

```
[SCH-12] Only super_admin can run a game; league admin / scorekeeper / referee get 403 · major
  Journey: J11 · UC-11, UC-12
  Surface: superadmin-web (league host) /games/[id] as league_admin
  Repro:
    1. Sign in at staging-league as staging-league@ (league_admin of PPHL Staging League).
    2. Open the J11 game, click Start play.
  Expected: league admin (and an assigned scorekeeper / referee) can start, log events, apply score, finalize.
  Actual: red banner "Write operations require super_admin (or a @AllowScopedWrite() handler that does its own
    row-level check)"; POST /api/games/<id>/start → 403. The buttons are shown anyway.
  Evidence: http 403 + screenshot test-results-schedule-j11/j11/03-league-admin-start.png.
  Root cause: apps/superadmin-api/src/modules/game-operations/interface/games.controller.ts:40 uses
    AuthorizedAccessGuard, which rejects every non-GET for non-super-admins
    (shared/auth/guards/authorized-access.guard.ts:47). events.controller.ts:29 and game-officials.controller.ts:32
    are SuperAdminGuard only. No handler is @AllowScopedWrite and there is no scorekeeper/referee permission check.
  Proposed fix: move these controllers to RolesGuard + @Scope with permissions from packages/kernel/src/permissions.ts
    (games.run / games.score / games.finalize) granted to league_admin and to the game's assigned official
    (game_officials row). Hide the action buttons when the scope lacks the permission. Also remove internal
    wording from the error ("@AllowScopedWrite()").
```

```
[SCH-13] Assists are never counted · major
  Journey: J11 · UC-11, UC-13
  Surface: superadmin-web /games/[id] → Log event
  Repro:
    1. Log event type "goal": the dialog has no assist field.
    2. Log a separate event type "assist" for a player.
    3. Finalize, Project stats.
  Expected: the assisting player gets assists +1, points +1.
  Actual: goal dialog has no assist picker (0 matching fields); the stat reducer ignores "assist" events.
  Evidence: dom (assistField count 0, all runs); code. Runtime stat_lines check was blocked by SCH-22
    (events could not carry a player).
  Root cause: apps/superadmin-web/src/components/games/append-event-button.tsx:15 offers "assist" as its own
    event type and never sends secondaryPersonIds. apps/superadmin-api/src/modules/stats/domain/reducers/reducer.ts:55-66
    counts assists only from goal.secondaryPersonIds and has no "assist" case.
  Proposed fix: goal dialog gets "Assist 1" / "Assist 2" pickers (roster of the scoring team) sent as
    secondaryPersonIds; drop "assist" from the event type list (or handle it in the reducer, not both).
```

```
[SCH-14] Penalties record 0 PIM; no infraction or minutes · major
  Journey: J11 · UC-11, UC-13, feeds UC-14 suspensions
  Surface: superadmin-web /games/[id] → Log event
  Repro: Log event → type "penalty" → there is no infraction, minutes, or minor/major choice.
  Expected: infraction (dropdown), minutes (2/4/5/10), stored and summed into PIM.
  Actual: penalty saved with attributes {}; the reducer adds 0 minutes for "penalty" without attributes.minutes.
  Evidence: dom (minutesField count 0); code.
  Root cause: append-event-button.tsx HOCKEY_TYPES has "penalty" only and no attributes input;
    reducer.ts:92-110 falls back to 0 for "penalty".
  Proposed fix: penalty form with infraction enum + minutes enum (from the league ruleset), sent as
    attributes { infraction, minutes }; reducer keeps current logic.
```

```
[SCH-17] Finalize does not update stats, standings, or notify anyone · major
  Journey: J11 · UC-12, UC-13
  Surface: superadmin-web /games/[id] → Finalize
  Repro: Start play → Apply score 1-0 → Finalize.
  Expected: scoresheet locked, stats and standings recomputed, players see them.
  Actual: game.status = completed, home_score 1 (db-row), but stat_lines for the game = 0 right after finalize;
    standings unchanged until an admin clicks "Project stats" on the game and "Recompute" on /stats standings.
    No confirmation or sign-off step (no dialog fired). The only notification is one row
    template_code game.finalized, recipient_person_id NULL, status "failed",
    payload {"homeTeam":"d4136494","awayTeam":"e9d8e16b",...} (UUID prefixes, not names).
    After a manual "Recompute" on /stats → Standings, PPHL Staging League shows Skaters GP 3 W 3 PTS 6 (correct
    for the 3 J11 games), so the standings math works once triggered by hand.
  Evidence: db-row readback after finalize (J11 runs 4, 6, 7); screenshot test-results-schedule-j11/j11/06-sa-standings.png;
    finalize confirmation dialog: none.
  Root cause: FinalizeGameHandler (apps/superadmin-api/src/modules/game-operations/application/games/handlers.ts:211-238)
    only saves the game and queues "game.finalized" with no recipient and team UUID prefixes as names
    (:229 `homeTeam: x.homeTeamId.slice(0, 8)`). ProjectStatsHandler and RecomputeStandingsHandler are only
    reachable from manual buttons (stats.controller.ts:99, :127).
  Proposed fix: in FinalizeGameHandler, in the same transaction, call the projection and standings recompute
    (or enqueue a durable job keyed on game id), queue per-recipient notifications with team names, and add a
    review/confirm step with the finalizer recorded (UC-12 digital sign-off).
```

```
[SCH-7] Manually created games never reach captain or player schedules · major
  Journey: J10 · UC-07, UC-08
  Surface: team-admin-web /schedule, player-web /schedule
  Repro:
    1. super_admin creates a game Staging Skaters vs <RUN_TAG> Wolves via /games → New game.
    2. Fresh context: captain staging-team@ → Schedule. Fresh context: player staging-player@ → Schedule.
  Expected: both show the upcoming game (UC-08 "team dashboards updated").
  Actual: both show "No games scheduled · Games appear once the league publishes the season schedule."
    The captain's /lineups page DOES list the same game (inconsistent).
  Evidence: screenshots test-results-schedule/j10/06-captain-schedule.png, 06-player-schedule.png; console
    "captain /lineups contains game: true".
  Root cause: team-admin-web/src/app/(app)/schedule/page.tsx:35 and player-web/src/app/(app)/schedule/page.tsx:87
    pass publishedOnly: true. games.published_at is only set by the scheduler-publish Edge Function (not deployed,
    SCH-1) and there is no publish action for hand-made games (no button on /games/[id], no API endpoint).
    team-admin-web lineups/page.tsx:49 omits publishedOnly.
  Proposed fix: add "Publish" for manual games (API POST /games/:id/publish setting published_at, or create manual
    games already published with an explicit "Save as draft" option), and use one shared query for "games my team
    can see" across schedule, lineups and stats.
```

```
[SCH-6] No way to move a game's time or rink (UC-07 manual override) · major
  Journey: J10 · UC-07, UC-21
  Surface: superadmin-web /games/[id]
  Repro: open a scheduled game; look for reschedule / edit time / change rink.
  Expected: edit date, time, rink with conflict check and "Force override".
  Actual: only Start play, Postpone, Cancel, Forfeit. No edit control.
  Evidence: dom (0 matching buttons).
  Root cause: games.controller.ts has no PATCH/reschedule route; the only slot move is
    scheduler-conflict-apply (Edge Function, SCH-1) reachable only from the Conflicts tab for an existing conflict pair.
  Proposed fix: POST /games/:id/reschedule { slotId | startTs, surfaceId, force } in game-operations with the
    slot uniqueness + team overlap checks reused from scheduler-core, a change-log row, and a game_rescheduled
    notification (UC-21); a "Reschedule" dialog with a venue/surface/slot picker on /games/[id].
```

```
[SCH-8] Publishing a schedule notifies nobody · major
  Journey: J10 · UC-08, UC-21
  Surface: player-web /notifications
  Repro: after the J10 game exists, open player /notifications in a fresh context.
  Expected: a schedule notification.
  Actual: "You're all caught up · No notifications yet."
  Evidence: screenshot test-results-schedule/j10/06-player-notifications.png.
  Root cause: even when deployed, supabase/functions/scheduler-publish/index.ts only sends a Realtime broadcast and
    rink webhooks (lines 29-70); it never writes `notifications` rows for captains, players or refs. Manual games
    have no publish path at all (SCH-7).
  Proposed fix: on publish (and on reschedule), enqueue per-person notifications through the API's
    NotificationService (one shared path), with in-app + email channels and retry, and log delivery status.
```

```
[SCH-4] Admin cannot put a team into a division · major
  Journey: J10 · UC-06 precondition
  Surface: superadmin-web /teams/[id], /divisions/[id]
  Repro: create a team (SCH-18 workaround), open it; open the division.
  Expected: an "Enter division" / "Add team" action for an admin.
  Actual: none. Division page says "Captains apply via /captain/register". Teams page says
    "Enter divisions via DivisionTeamEntry" (internal name). Staging division "Open" has 1 entered team,
    so the scheduler (needs 2) cannot run even after SCH-1.
  Evidence: dom (0 matching buttons); db-row: 1 division_team_entries row for the division.
  Root cause: division_team_entries are only inserted by captain flows (captain.controller.ts:716,
    captain-applications.controller.ts:396) and registration-v2. captain/register uses scope.teamIds[0]
    (team-admin-web/src/app/(app)/captain/register/[seasonId]/page.tsx:19), so a captain of 2 teams can only
    ever register the first one.
  Proposed fix: admin "Enter team in division" action on division detail (team picker → POST that writes the
    entry with status accepted), and a team selector instead of teamIds[0] in captain register.
```

```
[SCH-5] Manual "New game" form: no season/division, venue is free text · major
  Journey: J10 · UC-07
  Surface: superadmin-web /games → New game
  Repro: open New game.
  Expected: league → season → division pickers; venue/surface/slot picker from /venues; timezone from the venue.
  Actual: League select only; "Venue" is a free-text input (placeholder Optional); "Timezone" is free text.
    The created game has season_id NULL and division_id NULL (db-row), so it is missing from season views,
    standings by division, and season-scoped stats (ProjectStatsHandler resolves season from division).
  Evidence: dom + db-row.
  Root cause: apps/superadmin-web/src/components/games/create-game-button.tsx (form) and CreateGameInput in
    game-operations/application/games/handlers.ts:74 (no seasonId).
  Proposed fix: reuse the scheduling pickers: season + division required, venue/surface/slot picker that writes
    slot_id/surface_id (keeps the no-double-booking invariant), tz from the venue.
```

```
[SCH-3] Venues, surfaces and ice slots cannot be edited; venues cannot be deleted · major
  Journey: J10 · UC-06
  Surface: superadmin-web /venues
  Repro: create venue/surface/slot, look for edit or delete on each row.
  Expected: rename venue, change timezone, rename surface, edit slot time/band, delete venue.
  Actual: only Delete surface and Delete slot icons exist. A typo in a rink name is permanent from the UI.
  Evidence: dom (0 edit buttons, 0 delete venue buttons).
  Root cause: packages/admin-pages/src/venues/venues-page.tsx never calls api.updateVenue / deleteVenue /
    updateSurface / updateIceSlot, though the API has PATCH venues/:id (:261), DELETE venues/:id (:280),
    PATCH surfaces/:id (:319), PATCH ice-slots/:id (:499). Also the surface delete is a <button> nested inside
    the surface-row <button> (invalid HTML, venues-page.tsx:408-429).
  Proposed fix: inline edit + delete with confirm on each row, calling the existing endpoints.
```

```
[SCH-23] Captain lineup editor shows the roster of another season · major
  Journey: J11 · UC-11 precondition
  Surface: team-admin-web /lineups/[gameId]
  Repro:
    1. Staging Skaters has active members in "Staging 2026-27" (Staging Player, Staging Captain) and the captain
       is also rostered in two other seasons created by other test runs.
    2. Captain opens the lineup for a Staging Skaters game.
  Expected: the roster for the game's season.
  Actual: run 3 showed only "Staging Captain"; runs 4-5 showed Staging Captain + person 9950d592 (not on the
    Staging 2026-27 roster). Staging Player was never listed. Page title is "vs d4b2b854" (UUID, SCH-11).
  Evidence: screenshot test-results-schedule-j11/j11/02-lineup.png; db-row game_lineups.lineup starters
    [35e3cc26…, 9950d592…].
  Root cause: lineups/[gameId]/page.tsx:39 calls captain.roster.list(myTeamId) with no seasonId;
    captain-roster.controller.ts:121 then uses loadActiveSeason (:874-901), the season with the latest
    start_date among the team's division entries, not the game's season.
  Proposed fix: pass game.seasonId (and require it on games, SCH-5) to roster.list.
```

```
[SCH-24] Captain /stats shows nothing after finalized games · major
  Journey: J11 · UC-13
  Surface: team-admin-web /stats (captain staging-team@, fresh context)
  Repro: finalize a Staging Skaters game and Recompute standings (Skaters GP 3, PTS 6 on superadmin), then open
    captain /stats.
  Expected: division standings with Skaters highlighted, team stats.
  Actual: "No stats yet · Standings appear once finalised games hit the scoresheet."
  Evidence: dom (J11 runs 6, 7); db-row: standings row for Skaters in league 25add053… exists.
  Root cause: apps/team-admin-web/src/app/(app)/stats/page.tsx:38-46 picks
    leagueMgmt.listSeasons({ orgId })[0].leagueId, i.e. an arbitrary season of the org (staging now has several),
    not the league of the team's division entry. When it does find rows it prints s.teamId.slice(0, 8) as the
    team name (:80). There are no team or player stat lines on this page at all.
  Proposed fix: resolve league/division from the team's division entry for the active season (same helper the
    roster uses, fixed per SCH-23), show team names, and list per-player lines from stats.listLines({ teamId }).
```

```
[SCH-25] Standings division filter lists divisions of every league · minor
  Journey: J11 · UC-13
  Surface: superadmin-web /stats?tab=standings&leagueId=<PPHL Staging League>
  Actual: under "PPHL STAGING LEAGUE" the division chips include "Div A E2EMVK6AE2Y", "CAP0527 Div A", ... from
    other leagues.
  Evidence: screenshot test-results-schedule-j11/j11/06-sa-standings.png.
  Root cause: apps/superadmin-web/src/app/(admin)/stats/page.tsx:50 calls leagueMgmt.listDivisions({}) (comment
    at :46 says "for now show all divisions").
  Proposed fix: list divisions of the selected league's seasons only.
```

```
[SCH-9] Add venue: Create stays disabled while an org is shown as selected · minor
  Journey: J10 · UC-06
  Surface: superadmin-web /venues → Add venue
  Repro: open /venues and click Add venue right away; type a venue name.
  Expected: Create enabled (an organization is displayed in the select).
  Actual: Create disabled with no hint, every run; works only after cancelling and reopening. The default org is
    the first in the list (another tester's "PPHL E2EMVK…"), not the admin's org.
  Evidence: console "venue Create enabled after early open + name filled: false"; error-context dom.
  Root cause: packages/admin-pages/src/venues/venues-page.tsx:211 initialises orgId from ownableOrgs[0] once, at
    mount. superadmin-web/src/app/(admin)/venues/page.tsx loads orgs in a useEffect, so a form opened before that
    resolves keeps orgId "" while the <select> paints the first option.
  Proposed fix: sync orgId when ownableOrgs changes (useEffect) or render the select with an explicit
    "Choose organization" empty option; never default to array[0].
```

```
[SCH-10] New surface not shown in the open venue panel · minor (intermittent, 5 of 6 runs)
  Journey: J10 · UC-06
  Surface: superadmin-web /venues
  Repro: open a venue → Add surface "Rink A" → Create.
  Expected: Rink A listed under the venue.
  Actual: header changes to "1 SURFACES" but the body still says "No surfaces yet. Add one above." until the
    venue is collapsed and reopened.
  Evidence: screenshot (run 3) test-results-schedule/journeys-*/test-failed-1.png.
  Root cause: venues-page.tsx:321 onCreated only calls onChange() (reload venue list); VenueRow's surfaces are
    fetched in a useEffect keyed on isOpen/venue.id (:281-289), which does not re-run.
  Proposed fix: refetch surfaces in VenueRow after AddSurfaceForm succeeds.
```

```
[SCH-19] Duplicate-team guard loses its "Use existing team" link · minor
  Journey: J10 · SCH-18 follow-on
  Surface: superadmin-web /teams/new
  Repro: create a team name that already exists in the org.
  Expected: amber banner with "Use existing team" link.
  Actual: plain red "A team with this name already exists in this organisation." with no link.
  Evidence: dom, every run.
  Root cause: apps/superadmin-api/src/shared/filters/domain-exception.filter.ts:34 rewrites every HttpException body
    to { error: { code, message } }, dropping `errors[].existingTeamId` that teams.controller.ts:148-158 sets.
    The form (new-team-form.tsx:169-180) looks for parsed.errors. Same loss for any structured 409/422 (e.g.
    lineup_locked payloads).
  Proposed fix: pass through extra fields of object responses in the filter ({ error: { code, message, ...rest } })
    and read them from parsed.error in the client.
```

```
[SCH-11] Opponent shown as a UUID prefix on captain lineups · minor
  Journey: J11
  Surface: team-admin-web /lineups and /lineups/[gameId]
  Actual: row "MON, OCT 26, 2:30 PM vs 26b70021 SCHEDULED"; editor title "vs d4b2b854".
  Root cause: team-admin-web/src/app/(app)/lineups/page.tsx:93 and lineups/[gameId]/page.tsx:59,95 print
    opponentId.slice(0, 8).
  Proposed fix: resolve team names (getTeam or a names map), same as /schedule.
```

```
[SCH-15] Event log shows a UUID prefix instead of the player name · minor
  Journey: J11 · UC-11
  Surface: superadmin-web /games/[id] event log
  Root cause: apps/superadmin-web/src/app/(admin)/games/[id]/page.tsx:197 renders e.primaryPersonId.slice(0, 8).
    (Runtime check blocked: SCH-22 left every event without a player.)
  Proposed fix: map person ids to names (the page already builds personMap).
```

```
[SCH-16] Logging a goal does not change the score · minor
  Journey: J11 · UC-11
  Surface: superadmin-web /games/[id]
  Actual: score stays 0–0 after a goal event; it only changes through "Apply score". The two can disagree,
    and finalize trusts the manual score (db home_score 1 only after Apply score).
  Root cause: gameOps.appendEvent and ApplyScoreHandler are independent; no projection of goal events to score.
  Proposed fix: derive the score from goal events server-side (or validate on finalize that events and score match).
```

```
[SCH-21] Header text shows "CAPTAIN Â· 1 TEAM" · minor
  Journey: J10, J11
  Surface: team-admin-web header (all pages)
  Actual: mojibake "Â·" (UTF-8 middle dot read as Latin-1). player-web header renders "·" correctly.
  Evidence: screenshots 06-captain-schedule.png, 02-lineup.png.
  Root cause: a team-admin-web header/source file saved with a mis-encoded "·" (not located; grep for "Â").
  Proposed fix: fix the literal; add a lint for "Â" in source.
```

---

```
[SCH-26] Player inbox shows email delivery status and raw template codes · minor
  Journey: SCH-8 / MON-14 verification (25 Oct)
  Surface: player-web /notifications
  Repro: queue a game notice for a player whose email does not send; open Notifications as the player.
  Expected: the notice title, body and time.
  Actual: each card carried a FAILED / QUEUED / SENT pill (email plumbing), the time column read "queued",
    and rows written without a subject showed the code "payment.confirmed" as the title.
  Evidence: screenshot scratchpad regfa/evidence/sch8-player-inbox.png (deployed staging player app).
  Root cause: apps/player-web/src/app/(app)/notifications/notification-row.tsx rendered notif.status,
    fmt(sentAt) with "queued" fallback, and subject ?? templateCode.
  Fix: no status pill for players; time = sentAt or createdAt; title from the code in words.
```

## Gaps

Backend exists, no UI:
- Venue rename / timezone change / delete, surface rename, ice slot edit (API PATCH/DELETE exist, SCH-3).
- ice_slots.season_id, is_playoff_reservation, hourly_cost_cents: API accepts them, the Venues UI cannot set them.
  Playoff bracket generation (UC-09) needs playoff-reserved slots, so it cannot work from the UI even after SCH-1.
- Game officials: officialsForPerson / updateOfficialStatus have no caller; there is no referee app or
  "my assignments" page, so a referee cannot confirm (UC-30). Admin can assign by hand on /games/[id] (Assign
  button visible), not tested further.
- Standings recompute and stats projection exist only as manual buttons (SCH-17).

UI exists, backend missing or not reachable:
- Every /scheduling tab (Edge Functions not deployed on staging, SCH-1).
- Generate → Publish is the only publish path; nothing publishes a manual game (SCH-7).

PPHL use case not built:
- UC-07 manual override with conflict check and force override (SCH-6).
- UC-08 notifications to captains/players/refs on publish; calendar sync links. player-web /schedule has a
  one-off .ics download button (1 found), no subscribable iCal/Google feed; team-admin has none.
- UC-10 pickup game sessions: nothing beyond a 'pickup' value in the league format enum
  (packages/db/src/schema/league.ts:177). No table, route, or page.
- UC-11 offline caching, "add as sub", goalie changes, shots/saves UI per player beyond generic event types.
- UC-12 referee review, digital signature, send-back-to-scorekeeper; finalize is a single unconfirmed click by
  super_admin only.
- UC-21 change notifications.
- UC-30 automatic referee assignment.
- Org-admin parity: org-admin-web has /scheduling and /venues (same shared components, same SCH-1 failure) but no
  /games, so an org admin cannot create, run or finalize a game.

## Evidence table

| Journey step | Verified (how, evidence kind) | NOT verified / Blocked (why) |
|---|---|---|
| J10.1 Venues entry in sidebar | sidebar has `a[href="/venues"]` under Operations (dom) | |
| J10.1 Create venue + surface + slot | UI clicks, rows read back (dom, db-row) | slot not usable by scheduler (SCH-2) |
| J10.1 Edit/delete venue | dom: no controls (SCH-3) | |
| J10.2 Create team | 500 every run, orphan row (http-response, db-row, SCH-18) | |
| J10.2 Enter team in division | no admin control (dom, SCH-4) | captain apply path not walked (would change staging captain fixture) |
| J10.3 Generate schedule | clicked as super_admin and org_admin; request fails (screenshot, network) | generated games, conflicts, fairness: Blocked by SCH-1 |
| J10.4 Runs/Conflicts/Fairness/Verify/Playoffs/Tournament/Parity/Notifications tabs | each opened; all show Edge Function error (screenshot) | bracket generation (UC-09): Blocked by SCH-1 + SCH-3 gap |
| J10.5 Manual game (fallback) | created through dialog; season_id null (db-row) | team picker needed a labelled fixture injection of the new team's option (SCH-20) |
| J10.5 Reschedule (UC-07) | dom: no control (SCH-6) | |
| J10.5 Publish | dom: no publish for manual game (SCH-7) | publish of a generated run: Blocked by SCH-1 |
| J10.6 Captain /schedule, player /schedule (fresh contexts) | both empty (screenshot) | |
| J10.6 Player notification | empty (screenshot, SCH-8) | |
| J10.6 iCal | player /schedule has 1 download button (dom) | file contents not opened |
| J10.7 Org-admin scheduling parity | same pages, same failure (network, console CORS); org-admin /venues lists the venue super_admin created in PPHL Staging (dom, final run) | org-admin has no /games (gap) |
| J10.8 Captain has no Scheduling link | dom count 0 | |
| J11.2 Captain lineup | saved, readback game_lineups (dom "Saved.", db-row) | wrong season roster (SCH-23) |
| J11.3 League admin runs game | 403 (http-response, screenshot, SCH-12) | scorekeeper/referee roles: no such users/app |
| J11.4 Start play, lineup lock | POST start 201, page flips to LIVE (dom); lineup locked_at set (db-row) | |
| J11.4 Goal changes score | 0–0 after goal event (screenshot 04-events.png, SCH-16) | |
| J11.4 Goal/assist/penalty with players | dialog walked; player picker empty (screenshot, http 400, SCH-22) | attribution of the goal to the right player: Blocked by SCH-22 |
| J11.5 Finalize | completed, home_score 1 (db-row); no stat lines, no notification (db-row, SCH-17) | |
| J11.6 Project stats / standings / SA /stats / game-events | Project stats clicked, 0 lines (events unattributed); Recompute → standings Skaters GP 3 W 3 PTS 6 (screenshot, db-row); /game-events lists goal/assist/penalty (dom) | per-player numbers: Blocked by SCH-22 |
| J11.7 Captain /stats, player /stats | both "No stats yet" (dom); captain empty even with standings rows present (SCH-24) | player numbers: Blocked by SCH-22 |
| UC-10 pickup | code search only | not built |
| UC-30 referee | Assign button visible on /games/[id] | assignment flow not driven; no referee app |
