# Setup cluster bug log (J1, J2, J17)

Tester: setup cluster agent, 2026-10-23. Target: STAGING only
(staging-superadmin / staging-league / staging-org / staging-team /
staging-player, staging Supabase). Specs:
`tests/e2e/journeys/j01-setup.spec.ts`, `j02-invite.spec.ts`,
`j17-isolation.spec.ts`. Run with
`E2E_OUTPUT_DIR=test-results-setup bash <scratchpad>/e2e-staging.sh tests/e2e/journeys/<spec> --reporter=line --workers=1`.

Every spec is `describe.serial`. Bug checks are collected (not thrown)
so the journey keeps walking; the last test of each file fails and
lists every finding. Every row created carries the RUN_TAG
(`E2E…`) in its name. Invitee accounts were created through the
super_admin "Invite user" dialog's own "Also set initial credentials"
option (not the admin API): `staging-e2e+<tag>-{oa,la,cap,magic}@sportspulse.us`.

Evidence logs (console output of each run) are in the session
scratchpad `setup/` folder; screenshots under `test-results-setup/`.

---

[SETUP-6] Create team fails with 500 when "Home rink" is left blank, but the team row is still written · blocker
  Journey: J1 · UC-33 (team setup), M4
  Surface: superadmin-web /teams/new
  Repro:
    1. Sign in as super_admin, Teams → New team.
    2. Pick an organisation, type a team name, pick Ice Hockey. Leave "Home rink" empty (the field says "Optional").
    3. Click Create team.
    4. Click Create team again (what an admin does after an error).
  Expected: team is created, page goes to /teams/<id>.
  Actual: POST /api/league/teams → 500, page shows "An unexpected error occurred". The team row IS in the DB (1 row). Retry → 409 "A team with this name already exists in this organisation." With "Home rink" filled the same form returns 201. Reproduced in 4 of 4 runs.
  Evidence: http 500 POST https://staging-api.sportspulse.us/api/league/teams; db-row `select id from teams where org_id=$1 and name=$2` → 1 row after the 500; retry 409 text (j01 logs run5..run9).
  Root cause: apps/superadmin-web/src/app/(admin)/teams/new/new-team-form.tsx:142,153 sends `homeRink: null` when blank. apps/superadmin-api/src/modules/league-management/interface/teams.controller.ts:175-192 treats anything `!== undefined` as "set", and runs `jsonb_set(external_ids, '{homeRink}', to_jsonb(NULL::text))`, which returns NULL; `teams.external_ids` is NOT NULL (packages/db/src/schema/league.ts:367) so the UPDATE throws. The core team insert (createH.execute, line 163) already committed in a separate statement, so the request is not atomic. The PATCH path (lines 238-254) has the same jsonb_set bug.
  Proposed fix: in the teams controller, run create + extension update + captain assignment in one transaction, and build external_ids with `coalesce(external_ids,'{}') || jsonb_strip_nulls(jsonb_build_object('homeRink', $1))` (or skip when null). Same change on PATCH.

[SETUP-15] league_admin sees, and can open, seasons of OTHER leagues in the same org · major
  Journey: J17
  Surface: staging-league (superadmin-web) /seasons and /seasons/[id]
  Repro:
    1. As super_admin, create a second league "A Sibling <tag>" with a season in the staging org (PPHL Staging) via Org setup.
    2. Sign in as staging-league@ (league_admin scoped to "PPHL Staging League" only) on staging-league.sportspulse.us.
    3. Open /seasons. Then open /seasons/<sibling season id> directly.
  Expected: only seasons of PPHL Staging League; the sibling season detail is not-found.
  Actual: /seasons lists "A Sib Season <tag>" (DOM) and the season name + id are in the RSC payload; /seasons/<id> renders the sibling season. Org B rows never leak (checked on 11 pages + 5 direct URLs). /leagues and /leagues/<sibling id> correctly hide the sibling league, so the two endpoints disagree. Reproduced in 2 of 2 runs.
  Evidence: dom text + payload (j17-run1, j17-run2: "league_admin@LA /seasons -> 200 · dom leaks=1 · payload leaks=2"; "GET /seasons/<sib> -> name in DOM=true").
  Root cause: apps/superadmin-api/src/shared/auth/scope.ts:96-103,167-175 adds the parent org of every league assignment to `scope.orgIds` (projectedOrgIdsFromLeagues). seasons.controller.ts list/getOne pass that orgIds as `orgIdsFilter`, and both drizzle-season.repository.ts:42-56 and application/seasons/handlers.ts:97-105 OR it with the league filter. So a league-scoped role gets org-wide season visibility. The same union exists in drizzle-team.repository.ts:60-71 (teams list) and in GetDivision (divisions.controller.ts getOne), so league_admin can probably reach org-wide teams/divisions too (not proven: the sibling league had no teams, and its division did not show in /divisions in this run).
  Proposed fix: in loadUserScope keep two sets, `orgIds` (direct org-level grants, used as a visibility filter) and `parentOrgIds` (derived, for display/navigation only). Repositories must OR only the direct org grants. One change in scope.ts plus the season/team/division repositories; add a league_admin case to the scope unit tests.

