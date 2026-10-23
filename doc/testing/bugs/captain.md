# Captain cluster bug log (CAP-n)

Journeys J6 (free agent, UC-03), J7 (captain registers team, approval gate),
J8 (captain invites player, UC-04; join requests; roster; UC-33).
Tested 2026-10-23 on staging (`staging-*.sportspulse.us`), Playwright, real
browser contexts per role. Specs: `tests/e2e/journeys/j06-free-agent.spec.ts`,
`j07-team-application.spec.ts`, `j08-captain-invite.spec.ts`.
Evidence (screenshots + page text + JSON) lands in
`test-results-captain-evidence/j0N-<RUN_TAG>/`. Runs cited below:
`j07-CAP0625U` (after fix commits 86201c6/e4bb6a9 reached staging),
`j07-CAP0527` (before), `j08-CAPJ8D`, `j08-CAPJ8A`, `j06-CAPJ6E`, `j06-CAPJ6A`.

Fixture note: the free agent and the "plain player" are auth users created
with the staging Supabase admin API (self sign-up needs email confirmation on
staging), then given the `player` role by super_admin through
superadmin-web `/users/[id]`. Emails `staging-e2e+<tag>-fa@` / `-plain@`.

Shared-state note for other testers: the only staging team ("Staging
Skaters") is now entered in several RUN_TAG seasons (CAPxxxx, E2EMVK6ORTH),
including `confirmed` entries in both divisions of `CAP0527 Season` and
`CAP0625U Season` (CAP-2 bypass). Captain-side pages that pick "the newest
season" (CAP-7, CAP-8) now read those seasons, not Staging 2026-27.

Already reported elsewhere and fixed during this run (not re-filed): the
"CAPTAIN Â· 1 TEAM" / "â€”" mojibake in team-admin (SETUP-13, fixed in
e4bb6a9); notifications not persisting at all because `notifications.read_at`
had no migration (MON-2, fixed in 86201c6; 0 rows existed before ~00:21 UTC).

---

```
[CAP-1] Captain invite link has nowhere to land (UC-04 cannot complete) · blocker
  Journey: J8 · UC-04
  Surface: team-admin /captain/invites → invitee on every app host
  Repro:
    1. Sign in as captain (staging-team@) on staging-team. Sidebar → Invites.
    2. Kind "Generic team URL" → Create URL.
    3. Open the shown link on player, team, org, superadmin and landing hosts, signed out and signed in as a player.
  Expected: a host-qualified link; the invitee lands on an accept/decline page (log in or create account), accepts, completes registration, and is added to the roster.
  Actual: the form shows a host-less path "Team URL: /invite/<token>". Signed out, player/team/org/superadmin redirect to /sign-in?next=%2Finvite%2F<token>; landing returns 404. Signed in as a player, player-web /invite/<token> returns 404 "This page could not be found." Personal invites have the same problem: the email body (when one is queued) is "Click to register and pay your share: <raw token>" with no URL.
  Evidence: test-results-captain-evidence/j08-CAPJ8D/21-invite-hosts.json, 23-invite-signed-in-player.txt, 20-generic-url.txt; notifications.body for TEAM_INVITE_NEW (db row) "…pay your share: DuFqIaK2…" (no link)
  Root cause: apps/team-admin-web/src/app/(app)/captain/invites/create-invite-form.tsx:81 prints `/invite/${inv.token}`; no app defines an /invite route (grep: only team-admin captain/invites exists). There is no accept/redeem endpoint at all: team_invites.status only moves to "revoked" (registration-v2.service.ts revokeTeamInvite) — nothing sets accepted/declined. GET /public/registration/invites/:token (public-invites.controller.ts) has no frontend caller. The registration funnel offers a "Captain invite — I received an invite link from my captain" path (packages/registration-funnel/src/funnel.tsx:53) but never reads a token. TEAM_INVITE_NEW template (communications/domain/templates/catalog.ts:179) interpolates {{token}} only.
  Proposed fix: one invite-redemption flow in player-web: /invite/[token] (public route) → resolve via the existing public endpoint (reject revoked/expired, see CAP-14) → sign in / sign up → POST /me/team-invites/:token/accept|decline that, in one transaction, sets team_invites.accepted_at/status, creates the team_membership (or pre-fills the funnel for the team+season) and grants player@team. Build the absolute URL once on the server (NEXT_PUBLIC_PLAYER_URL + /invite/<token>) and use it in the form, the roster invite and the TEAM_INVITE_NEW template.
```

```
[CAP-2] Set-up wizard registers the team into a DENIED division with no approval · blocker
  Journey: J7
  Surface: team-admin /captain/register/setup/[entryId]
  Repro:
    1. Captain applies to Div A; super_admin denies it (reason given). Captain applies to Div B; super_admin approves.
    2. Captain completes the set-up wizard for B (team ends "confirmed").
    3. Open the same wizard URL again. Step 2 lists every division and preselects none; pick Div A (the denied one), add one email, submit.
  Expected: the wizard is locked to the approved division (or read-only once confirmed); the server refuses a division that has no approved entry.
  Actual: submit succeeds; division_team_entries for Div A = [rejected, confirmed]. The team is now confirmed in both divisions of the season, plus a new master invoice and sub-invoice.
  Evidence: test-results-captain-evidence/j07-CAP0625U/92-divA-entries.json and j07-CAP0527/92-divA-entries.json: [{"entry_status":"rejected"},{"entry_status":"confirmed"}]; 62-wizard-step2.png (no division preselected)
  Root cause: register-wizard.tsx:115 `useState<string | null>(null)` ignores the approved entry's divisionId and step 2 renders all divisions. Server side, captain.controller.ts registerInner (~line 580-700) never loads the entryId or checks approval: it looks for an existing entry in the posted division with status pending_approval/applied/accepted and otherwise INSERTs a new entry with status applied/confirmed. So any captain can POST /captain/register for any division and skip the admin gate; it also treats a pending_approval entry as approved.
  Proposed fix: make POST /captain/register take the divisionTeamEntryId, require entry_status in (applied, accepted) and team ownership, and use that entry's division; never insert a new entry there. Wizard: drop the division step (show the approved division read-only). Block re-submission once confirmed.
```

```
[CAP-3] A player who signs up is refused by player-web; free-agent and join flows unreachable · blocker
  Journey: J6 · UC-03 (also UC-04 "player creates account")
  Surface: player-web /sign-up, /sign-in
  Repro:
    1. Sign up on staging-player /sign-up (Player / Free Agent) with a new email.
    2. Confirm the email (fixture: admin API, as a confirmed role-less account) and sign in on staging-player.
  Expected: a new player lands on onboarding / home and can open "Join the free-agent pool".
  Actual: the account is created with app_metadata {provider, providers} and no role_codes; sign-in redirects to /sign-in?error=wrong_role ("This account doesn't have … access"). Only after super_admin manually grants player on /users/[id] can the account sign in.
  Evidence: test-results-captain-evidence/j06-CAPJ6A/02-signup-user.json (db row, no role_codes); j08-CAPJ8D/00-new-account-signin.png (url ?error=wrong_role)
  Root cause: packages/auth/src/web/role-gate.ts:126-135 rejects users whose JWT role_codes lack player/free_agent (apps/player-web/src/middleware.ts:4), and nothing grants a role at sign-up (sign-up-client.tsx only calls supabase.auth.signUp + iam.patchMe; handle_new_user trigger sets no role). The player role is only granted inside the registration funnel submit, which a role-less user cannot reach. Code-read, not exercised: the onboarding wizard saves through PATCH /iam/users/:id/role-profile, which is @UseGuards(SuperAdminGuard) (iam.controller.ts:477-478), so a player cannot finish onboarding either.
  Proposed fix: grant a base `player` role (org-less, or "free_agent") when a player-web account is created (API endpoint called after signUp, or the auth trigger) and sync role_codes; or let requireRole pass role-less users to /onboarding and /register. Add a self-service role-profile endpoint (PATCH /iam/me/role-profile) for onboarding.
```

```
[CAP-4] Team-registration and invite notifications never reach anyone · major
  Journey: J7, J8 · UC-04 ("System sends invitation"), UC-03, UC-05
  Surface: API notification outbox (staging DB `notifications`), team-admin copy
  Repro:
    1. Captain applies (J7.4), admin denies and approves (J7.5/J7.7), captain submits the wizard with 2 emails (J7.8).
    2. Captain sends a personal invite on /captain/invites (J8.1) and an "Invite by email" on /captain/roster (J8.4).
    3. Read the notifications rows.
  Expected: captain confirmation, admin alerts, approval/denial notice to the captain, and one usable invite email per invited player.
  Actual (after 86201c6 reached staging):
    - TEAM_REGISTRATION_APPLIED ×3 and _CONFIRMATION: recipient_email null, recipient_person_id null → status failed "no recipientEmail on row".
    - TEAM_REGISTRATION_APPROVED / _REJECTED: no row at all.
    - Wizard TEAM_INVITE_NEW body: "You've been invited to join  for the upcoming season.\n\nClick to register and pay your share: \n\nThis invite expires ." SUB_INVOICE_SENT body: "Your share of the  season dues is . Pay your deposit to confirm your spot: ".
    - /captain/invites personal invite: UI says "Invite sent to <email>", no notification row exists.
    - Roster invite: row queued with a raw token, no link (see CAP-1).
    - Every email row fails "RESEND_API_KEY not configured" (staging env).
    - Wizard confirmation still tells the captain "Players will receive their personal invite emails shortly."
  Evidence: db rows (query in spec J7.8; run CAP0625U, 00:57 UTC); test-results-captain-evidence/j07-CAP0625U/findings.json, 65-wizard-submitted.txt; j08-CAPJ8D J8.1 finding
  Root cause:
    - team-applications/interface/captain-applications.controller.ts:408-436 queues apply notifications with only orgId + payload.targetRole, no recipient; the dispatcher has no role→recipient routing.
    - team-applications/interface/admin-applications.controller.ts:312 and :365 pass `recipientPersonId: ctx.captainUserId` (an auth user id) into notifications.recipient_person_id, which has an FK to persons → insert fails, error swallowed by NotificationService.queue.
    - captain/interface/captain.controller.ts:973-995 sends payload {teamId, divisionName, seasonName, inviteToken} / {invoiceId, amountCents, seasonName} but the templates need {teamName, token, expiresAt} / their own keys → blank renders.
    - registration-v2.service.ts:156 createTeamInvite (used by /captain/invites) never queues a notification.
  Proposed fix: one `notifyTeamInvite(invite)` and `notifyTeamRegistration(event, entry)` helper in the communications module that resolves recipients (captain person + email from profiles; admins by role scope) and builds payloads that match the catalog `variables`; add a unit test that renders every catalog template with its producer's payload and fails on empty variables. Configure RESEND on staging. Do not show "Invite sent"/"emails shortly" unless a row was queued with a recipient.
```

```
[CAP-5] Captain never sees a denial (or its reason) while the team has another active season · major
  Journey: J7
  Surface: team-admin /captain/register
  Repro:
    1. Team is confirmed in its current season (Staging 2026-27).
    2. Captain applies to Div A of a new season; super_admin denies with reason "<tag> wrong skill tier for this team".
    3. Captain opens /captain/register.
  Expected: "Application not approved" card with the admin's reason and "Apply to a different division".
  Actual: the page shows "You're confirmed! Staging Skaters is confirmed for Open in Staging 2026-27." No denial, no reason. The denied season only reappears in "Other open seasons".
  Evidence: test-results-captain-evidence/j07-CAP0625U/40-captain-sees-denial.png/.txt
  Root cause: apps/team-admin-web/src/app/(app)/captain/register/page.tsx:87 picks the first entry in any active status across ALL seasons as activeApp, and :117 renders the rejection only when `!activeApp`. Entries are per season, but the page has one slot.
  Proposed fix: group applications by season; for each open season show its latest entry (pending, approved, denied with reason). Keep the confirmed current season as a separate "current season" card.
```

```
[CAP-6] No way into "Register your team" from the captain console while the team is in season · major
  Journey: J7
  Surface: team-admin home and sidebar
  Repro:
    1. Team is confirmed in Staging 2026-27; super_admin opens registration for a new season (window includes today).
    2. Captain signs in to staging-team.
  Expected: the "Register the team / season open" CTA (sidebar + banner) appears, as it does for off-season teams.
  Actual: no CTA, no banner, and the sidebar has no "Register" item. The only route in is player-web's "Register your team" deep link or typing /captain/register.
  Evidence: test-results-captain-evidence/j07-CAP0625U/20-captain-home.png
  Root cause: captain.controller.ts dashboardState (~line 226): any applied/accepted/confirmed entry returns mode in_season/applied before the open-season check runs; layout.tsx:52 shows the CTA only for mode === "registration_open". apps/team-admin-web/src/components/layout/sidebar.tsx:53-60 has no permanent register link.
  Proposed fix: return `openSeasons` alongside mode (or a separate `registrationOpen` flag computed from captain/open-seasons) and show the CTA whenever an open season exists that the team has not applied to; add a permanent "Register team" item to the captain sidebar group.
```

```
[CAP-7] Captain's free-agent pool reads the newest division entry, so current-season free agents are invisible · major
  Journey: J6 · UC-03
  Surface: team-admin /captain/free-agents
  Repro:
    1. Free agent lists themself for Staging 2026-27 (the team's in-progress season) on player-web /register/free-agent.
    2. Captain opens Free agents.
  Expected: the free agent is listed (team plays in Staging 2026-27).
  Actual: "Pool is empty". The pool shows only the season of the team's most recently created division entry (here CAP0527 Season), whatever its status, even rejected. After the free agent also lists for that season, the captain sees them.
  Evidence: test-results-captain-evidence/j06-CAPJ6E/20-captain-pool.txt ("Pool is empty"), 20-pool-season.json, 31-captain-pool-again.txt
  Root cause: apps/superadmin-api/src/modules/registration-v2/application/registration-v2.service.ts:226-240 listFreeAgentPool({forTeamId}) orders division_team_entries by createdAt desc, limit 1, with no status filter (the doc comment says applied/accepted/confirmed).
  Proposed fix: resolve all seasons where the team has an applied/accepted/confirmed entry and that are open or in progress; return the pool for those seasons with a season filter in the UI (default: current season).
```

```
[CAP-8] Manage roster jumps to the newest registered season; the current roster is unreachable · major
  Journey: J8 · UC-33 / UC-04
  Surface: team-admin /captain/roster
  Repro:
    1. Team is confirmed in Staging 2026-27 (2 players) and has registered for a later season.
    2. Captain opens Manage roster; adds, drops, invites.
  Expected: the in-progress season's roster by default, with a season switcher.
  Actual: header "1 / 20 players · E2EMVK6ORTH Season · E2EMVK6ORTH Div B"; adds, drops and invites all go to the future season. No switcher.
  Evidence: test-results-captain-evidence/j08-CAPJ8D/39-roster-before-invite.txt, 39-roster-season.txt
  Root cause: captain/interface/captain-roster.controller.ts:874-901 loadActiveSeason orders by seasons.startDate desc limit 1; roster-screen.tsx has no seasonId control although GET /captain/roster/:teamId accepts ?seasonId.
  Proposed fix: default to the season that is in progress (start <= today <= end) else the nearest upcoming; add a season dropdown fed by the team's entries; pass seasonId through add/drop/invite.
```

```
[CAP-9] Claiming a free agent skips the player's accept/decline and tells nobody · major
  Journey: J6 · UC-03
  Surface: team-admin /captain/free-agents → player-web /team
  Repro:
    1. Captain clicks Claim on a free agent and confirms.
  Expected (UC-03): captain "pitches" an invite; the player accepts or declines; on acceptance the player moves to the roster; notifications to the player.
  Actual: the player is placed and an active team_membership is created immediately; no notification row for the player; the player only finds out by opening /team. The player's free-agent form still shows the entry as active (see CAP-17).
  Evidence: test-results-captain-evidence/j06-CAPJ6E/32-after-claim.txt, 40-fa-team.txt (team visible), findings.json; db: free_agent_pool_entries.status=placed, team_memberships active, 0 notifications for the player
  Root cause: registration-v2.service.ts:338 placeFreeAgent flips status and inserts team_memberships directly; free-agent-pool.controller.ts PATCH :id/place has no invite/consent step and queues nothing.
  Proposed fix: make "Claim" create a team invite (kind personal, linked to the pool entry) that the player accepts through the CAP-1 flow; placement + membership happen on accept. Notify the player on pitch and the captain on accept/decline.
```

```
[CAP-10] No admin view of the free-agent pool (cannot manually assign) · major
  Journey: J6 · UC-03 alternative flow "Admin manually assigns player to a team"
  Surface: superadmin-web /registrations, org-admin-web /registrations
  Repro: list a free agent; open SA and OA /registrations as super_admin / org_admin.
  Expected: a free-agent pool section with an "Assign to team" action.
  Actual: neither page lists the free agent (SA only shows the word "Free agent" in the funnel preview).
  Evidence: test-results-captain-evidence/j06-CAPJ6E/50-sa-registrations.txt, 51-oa-registrations.txt
  Root cause: no admin page calls registrationV2.listFreeAgentPool / placeFreeAgent; the API already allows super/league admins (free-agent-pool.controller.ts list + place).
  Proposed fix: add a shared FreeAgentPool panel (season filter, team picker for assignment) in packages/admin-pages, mounted on SA and OA /registrations.
```

```
[CAP-11] Any signed-in user can search every person on the platform, with email and auth id · major
  Journey: J8
  Surface: team-admin /captain/roster → Add player picker (GET /api/iam/persons?search=)
  Repro: as captain, Add player → type "Plain".
  Expected: the picker searches players the captain may add (their org / free agents / past roster) and returns name only.
  Actual: 200 with full person rows from the whole platform, including externalIds.email and supabaseUserId (and dobDate when set).
  Evidence: test-results-captain-evidence/j08-CAPJ8A/51-person-search-responses.txt
  Root cause: apps/superadmin-api/src/modules/iam/interface/persons.controller.ts:42-48 — GET list and GET :id only have JwtAuthGuard (comment: opened so captains can use the picker); no scope filter in ListPersonsHandler.
  Proposed fix: a captain-scoped search endpoint (e.g. GET /captain/roster/:teamId/candidates?q=) that filters to the team's org and returns {id, name, age band}; keep /iam/persons super-admin/org-scoped.
```

```
[CAP-12] Org setup refuses "registration opens today" east of UTC and after 8 pm US Eastern; failed publish leaves an orphan league · major
  Journey: J7 setup (also J1)
  Surface: superadmin-web /org-setup step 3 → Publish league
  Repro:
    1. Browser in Asia/Kolkata (or America/New_York after 20:00), org setup with Registration opens = today.
    2. Publish league.
  Expected: season created with registration open today.
  Actual: alert "registrationOpensAt must be today or a future date"; the league "CAP0623 League" was already created (status draft, 0 seasons) and stays behind.
  Evidence: test-results-captain/…org-setup…/error-context.md (alert text, run CAP0623); db: leagues name 'CAP0623 League', 0 seasons
  Root cause: packages/admin-pages/src/org-setup/org-setup-wizard.tsx builds `new Date(date + "T00:00:00").toISOString()` (local midnight → previous UTC date east of UTC), while season.dto.ts:21-47 IsFutureOrToday compares value.slice(0,10) with the server's (UTC) date. The wizard creates league, then season, then divisions in separate calls with no rollback.
  Proposed fix: send date-only strings (or the league timezone) and validate "today" in the league's timezone on the server; create league+season+divisions in one API command/transaction.
```

```
[CAP-13] Season status and captain visibility disagree; the window cannot be edited after creation · major
  Journey: J7 prerequisite
  Surface: superadmin-web /seasons/[id] status dropdown; team-admin /captain/register
  Repro:
    1. Staging 2026-27 has status registration_open but no registration window (db). Other testers' seasons are status draft with a window.
    2. Captain opens /captain/register.
  Expected: the status control says what captains see; an admin can set or fix the window of an existing season.
  Actual: the status hint says "Draft — Captains can't see it yet", but draft seasons with a window ARE listed to the captain (E2EMVK6KAZP Season, draft, under "Other open seasons"). A registration_open season without a window is hidden from captains (code). No screen edits registrationOpensAt/ClosesAt of an existing season (season-detail is read-only; forms "Season setup" only binds or rolls over).
  Evidence: test-results-captain-evidence/j07-CAP0625U/40-captain-sees-denial.txt (draft seasons listed); db: seasons 'Staging 2026-27' status registration_open, registration_opens_at null
  Root cause: captain-applications.controller.ts openSeasons/apply use status in (draft, registration_open) AND window includes now; packages/admin-pages/src/season-status-control.tsx:13 hint text; no caller of leagueMgmt.updateSeason for the window fields (PATCH /league-management/seasons/:id supports them).
  Proposed fix: one rule in packages/kernel (isSeasonOpenForTeams(season, now)) used by API and UI copy; add a "Registration window" edit on the season detail page using the existing PATCH.
```

```
[CAP-14] Revoked invite token still resolves publicly, with the full invite row · minor
  Journey: J8 · UC-04
  Surface: GET https://staging-api.sportspulse.us/api/public/registration/invites/:token
  Repro: captain revokes the generic invite on /captain/invites; open the public URL.
  Expected: 404/410 for revoked or expired tokens; only team + season display data.
  Actual: 200 with the whole row (status "revoked", issuedByUserId, inviteeEmail, token).
  Evidence: test-results-captain-evidence/j08-CAPJ8D/32-revoked-resolve.txt
  Root cause: registration-v2.service.ts:197 resolveTeamInviteByToken selects by token with no status/expiry check and returns the raw row.
  Proposed fix: filter status in (pending, extended) and expires_at > now; return a DTO {teamName, seasonName, kind, inviteeEmailMasked}.
```

```
[CAP-15] Invite season picker defaults to an arbitrary season and lists every season in the org · minor
  Journey: J8
  Surface: team-admin /captain/invites
  Repro: open Invites as captain.
  Expected: default = the team's current season; list = seasons the team is entered in.
  Actual: default "E2EMVK85UUY Season" (another league's draft season); 25 seasons listed.
  Evidence: test-results-captain-evidence/j08-CAPJ8D/10-season-options.json
  Root cause: create-invite-form.tsx:46-53 lists leagueMgmt.listSeasons({orgId}) and selects list[0].
  Proposed fix: feed the picker from captain.myApplications (applied/accepted/confirmed) and default to the in-progress season (same helper as CAP-8).
```

```
[CAP-16] Roster "Invite by email" opens the Add-player tab, and the dues share is silently dropped · minor
  Journey: J8
  Surface: team-admin /captain/roster
  Repro: click "Invite by email"; switch to the email tab; enter email and "Their share of dues" 70; send.
  Expected: the email form opens directly; a sub-invoice of $70 is created for the invitee (as the dialog says).
  Actual: the button opens "Add player to roster" on the search tab; after sending, no invoice exists for the invitee.
  Evidence: test-results-captain-evidence/j08-CAPJ8D/40-roster-invite-modal.png; db: invoices where recipient_email = invitee → 0
  Root cause: roster-screen.tsx:138 and :141 both call setAddOpen(true) with no tab argument; captain-roster.controller.ts:510-560 accepts splitAmountCents (InviteBodyDto:80) but never uses it (the summary claims it creates a sub-invoice).
  Proposed fix: open the modal on the requested tab; either create the sub-invoice against the team's master invoice or remove the field.
```

```
[CAP-17] Free-agent form never shows the player's existing or placed entries · minor
  Journey: J6
  Surface: player-web /register/free-agent
  Repro: list yourself, get claimed, reopen the form.
  Expected: the season button shows "placed" and the form loads the saved entry.
  Actual: no badge, "New entry" every time; console 400 on load.
  Evidence: test-results-captain-evidence/j06-CAPJ6E/41-fa-form-after-claim.txt
  Root cause: apps/player-web/src/app/(app)/register/free-agent/page.tsx:81 calls listFreeAgentPool({}); free-agent-pool.controller.ts list throws 400 "seasonId or forTeamId is required for non-super-admin callers"; the page swallows it to [].
  Proposed fix: add GET /me/free-agent-entries (by caller's person) and use it here.
```

```
[CAP-18] Player home says "haven't registered yet" while showing the team and its games · minor
  Journey: J8
  Surface: player-web /
  Repro: captain adds a player to the roster; player opens home.
  Expected: no "new here" banner for a rostered player.
  Actual: "Register for a season to unlock your dashboard — You're signed in but haven't registered yet" above "Staging Skaters vs. … Bears, Sun Oct 25".
  Evidence: test-results-captain-evidence/j08-CAPJ8D/54-player-home-after-add.txt
  Root cause: apps/player-web/src/app/(app)/registration-state-banner.tsx:33-62 derives state from registrations only and ignores team_memberships.
  Proposed fix: pass memberships into detectState; treat an active membership as "active".
```

```
[CAP-19] Player /team and team-admin /roster mix every season, so people appear several times · minor
  Journey: J8 · UC-33
  Surface: player-web /team, team-admin /roster
  Repro: team registered in several seasons (captain auto-added each time); open both pages.
  Expected: one roster for the selected season.
  Actual: "6 ACTIVE" with "Staging Captain" listed three times (one per season); team-admin "/roster 5 active memberships" with duplicates and mixed effective dates.
  Evidence: test-results-captain-evidence/j06-CAPJ6E/40-fa-team.txt, j08-CAPJ8D/55-team-admin-roster.txt
  Root cause: both pages list team_memberships for the team without a season filter.
  Proposed fix: same season resolver as CAP-8 and a season filter on both pages.
```

```
[CAP-20] Org setup Sport defaults to AFL (alphabetically first) · minor
  Journey: J7 setup
  Surface: superadmin-web /org-setup step 2
  Expected: default to the org's sport (PPHL is ice hockey) or force a choice.
  Actual: Sport preselected "AFL"; the review card showed SPORT AFL until changed.
  Evidence: test-results-captain-evidence/j07-CAP0625U/01-org-setup-league.png, findings.json
  Root cause: packages/admin-pages/src/org-setup/org-setup-wizard.tsx:144 defaultLeagueDraft(sports[0]?.code).
  Proposed fix: default from the org's existing leagues' sport, else empty with "Pick a sport".
```

```
[CAP-21] Per-player cost differs between screens · minor
  Journey: J7
  Surface: team-admin division picker vs set-up wizard
  Actual: picker shows "$1,400 per team · $100 per player" (fee / default 14); the division's Max roster size is 20 and the wizard caps the roster at 25 and splits $1,400 evenly across invited players.
  Evidence: test-results-captain-evidence/j07-CAP0527/24-duplicate-apply.txt, 32-division-A-detail.txt, 64-wizard-step4.txt
  Root cause: captain.controller.ts:375 maxRosterSize = season config ?? 14 (ignores division ruleSetOverrides.maxRosterSize); register-wizard.tsx:128 maxRoster = 25.
  Proposed fix: one resolveDivisionRules() (already in captain-roster.controller) for both, from packages/kernel.
```

```
[CAP-22] Set-up wizard page has two nested <main> landmarks · minor
  Journey: J7
  Surface: team-admin /captain/register/setup/[entryId]
  Actual: Playwright strict mode: locator('main') resolved to 2 elements (layout main + wizard main).
  Evidence: run CAP0523 error output (strict mode violation)
  Root cause: register-wizard.tsx renders <main className="min-w-0 space-y-6"> inside the app layout's <main>.
  Proposed fix: use <section> in the wizard.
```

```
[CAP-23] "New registration form" dialog preselects another tenant's org · minor
  Journey: J7 setup (forms)
  Surface: superadmin-web /forms → New form
  Actual: Organization defaults to "PPHL E2EMVK5Y660" (alphabetically first of 5 orgs), not the org in context.
  Evidence: test-results-captain/…pricing-tier…/error-context.md (combobox "Organization" first option selected)
  Root cause: packages/admin-pages/src/forms/create-form-button.tsx initial orgId = first org.
  Proposed fix: default to the org filter in view (or no default) per the "defaults reflect context" rule.
```

---

## Gaps

Backend without UI:
- GET /public/registration/invites/:token: no caller (CAP-1). No accept/decline endpoint exists at all.
- PATCH /registration-v2/free-agent-pool/:id/place and GET pool: no admin screen (CAP-10).
- PATCH /league-management/seasons/:id (registration window, roster lock): no screen edits them (CAP-13).
- POST /captain/roster/:teamId/remind/:inviteId exists (rate-limited resend); reminders before roster deadline (UC-04 alt flow) are not scheduled.

UI without backend (or backend that does not do what the UI says):
- /captain/invites "Invite sent to <email>": nothing is sent (CAP-4).
- Generic "Team URL": no route serves it (CAP-1).
- Roster invite "Their share of dues": ignored (CAP-16).
- Wizard "Players will receive their personal invite emails shortly": bodies are blank (CAP-4).
- Registration funnel path "Captain invite — I received an invite link from my captain" (packages/registration-funnel/src/funnel.tsx:53): never reads an invite token. Code-read; not exercised (no published form on staging during this run).

PPHL use cases not built:
- UC-04: invite accept/decline, "captain notified on decline", reminder before roster deadline, "selects from past roster" (wizard step 3 is email-only), eligibility auto-validation on accept.
- UC-03: captain "pitch" + player accept/decline (CAP-9), notifications to captains of eligible teams when a free agent lists, withdraw-from-pool path for the player (UI shows "hidden from captains" copy but this run did not exercise it), "player does not belong to a team" precondition not enforced (staging-player, already rostered, sees the full free-agent form).
- UC-33 (multi-team): every captain and player page uses `scope.teamIds[0]` (player-web page.tsx:116, team/page.tsx:32, schedule, stats, store; team-admin layout.tsx:34 and every /captain/* page). A player on two teams sees one; a captain of team A who is a player on team B may get team B's console. Code-read; not exercised in the browser (only one team exists on staging that a captain can manage).
- UC-05: "Pending roster approvals" queue for roster adds was not in scope of these journeys; captain roster adds go straight to active.

Authorization (code-read, not exercised in a browser):
- registration-v2 team-invites create/revoke and free-agent place allow `scope.teamIds.includes(teamId)`; scope.teamIds includes teams where the caller is only a *player* (shared/auth/scope.ts membership projection), so a plain rostered player can issue/revoke invites and place free agents via the API. Should use userIsCaptainOfTeam (shared/auth/captain.ts) like the captain controllers.
- Same controllers allow any caller with `scope.leagueIds === null`, which is also true for users with a platform-scoped non-admin role.

Join requests (/captain/join-requests): Blocked. The player side ("Apply to join" on player-web /team) only lists teams in divisions where the player has an approved/submitted registration (team-join-requests.controller.ts listJoinableTeams). No registration form was published on staging during the run, so a plain player sees "Not on a roster yet … Register for an open season" and no team to apply to.

---

## Evidence table

| Journey step | Verified (how, evidence kind) | NOT verified / Blocked (why) |
|---|---|---|
| J7.1 SA creates league + season + 2 divisions via /seasons → "New season → Org setup" | Pass in UTC browser (CAP0625U): screenshots 01-04, db-row season + divisions. Fails in IST browser (CAP-12, alert text, orphan league db-row). Sport default AFL (CAP-20). | |
| J7.2 SA sets season status registration_open | Pass: dropdown click, db-row status | |
| J7.3 SA form + active pricing tier ($1,400) | Pass: /forms create, season bind, tier, db-row is_active + 140000 | Pricing entered in cents (UX), not filed |
| J7.4 Captain finds season, applies to Div A, "submitted" state | Pass: dom 23-application-submitted, db-row pending_approval. Duplicate apply shows "Your team already has an active application for this season." (dom) | Entry point from captain console missing (CAP-6) |
| J7.5 Application visible in SA season queue, /division-applications, division detail; deny with reason | Pass: dom 30/31/32, db-row rejected | Admin notification (CAP-4) |
| J7.6 Captain sees denial + reason | FAIL (CAP-5): dom 40 shows "You're confirmed!" | |
| J7.6b Re-apply to Div B | Pass: db-row pending_approval | |
| J7.7 SA approves from division detail inline | Pass: db-row applied | Captain notification (CAP-4, no row) |
| J7.8 Captain sees approved card, wizard (team, division, roster emails, even split), submit | Pass with defects: dom 60-65, db-rows master + 2 sub-invoices = 140000, 2 team_invites, status confirmed. Division not preselected (CAP-2); invite/sub-invoice email bodies blank (CAP-4, db-rows) | Email delivery: staging has no RESEND key |
| J7.9 Team listed in SA and OA /divisions/[id] | Pass: dom 70 (SA), 71 (OA fresh org_admin context) | |
| J7.10 player-web /captain/register parity | Pass by design: player-web home links to staging-team /captain/register (href asserted); /captain/register on player-web = 404 (route removed in ab9984c). doc/traceability-matrix.md 1.7/1.8 still claim the player-web route: stale | |
| J7.11 Approval gate holds on wizard re-entry | FAIL (CAP-2): db-row Div A rejected+confirmed | |
| J8.0 Plain player fixture | Role-less account refused (dom url wrong_role, CAP-3). After SA grants player@org on /users/[id]: sign-in works (dom) | Onboarding wizard never shown (profile_complete gate did not redirect); not investigated |
| J8.1 Captain personal invite on /captain/invites | UI "Invite sent" + pending list updates (dom), db-row pending. No notification (CAP-4). Season default wrong (CAP-15) | Email delivery |
| J8.2 Generic team URL opened on all hosts | FAIL (CAP-1): http status + url per host (json), signed-in 404 | |
| J8.3 Revoke invite | Pass: screen updates within 15 s, db-row revoked. Public resolve still 200 (CAP-14, http-response) | |
| J8.4 Roster "Invite by email" | Pass with defects: db-row invite, notification row queued (raw token, CAP-1); wrong tab (CAP-16); dues share dropped (db) | |
| J8.5 Add player by name picker, player sees team, team-admin /roster, drop with reason | Pass: picker search by name (dom + http), roster refresh (dom), player-web /team shows team (fresh player context, dom), team-admin /roster lists player, drop refreshes list (dom), db-rows add/drop moves + released membership. Defects: CAP-8, CAP-11, CAP-18, CAP-19 | Transfer/move to another team: not exercised (no second team the captain can target) |
| J8.6 Plain player blocked from captain console | Pass: team-admin sign-in → ?error=wrong_role with readable message (dom); /captain/invites redirects to sign-in | |
| J8 join requests | Blocked: requires an approved/submitted registration; no published form on staging | |
| J8 UC-33 player on two teams | Blocked in browser (one manageable team); code-read gap above | |
| J6.0 Self sign-up | Partial: account created with no role_codes (db-row, CAPJ6A); later runs hit Supabase "email rate limit exceeded" (dom) | Full sign-up + email confirm not completed (email confirmation on staging) |
| J6.1 Free agent lists for Staging 2026-27 | Pass: POST 201 (http-response), db-row active | No visible confirmation text checked beyond form |
| J6.2 Captain sees pool | FAIL (CAP-7): dom "Pool is empty" | |
| J6.3 Captain claims | Pass mechanically: dom, db-rows placed + active membership; no consent/notification (CAP-9) | |
| J6.4 Player sees team; form shows placed | /team Pass (dom); form "placed" FAIL (CAP-17) | |
| J6.5 Admin pool view SA/OA | FAIL (CAP-10): dom | |
| captain-dual-role.spec.ts (existing) | Not re-run in this cluster; staging-player holds player+captain on Staging Skaters (db-row), staging-team holds captain only | |

Counts (journey steps above): 19 pass (some with defects), 7 fail, 4 blocked/partial.