[SETUP-10] No way to add a season to an existing league, or a division to an existing season · major
  Journey: J1
  Surface: superadmin-web /seasons ("New season → Org setup"), /divisions ("New division → Org setup"); same in org-admin-web
  Repro:
    1. super_admin → Seasons → "New season → Org setup".
    2. Pick the org, Next.
  Expected: step 2 lets the admin pick the existing league (next year's rollover) and only asks for the season.
  Actual: step 2 is "Frame the league." with a free-text "League name" input and no league picker. Publishing creates a NEW league. There is no other UI that calls createSeason/createDivision.
  Evidence: dom (j01 test 5b: existingLeaguePicker=0, leagueNameIsFreeText=true).
  Root cause: packages/admin-pages/src/org-setup/org-setup-wizard.tsx:262 always calls createLeague, then createSeason/createDivision on that new league. apps/superadmin-web/src/app/(admin)/seasons/page.tsx:39 and divisions/page.tsx:74 point their "New …" CTA at this create-everything wizard. The API supports POST /league/seasons and POST /league/divisions for an existing parent.
  Proposed fix: give the shared OrgSetupWizard an "existing league" mode (step 2 = league picker, prefilled from ?leagueId) and an "add division" mode (step 4 only, for ?seasonId). Point the Seasons/Divisions CTAs and the league/season detail pages at those modes.

[SETUP-2] Org, league, season, division and team cannot be edited after creation · major
  Status 25 Oct: partly fixed. League, season, division and organisation edit in place (blockers-oct24-b item 2, staging).
    Team: still no edit control on the admin team page (superadmin and org consoles share TeamDetail,
    packages/admin-pages/src/team-detail.tsx); the API has updateTeam and captains edit their own team in the captain console.
    Found by J1 step 5 on deployed staging c280304 (first run that reached it).
  Fix (26 Oct): Edit team on the team page in the admin and org consoles (shared EditTeamButton: team name, short name,
    home rink, logo URL, colours, confirmation threshold; sport, org and captain stay as they are). The API let only
    super admins and the team's captain edit, so org admins got 403 on their own org's teams; it now allows an org-level
    team.* grant on the team's org (all fields), keeps captains to branding, and answers 404 out of scope.
    "Threshold (USD)" is now "Confirmation threshold (USD)", the term the team page uses.
  Evidence: local apps against staging, regfa/walk-team-edit.mjs 11/11 (super admin edit + page shows values; org admin
    edits own org's team; other org's team 404 and unchanged; captain branding 200, threshold 403, other team 404).
  Journey: J1
  Surface: superadmin-web /organizations/[id], /leagues/[id], /seasons/[id], /divisions/[id], /teams/[id] (org-admin-web mounts the same shared detail components)
  Repro:
    1. Create a league with the wizard.
    2. On /leagues/<id> click "Edit in Org setup →".
    3. Open the season, division, team, org detail pages and look for an edit / rename / change dates control.
  Expected: rename the league, fix season dates / registration window / roster lock, rename a division, edit a team, edit an org.
  Actual: "Edit in Org setup →" (league and division) opens the blank 4-step create wizard with nothing prefilled. Season, team and org detail pages have no edit control at all. Season status is the only editable field.
  Evidence: dom (j01 test 5, 5 findings, every run).
  Root cause: packages/admin-pages/src/league-detail.tsx:92-97 and division-detail.tsx:162-167 render `editHref`, which apps/superadmin-web/src/app/(admin)/leagues/[id]/page.tsx and divisions/[id]/page.tsx set to "/org-setup". SDK methods updateLeague (packages/api-client/src/sdk.ts:1368), updateSeason (1313), updateTeam (1448) and PATCH /orgs/:id (orgs.controller.ts:86) exist but no admin page calls them (updateSeason is only reachable inside /forms/[id] DivisionsClient; updateTeam only from the captain's team-admin-web).
  Proposed fix: add one shared edit dialog per entity in @sportspulse/admin-pages (reusing the wizard step components as the form body) wired to the existing PATCH endpoints; mount it on both apps' detail pages through the existing slot props.

[SETUP-14] Admin lists and scope pickers silently stop at 25 rows · major
  Journey: J1 (also affects J2 pickers)
  Surface: superadmin-web /leagues, /seasons, /divisions, /teams; Invite user + Assign role scope pickers
  Repro:
    1. Have more than 25 divisions (staging has 41 now).
    2. Create a new division and open /divisions.
  Expected: every row is reachable (paging or "load more"), and KPI tiles count all rows.
  Actual: exactly 25 rows render, ordered by uuid, so a just-created row is randomly missing ("/divisions renders 25 of 41 rows; new row 'Div A …' missing", "/seasons renders 25 of 30"). "Total divisions" tile says 25. The org_admin-created league was missing from super_admin /leagues in 2 runs.
  Evidence: dom row count vs db count (j01-run8, j01-run9, test 3 and 7).
  Root cause: packages/kernel/src/pagination.ts:14 DEFAULT_LIMIT=25; the list pages call listLeagues()/listSeasons()/listDivisions()/listTeams() with no limit and ignore nextCursor (apps/superadmin-web/src/app/(admin)/leagues/page.tsx:33, seasons/page.tsx:32, divisions/page.tsx:48-52, teams/page.tsx:21). apps/superadmin-web/src/components/resources/resource-picker.tsx:201-217 and components/roles/assign-role-panel.tsx:137-150 do the same, so a league/season/division/team past row 25 cannot be picked when inviting or assigning a role.
  Proposed fix: one shared paged-list helper (fetch all pages up to a cap, or server search) used by the list pages and both pickers; sort lists by name or created_at desc; compute KPI tiles from a count endpoint.

[SETUP-8] Invite email is never sent on staging; magic-link invite flashes "Invite sent" and can 500 · major
  Journey: J2
  Surface: superadmin-web /users → Invite user
  Repro:
    1. Invite user, no "set initial credentials", grant org_admin on PPHL Staging, Send invite.
    2. Repeat a few minutes later with another new email.
  Expected: the invitee receives an email with a link that lands on THEIR app; the dialog tells the truth about delivery.
  Actual: API returns emailDelivered=false, reason "RESEND_API_KEY not configured", but the flash says "Invite sent to … Message ready below for manual delivery too." The rendered message tells the invitee "We've also sent you a one-click sign-in link … you'll be asked to set a password". The invitee row has no password (`has_pw=false`), so they cannot use the email+password sign-in until that Supabase link arrives (arrival not verifiable from here). Second magic invite in the same hour: POST /api/iam/users/invite → 500, flash "An unexpected error occurred", no auth row.
  Evidence: http response body (emailDelivered/reason), auth.users row (invited_at set, email_confirmed_at null, has_pw false), http 500 (j02-run6, j02-run7).
  Root cause: apps/superadmin-web/src/components/users/invite-user-button.tsx:155-160 picks the flash text from `created`/`setPwd` only and ignores `emailDelivered`. apps/superadmin-api/src/shared/notifications/email-dispatcher.service.ts:55 is in log-only mode because RESEND_API_KEY is unset on staging. apps/superadmin-api/src/shared/auth/supabase-admin.service.ts:81-88 calls inviteUserByEmail with no redirectTo (link goes to the Supabase Site URL, not the invitee's app) and rethrows any Supabase error as a plain Error, which Nest turns into a generic 500. The 500's Supabase message was not visible from the browser; Supabase's default-SMTP email rate limit is the likely cause (unverified).
  Proposed fix: flash must branch on emailDelivered ("Email not sent, copy the message below"); pass `redirectTo: <role app>/auth/callback` from the role's app; map Supabase auth errors to 4xx with the provider message (shared SupabaseAdminService); set RESEND_API_KEY on staging or label staging as "manual delivery only".

[SETUP-17] Role editing on the super_admin row shows "no role" until per-row fetches finish · minor
  Journey: J2
  Surface: superadmin-web /users (Type cell "Change user type", User actions → Edit role profile)
  Repro:
    1. Open /users and click the SUPER ADMIN type badge right away.
    2. Open /users, User actions → Edit role profile right away.
  Expected: role dropdown defaults to Super Admin; profile dialog opens the Super Admin profile.
  Actual: quick click → "Select a role..." and "User has no role assigned yet — assign a type from the user row first." After waiting for network idle both are correct ("Super Admin", "Edit profile · Super Admin"). /users/[id] is correct.
  Evidence: dom text, settled=false vs settled=true (j02-run7 test 6).
  Root cause: apps/superadmin-web/src/components/users/user-type-cell.tsx and user-actions-menu.tsx:36-48 derive the role from a per-row async iam.activeRolesForUser call (2 calls per row on /users) and start as null. AssignRolePanel (components/roles/assign-role-panel.tsx:100) captures defaultRoleCode in useState once, so a late value never applies. super_admin is a synchronous profile flag (`user.isSuperAdmin`) that both components already have.
  Proposed fix: resolve primary role on the server for the /users page (one query, pass it per row), and fall back synchronously to super_admin when `isSuperAdmin`; key AssignRolePanel on defaultRoleCode.

[SETUP-4] Season status menu offers transitions the server always rejects · minor
  Journey: J1
  Surface: superadmin-web /seasons/[id] status dropdown (shared SeasonStatusControl, also org-admin-web)
  Repro:
    1. New season (status draft). Open the status dropdown.
    2. Pick "Completed".
  Expected: only legal next states are offered (draft → registration_open | archived).
  Actual: all six statuses are offered; picking Completed shows "Cannot transition from draft to completed" (HTTP 422). Legal path draft → registration_open → in_progress → playoffs → completed works, badge updates without reload, DB matches each step.
  Evidence: dom option list, http 422 then 201 x4, db-row status after each step (all j01 runs).
  Root cause: packages/admin-pages/src/season-status-control.tsx:8-35 hardcodes all statuses; the rules live only in apps/superadmin-api/src/modules/league-management/domain/value-objects/season-status.vo.ts:13-20.
  Proposed fix: move SEASON_STATUSES + ALLOWED_TRANSITIONS to packages/kernel and have the control render only `ALLOWED_TRANSITIONS[current]`.

[SETUP-3] Sport defaults to "Australian Rules Football" on a hockey platform · minor
  Journey: J1
  Surface: superadmin-web /org-setup step 2 (shared wizard, also org-admin-web) and /teams/new
  Repro: open either form; read the Sport dropdown.
  Expected: default from context (the org's existing leagues are all HOCKEY_ICE) or an empty "Pick a sport…".
  Actual: "Australian Rules Football" selected (alphabetically first). CLAUDE.md "defaults must reflect context".
  Evidence: dom option:checked (all j01 runs).
  Root cause: packages/admin-pages/src/org-setup/org-setup-wizard.tsx:144 `defaultLeagueDraft(sports[0]?.code)`; apps/superadmin-web/src/app/(admin)/teams/new/new-team-form.tsx:66 `useState(sports[0]?.code)`.
  Proposed fix: default to the selected org's most common league sport, else "" (the wizard already renders "Pick a sport…" for "").

[SETUP-5] "Add another division" adds a collapsed card, Publish silently disabled · minor
  Journey: J1
  Surface: /org-setup step 4 (shared wizard)
  Repro: step 4, click "Add another division".
  Expected: the new card opens with "Division name" focused.
  Actual: the new card is collapsed ("Division 2", Expand button); Publish league and Save draft are disabled with no message until the admin finds and expands it.
  Evidence: dom (Expand button count 1 after add; all j01 runs).
  Root cause: packages/admin-pages/src/org-setup/steps/divisions-step.tsx:28-30 seeds the `expanded` set once from the initial divisions; onAdd never adds the new uid.
  Proposed fix: add the new uid to `expanded` when a division is added (lift expanded state or derive "expanded unless collapsed").

[SETUP-7] Invite dialog shows raw role and scope codes · minor
  Journey: J2
  Surface: superadmin-web /users → Invite user
  Actual: role options "super_admin — Super Admin", "org_admin — Org Admin" …; scope options "platform | org | league | season | division | team". Commit 057550a fixed readable labels only in AssignRolePanel.
  Evidence: dom option text (all j02 runs).
  Root cause: apps/superadmin-web/src/components/users/invite-user-button.tsx:264-288 renders the code; components/roles/assign-role-panel.tsx:27 has SCOPE_LABELS. Two role/scope pickers (Invite uses ResourcePicker, AssignRolePanel its own select) = silo.
  Proposed fix: one shared RoleScopePicker (role select + scope type + ResourcePicker) used by both dialogs, labels from packages/kernel.

[SETUP-13] Mojibake ("â€”") in invite emails, /roles, page titles · minor
  Journey: J2
  Surface: invite subject/signature (API), superadmin-web /roles (title "Roles â€” SportsPulse" and body), /teams title, team-admin-web layout ("loadingâ€¦")
  Actual: invite subject "You're invited to SportsPulse â€” Org Admin"; signature "â€” Staging Super Admin, on behalf of SportsPulse".
  Evidence: http response body, document.title, screenshot test-results-setup/journeys-j02-invite-…-profile-in-the-same-flow-chromium/test-failed-1.png.
  Root cause: 13 source files were saved double-encoded (UTF-8 bytes re-read as cp1252): invite-message.service.ts:79,80,97; iam.controller.ts:177; teams.controller.ts:411; superadmin-web roles/page.tsx:22,65,123,161,222; teams/page.tsx:18,98,106; team-admin-web (app)/layout.tsx:38, roster/page.tsx:101, middleware.ts; plus comments in games/team-invites/rosters controllers, scope.ts, db schema registration.ts.
  Proposed fix: one sweep that re-decodes those files (cp1252→UTF-8), plus a CI grep that fails on "â€".

[SETUP-9] User detail shows role scope as a UUID prefix · minor
  Journey: J2
  Surface: superadmin-web /users/[id] (also the Roles cell popover)
  Actual: "SCOPE: ORG · F7E62723 · SINCE OCT 23, 2026" instead of "PPHL Staging".
  Evidence: dom (j02 test 6).
  Root cause: apps/superadmin-web/src/app/(admin)/users/[id]/page.tsx:132 and components/users/manage-user-roles-cell.tsx:121 print `scopeId.slice(0, 8)`.
  Proposed fix: have activeRolesForUser return scopeLabel (join org/league/season/division/team name server-side) and render it.

[SETUP-16] New venue defaults: arbitrary org, UTC timezone, free-text IANA field · minor
  Journey: J1
  Surface: superadmin-web /venues → Add venue
  Actual: Organization defaults to the first org in API order ("PPHL E2EMVK785DH"), Timezone defaults to "UTC" for a US org whose default timezone is America/New_York; timezone is a free-text box.
  Evidence: dom (j01-venue.log).
  Root cause: packages/admin-pages/src/venues/venues-page.tsx:210-211.
  Proposed fix: default timezone from the selected org's defaultTimezone; timezone as a select of IANA zones; no org preselected when the admin has more than one.

[SETUP-11] Create organization: slug not derived from display name · minor
  Journey: J1
  Surface: superadmin-web /organizations → New organization
  Actual: Slug stays empty after typing Display name; the org setup wizard does derive slugs.
  Evidence: dom input value "" (all j01 runs).
  Root cause: apps/superadmin-web/src/components/orgs/create-org-button.tsx:45 (no slugify on displayName change). Country / currency / timezone are also free text (lines 150-195).
  Proposed fix: reuse the wizard's `slugify` from packages/admin-pages types (move to kernel) and selects for country/currency/timezone.

---

## Fixed during the round

- `tests/e2e/journeys/_helpers.ts` imported `../../playwright.config` (resolves to `tests/playwright.config`) so every journey spec failed to load. It now reads `../../../playwright.config`. My three specs carry their own helpers because they were written while it was broken.

## Gaps

Backend without UI
- PATCH /league/leagues/:id, /league/seasons/:id, /league/divisions/:id, /league/teams/:id, /orgs/:id: no admin edit screen (SETUP-2).
- POST /league/seasons and /league/divisions for an EXISTING parent: only reachable through the create-a-new-league wizard (SETUP-10).
- DELETE /league/seasons/:id (archive) and /league/divisions/:id: no button (status "Archived" is in the season menu only).
- PATCH /scheduling-inventory venues/surfaces/ice-slots (SDK updateVenue) not called by the venues page: a venue typo cannot be fixed (static check only, not clicked).

UI without backend
- Invite email: the dialog and message say an email was sent; on staging no email is sent by SportsPulse (RESEND_API_KEY unset) (SETUP-8).
- League "Unique ID (slug)", branding and privacy in the wizard are stored only in league metadata; nothing reads them back on any page I opened (not proven unused).

PPHL use case not built / not provable
- No PPHL UC covers setup; the matrix lists J1/J2/J17 as prerequisites for everything else. Season rollover (UC-adjacent: "captain runs each season's rollover wizard") depends on SETUP-10.

## Evidence table

| Journey step | Verified (how, evidence kind) | NOT verified / Blocked (why) |
|---|---|---|
| J1.1 super_admin creates org from /organizations | Pass. Sidebar link → New organization dialog → row appears without reload (dom) + db-row orgs | Slug derivation fails (SETUP-11) |
| J1.2 Org setup wizard: league, season (dates, reg window, roster lock), 2 divisions, publish | Pass. Lands on /leagues/<id>; db-row league active, 1 season with roster_lock_at, divisions [A,B] | Defaults/collapsed card bugs (SETUP-3, SETUP-5) |
| J1.3 New rows in /leagues, /seasons, /divisions | Partial. Rows present in db; list shows only 25 rows (dom row count vs db count) | SETUP-14 |
| J1.4 Two teams via /teams/new | Fail then pass. Blank rink → 500 + orphan row (http, db-row); filled rink → 201 + detail page (dom) | SETUP-6 |
| J1.5 Edit org/league/season/division/team | Fail. No edit affordance or blank wizard (dom) | SETUP-2 |
| J1.5b Add a season to existing league | Fail. No league picker (dom) | SETUP-10 |
| J1.6 Season status transitions | Pass for legal path draft→registration_open→in_progress→playoffs→completed (http 201, badge dom without reload, db-row each step); illegal jump shows readable 422 message | Menu offers illegal options (SETUP-4) |
| J1.7 org_admin builds league in staging org via OA /org-setup; sees it in OA /leagues, /seasons, /divisions; SA sees it | Pass on OA (dom, fresh context on staging-org). SA sees it via detail page and ?seasonId filter | SA plain lists miss it (SETUP-14). 4x `OPTIONS https://staging-org.sportspulse.us/ → 400` console errors on OA, origin unknown |
| J1.8 Add venue | Pass after network idle (dom + db-row org). One earlier attempt (clicked Add venue right after navigation) left Create disabled with name visibly filled; not reproduced, root cause not found | Defaults (SETUP-16) |
| J2.1 Invite dialog pickers | Pass: org/league/team are searchable pickers (typed "PPH", match shown). Raw codes (SETUP-7) | |
| J2.2 Invite org_admin / league_admin / captain with password + profile in same dialog | Pass: 201, row appears without reload (dom), db user_role_assignments exactly `<role>/<scope>`; "Also set up the <role> profile now" renders 10-11 fields | Profile answers left empty; did not verify profile save content |
| J2.3 Magic-link invite | Partial: 1st 201 with emailDelivered=false; 2nd 500 | Email arrival and link landing not observable (no mailbox access) — Blocked |
| J2.4 Invitees sign in on own app (fresh context each) | Pass: org_admin → staging-org `/` and /leagues shows only PPHL Staging League; league_admin → staging-league /dashboard, /leagues 1 row; captain → staging-team `/` | |
| J2.5 /users Type column | Pass after load (ORG_ADMIN etc.) | |
| J2.6 Role editing on super_admin row | Fail on quick click, pass after idle (SETUP-17); /users/[id] default Super Admin pass; scope label UUID (SETUP-9) | |
| J2.7 /roles | Renders, lists roles; mojibake (SETUP-13) | |
| J17.1 Build org B (league/season/div/team) + sibling league in org A | Pass (dom + db ids) | |
| J17.2 org_admin on OA: 11 list pages, 4 direct org-B URLs | Pass: 0 org-B names/ids in DOM and 0 in any captured payload (API JSON, RSC, HTML); direct URLs show not-found (HTTP status of the not-found page is 200) | |
| J17.3 league_admin on staging-league: 11 list pages, 5 direct URLs | Fail on /seasons and /seasons/<sibling> (SETUP-15). Org B: 0 leaks | Teams/divisions within-org leak not proven (no sibling teams) |
| J17.4 org_admin signed in on superadmin-web | Allowed in by design (layout admits org_admin). 9 pages + org-B detail: 0 org-B leaks | |
| J17.5 Wrong-role sign-in: captain→SA, player→SA, captain→OA, league_admin→OA, captain→player-web | Pass: all land on /sign-in?error=wrong_role, direct URL also redirected; message readable ("For org admin accounts only…", "Restricted access") | player→team-admin not testable: staging-player also holds captain/team (dual-role fixture) |
