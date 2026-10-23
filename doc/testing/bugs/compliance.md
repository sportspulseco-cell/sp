# Compliance cluster: J9 eligibility and documents, J12 suspensions

Run date: 2026-10-23. Target: staging (code = local `main` HEAD).
Specs: `tests/e2e/journeys/j09-eligibility.spec.ts`, `tests/e2e/journeys/j12-suspension.spec.ts`.
Command: `E2E_OUTPUT_DIR=test-results-compliance bash e2e-staging.sh tests/e2e/journeys/j09-eligibility.spec.ts tests/e2e/journeys/j12-suspension.spec.ts --reporter=line --workers=1`
Last run (both specs together): 13 passed, 2 failed. The two failures are the "report findings" tests, which fail on purpose and list every product bug in their message.
Evidence lives in `test-results-compliance/j09-evidence/` and `test-results-compliance/j12-evidence/` (`*.png`, `*.txt` DOM text, `*.json` db rows, `errors.json`, `findings.txt`).

Rows created on staging: one waiver document per run (`<RUN_TAG> Liability waiver`, published v1), and eligibility records for the 2 active members of Staging Skaters in season "Staging 2026-27" (from the sweep). The player's record is waived with reason `<RUN_TAG> ID verified offline`. No suspensions were created. The account-level "Suspend" on /users was never clicked.

---

```
[COMP-5] Player and captain compliance pages are always empty · blocker
  Journey: J9 · UC-05, UC-29, UC-14
  Surface: player-web /compliance, team-admin-web /captain/compliance
  Repro:
    1. super_admin @ SA /eligibility: pick "Staging 2026-27", click "Run eligibility sweep", then Waive the Staging Player row.
    2. DB now holds eligibility_records (person = staging player, season = Staging 2026-27, status = waived).
    3. Sign in as staging-player @ PL, open sidebar "Compliance".
    4. Sign in as staging-team (captain) @ TA, open sidebar "Compliance".
  Expected: player sees a "Waived" item; captain sees "Staging Player · waived" in the roster list and Waived = 1.
  Actual: player sees "No requirements yet". Captain sees "No compliance records yet", every tile 0.
  Evidence: j09-evidence/07-player-compliance-after.png + .txt, 06-captain-compliance.png + .txt, 05-db-eligibility-after-waive.json ([{status:"waived"}])
  Root cause: both pages call compliance.listEligibility -> GET /compliance/eligibility, and that controller is
    @UseGuards(JwtAuthGuard, SuperAdminGuard) (apps/superadmin-api/src/modules/registration-compliance/interface/eligibility.controller.ts:38).
    A player or captain gets 403. The pages swallow the error with .catch(() => ({ items: [] }))
    (apps/player-web/src/app/(app)/compliance/page.tsx:75-76, apps/team-admin-web/src/app/(app)/captain/compliance/page.tsx:42)
    and show the empty state. The call runs server-side, so the 403 never reaches the browser console.
    The captain page also has two more defects that will show once the guard is fixed. (a) It queries the whole season with no teamId
    filter, so it would list every team's players. (b) It renders r.personId.slice(0, 8) instead of a name (page.tsx:122).
  Proposed fix: add scoped read endpoints in registration-compliance. GET /compliance/self/eligibility resolves the caller's personId.
    GET /captain/teams/:teamId/eligibility checks userIsCaptainOfTeam, joins team_memberships to persons, and returns names.
    Point both pages at them. Do not open the admin list to everyone. Stop turning a 403 into an empty state: show "Could not load".
```

```
[COMP-1] UC-29 has no admin review queue and no approve/reject · blocker
  Journey: J9 · UC-29, UC-05
  Surface: superadmin-web /documents, /documents/[id], /eligibility
  Repro:
    1. super_admin @ SA, sidebar Compliance -> Documents.
    2. Sidebar Compliance -> Eligibility.
  Expected: a queue of pending player documents/IDs. Opening one shows the file plus DOB and division rules, and has Approve, Reject (with reason) and Request resubmission.
  Actual: /documents is waiver-template management only ("Versioned waivers, consents, codes of conduct..."). /eligibility rows have only a "Waive" button. There is no Approve, Reject or Verify anywhere (0 matching buttons).
  Evidence: j09-evidence/03-sa-documents.txt, 03-eligibility-controls.txt (approveButtons=0)
  Root cause: no backend exists to decide on identity_verifications. The only writer is POST /compliance/self/identity-verifications
    (self-compliance.controller.ts:60), which inserts status=pending. No endpoint ever sets verified/rejected.
    The eligibility controller has create, reevaluate and waive only (eligibility.controller.ts:59-79).
  Proposed fix: build UC-29 as one slice in registration-compliance:
    - an append-only decision record on identity_verifications (or a new compliance_document_submissions table): status, decided_by, reason, decided_at
    - GET /compliance/review-queue
    - POST /compliance/identity-verifications/:id/decision {approve|reject|resubmit, reason}, which re-runs the person's season evaluation and emits notifications
    - a superadmin-web "Review queue" page under Compliance, inherited by league_admin via scope (see COMP-8)
```

```
[COMP-2] USA Hockey ID submit fails: "Unknown governing body code "USA_HOCKEY"" · major
  Journey: J9 · UC-29
  Surface: player-web /compliance -> "Update USA Hockey ID"
  Repro:
    1. Player opens /compliance and clicks "UPDATE USA HOCKEY ID".
    2. Types "ab" and clicks Submit. A readable validation error appears (OK).
    3. Types "ABC1234567" and clicks Submit.
  Expected: "Submitted — pending admin verification." and an identity_verifications row.
  Actual: dialog shows `Unknown governing body code "USA_HOCKEY"`. HTTP 404 POST /api/compliance/self/identity-verifications. No row written.
  Evidence: j09-evidence/02-dialog-submit.txt, 02-player-usah-submit.png, errors.json, 02-db-identity_verifications.json ([]). Staging governing_bodies count = 0.
  Root cause: self-compliance.controller.ts:89-96 looks up governing_bodies by code. Staging has no rows, and nothing seeds them:
    no migration inserts them, packages/db/src/seed has none, and no API or UI creates a governing body (league-management reference.controller.ts:41 is GET only).
    Production may have rows added by hand. Not checked, because prod is off limits.
  Proposed fix: add an idempotent seed migration for reference governing bodies (USA_HOCKEY, HOCKEY_CANADA, ...) with
    INSERT ... ON CONFLICT (code) DO NOTHING, so every environment has the codes the kernel's GOVERNING_BODY_ID_RULES expects.
    The 404 message also blames the player. Make it say the platform is missing configuration.
```

```
[COMP-3] Player cannot upload an ID or eligibility document · major
  Journey: J9 · UC-29 (precondition), UC-27 alt flow (scanned signed waiver)
  Surface: player-web /compliance
  Repro: 1. Player opens /compliance.
  Expected: an upload control for a birth certificate, governing-body card or scanned signed waiver.
  Actual: 0 file inputs. The only action is "Update USA HOCKEY ID" (a typed number). Per-item "Take action" and "Resubmit" link to /onboarding,
    and the page comment says "Per-rule upload endpoints ... ship in a follow-up".
  Evidence: j09-evidence/01-controls.txt (fileInputs=0), 01-player-compliance-before.png
  Root cause: not built. No storage bucket, upload endpoint or table for player compliance files. See apps/player-web/src/app/(app)/compliance/page.tsx:205-210.
  Proposed fix: part of the COMP-1 slice. Use a Supabase storage bucket with a per-person path, plus POST /compliance/self/documents (metadata row, status=pending).
    The player page lists the submissions and their status.
```

```
[COMP-4] /compliance does not list waivers or offer a way to sign one · major
  Journey: J9 · UC-27
  Surface: player-web /compliance
  Repro: 1. Player opens /compliance. A published waiver exists (created in step 4 of J9).
  Expected: outstanding waivers, each with a Sign action. The description promises "Status of every eligibility requirement, waiver, and document on file."
  Actual: no waiver list and 0 Sign buttons. Waiver signing exists only inside the registration funnel
    (packages/registration-funnel -> POST /public/registration/submissions/:id/sign-waiver).
  Evidence: j09-evidence/01-controls.txt (signButtons=0)
  Root cause: page.tsx reads eligibility records only. It never reads document_signatures or the season's required waivers.
    GET /compliance/documents/signatures/by-person/:personId exists but is SuperAdminGuard-only (documents.controller.ts:46, :113).
  Proposed fix: add GET /compliance/self/waivers, which returns required waiver versions for the player's seasons plus signed/unsigned state,
    and POST /compliance/self/waivers/:versionId/sign. Both reuse the funnel's signature writer (same table, timestamp and IP). Render them on /compliance.
```

```
[COMP-17] Season sweep silently overwrites an admin's waiver decision · major
  Journey: J9 · UC-05 (admin decision log), UC-29
  Surface: superadmin-web /eligibility -> "Run eligibility sweep"
  Repro:
    1. Waive the Staging Player record (DB: status = waived, reason = "<tag> ID verified offline").
    2. Run "Run eligibility sweep" for the same season again.
  Expected: an admin decision survives a re-evaluation, or the sweep asks first. The reason stays consistent with the status.
  Actual: status goes back to "eligible". The old waiver reason stays, so the row reads "ELIGIBLE · <tag> ID verified offline".
  Evidence: findings.txt ("status was 'waived' before the sweep, 'eligible' after"); j09-evidence/05-row.txt BEFORE line;
    05-db-eligibility-after-sweep.json. Reproduced on 2 runs. On the last run the record was already eligible before the sweep (probably another tester's sweep), but the stale reason was shown again.
  Root cause: compliance-sweeps.controller.ts:609-640 upsertEligibility() sets status unconditionally and never clears
    waiver_reason / waived_at / waived_by_user_id.
  Proposed fix: in upsertEligibility, skip status changes when status = 'waived' (store the fresh evaluation in rule_evaluation only),
    or clear the waiver columns when it overrides. Write the change to the audit trail either way.
```

```
[COMP-8] League admin is blocked from /eligibility · major
  Journey: J9 · UC-05, UC-29 (actor = League Admin)
  Surface: superadmin-web /eligibility signed in as staging-league@ (staging-league.sportspulse.us)
  Repro: 1. Sign in as league_admin and open /eligibility.
  Expected: eligibility records and the sweep for the admin's own league.
  Actual: the sweep bar shows "Super admin access required". HTTP 403 on GET /compliance/eligibility/season/:id/summary and /duplicates. The list is empty.
  Evidence: j09-evidence/08-league-admin-eligibility.txt, 08-errors.txt
  Root cause: every compliance controller uses SuperAdminGuard (eligibility.controller.ts:38, compliance-sweeps.controller.ts:50,
    documents.controller.ts:46, suspensions.controller.ts:34). This goes against the "superadmin is the god app, other roles are scope-filtered" rule.
  Proposed fix: switch these controllers to RolesGuard + @Scope / AuthorizedAccessGuard with loadUserScope, and filter by leagueIds/orgIds in the repositories.
    Returning 404 for out-of-scope ids follows CLAUDE.md.
```

```
[COMP-9] /eligibility shows UUID fragments for people, and "New record" is disabled · major
  Journey: J9 · UC-05
  Surface: superadmin-web /eligibility
  Repro: 1. super_admin opens /eligibility after a sweep.
  Expected: the person column shows "Staging Player". The "New record" button is enabled, with a person picker.
  Actual: the row reads "eb069963 ELIGIBLE Staging 2026-27 ...". "New record" is disabled.
  Evidence: findings.txt (row text), j09-evidence/05-sa-eligibility-after-waive.png
  Root cause: eligibility/page.tsx:63 calls iam.listPersons({ limit: 200 }), but ListPersonsQueryDto has @Max(100)
    (apps/superadmin-api/src/modules/iam/interface/dto/person.dto.ts:46). The 400 is caught and becomes an empty list, so personMap is empty
    and CreateEligibilityButton gets persons=[] (disabled). Inferred from code plus the UI symptom. The 400 itself was server-side and not captured.
    Same pattern elsewhere (code read only): eligibility/page.tsx:60 listEligibility({limit:200}) breaks the counts whenever a status filter pill is used;
    games/[id]/page.tsx:54, rosters/page.tsx:46 and components/games/append-event-button.tsx:114 also ask for 200 persons.
    CreateEligibilityButton defaults the person to persons[0] (array[0] default) and loads "governing bodies" from orgs,
    although eligibility_records.governing_body_id references governing_bodies.
  Proposed fix: do the person lookup server-side (return personName on EligibilityRecordDto), or replace the dropdown with the shared typeahead person picker.
    Never request more than the DTO max. Treat a caught 4xx as an error state, not an empty list.
```

```
[COMP-6] Records table does not refresh after "Run eligibility sweep" · minor
  Journey: J9 · UC-05
  Surface: superadmin-web /eligibility
  Repro: 1. Pick the season. 2. Click "Run eligibility sweep". 3. Flash shows "Eligibility sweep complete — 2 evaluated, 0 flagged."
  Expected: the records table and the top tiles below update.
  Actual: the table stays stale (first run: still "No eligibility records"; later runs: still "WAIVED" while the DB says eligible) until a manual reload.
  Evidence: j09-evidence/05-sweep.txt, 05-sweep-row.txt
  Root cause: compliance-sweep-bar.tsx:68-72 refreshes only its own summary cards and never calls router.refresh(). The table is a server component in eligibility/page.tsx.
  Proposed fix: call router.refresh() after each sweep in ComplianceSweepBar.
```

```
[COMP-7] No notification for an eligibility decision · minor
  Journey: J9 · UC-29, UC-05 ("Notification sent to player/captain")
  Surface: player-web /notifications
  Repro: 1. Admin waives the player's eligibility. 2. Player opens Notifications.
  Expected: a notification about the decision.
  Actual: "You're all caught up. No notifications yet."
  Evidence: j09-evidence/07-player-notifications.txt
  Root cause: WaiveEligibilityHandler (application/eligibility/handlers.ts:146) and the season sweep emit nothing. Only the playoff sweep notifies.
  Proposed fix: emit through NotificationService in the decision command (COMP-1) and in waive, with a catalog template such as eligibility.decided, to the player and the team captain.
```

```
[COMP-10] No screen to issue, lift or serve a suspension · blocker
  Journey: J12 · UC-14
  Surface: superadmin-web /persons/[id] (Discipline · Suspension history), /games, /eligibility
  Repro: 1. super_admin -> Persons -> Staging Player. 2. Scroll to "Suspension history".
  Expected: an "Issue suspension" action (kind, games, reason) and Lift / Mark served / Reduce / Extend on each row.
  Actual: "No suspensions — clean record." 0 suspension buttons and 0 lift/serve buttons.
  Evidence: j12-evidence/01-sa-person.txt, 01-controls.txt (issueButtons=0 liftButtons=0)
  Root cause: the API exists (suspensions.controller.ts: POST /suspensions, /:id/lift, /:id/serve), and so do the SDK methods gameOps.issueSuspension, liftSuspension and serveSuspension.
    No app calls them (grep: only packages/api-client/src/sdk.ts). The only other "Suspend" is the account-level action in components/users/user-actions-menu.tsx:125,
    which locks the user out of the platform. An admin could easily click it by mistake when they mean a game suspension.
  Proposed fix: add "Issue suspension" to the person page Discipline section and Lift / Serve to each history row, using the existing SDK methods.
    Rename the /users action to "Suspend account".
```

```
[COMP-11] No automatic suspension from penalties · blocker
  Journey: J12 · UC-14 (trigger: infraction threshold in finalized scoresheets)
  Surface: n/a (backend)
  Repro: n/a. Code and schema check (j12 test 2).
  Expected: configurable rules (e.g. 3 misconducts = 1 game), evaluated when a game is finalized, that create a suspension, notify player, captain and league admin, and auto-expire after N games.
  Actual: no rule configuration (no suspension column on divisions, seasons or leagues), and nothing reads game events to create a suspension.
    No code decrements served games when a game is finalized.
  Evidence: j12-evidence/02-db-suspension-rule-columns.json ([]). grep "misconduct|infraction" over apps/superadmin-api/src and supabase: 0 hits.
  Root cause: not built.
  Proposed fix: add a kernel rule (packages/kernel) for suspension thresholds and division ruleSetOverrides keys. Add a finalize hook in games handlers
    (game-operations/application/games/handlers.ts) that counts PIM/misconduct events, issues through IssueSuspensionHandler (already notifies), and auto-serves active suspensions for both teams.
```

```
[COMP-12] Captain compliance never shows suspensions · major
  Journey: J12 · UC-14
  Surface: team-admin-web /captain/compliance
  Repro: 1. Captain opens Compliance.
  Expected: a per-player suspension flag (Suspended, games remaining).
  Actual: no suspension wording anywhere on the page. The tiles are All clear / Action needed / Expiring / Waived only.
  Evidence: j12-evidence/03-captain-compliance.txt
  Root cause: the page reads eligibility records only (page.tsx:40-44). GET /suspensions is SuperAdminGuard-only.
  Proposed fix: include active suspensions in the captain team-compliance endpoint proposed in COMP-5.
```

```
[COMP-13] Lineup save does not check suspensions · major (code read; refusal not exercisable)
  Journey: J12 · UC-14 ("Player blocked from appearing on active roster until cleared")
  Surface: team-admin-web /lineups/[gameId]; API PUT /games/:gameId/lineups/:teamId
  Repro: 1. Captain -> Lineups. Late in the session one game appeared (0dec4d47..., created by another tester, status in_play).
    2. Open it from the list. Header reads "vs d4b2b854", status LOCKED.
    Refusal itself cannot be driven: no UI creates a suspension (COMP-10), and the game is already locked.
  Expected: a suspended player is not offered in the editor, and PUT refuses them (409 player_suspended).
  Actual (code): the editor filters only team_memberships.current_status === "active" (lineups/[gameId]/page.tsx:73-74). PUT validates captaincy and game status
    but never reads the suspensions table (lineups.controller.ts:91-146). Nothing sets membership status to "suspended" when a suspension is issued.
    The page title also shows the opponent as a UUID fragment (page.tsx: `${opponentId.slice(0, 8)}`).
  Evidence: j12-evidence/04-captain-lineups.txt, 04-captain-lineup-editor.png + 04-editor.txt ("vs d4b2b854"); code lines above
  Root cause: suspensions and lineups are not connected.
  Proposed fix: in LineupsController.upsert, load active suspensions for every personId in starters and bench and reject with 409 listing the names.
    Have the editor mark those players as "Suspended" and keep them out of starters and bench.
```

```
[COMP-14] Eligibility sweep ignores suspensions and treats unknown data as eligible · major (partly code read)
  Journey: J9/J12 · UC-05, UC-14
  Surface: superadmin-web /eligibility -> "Run eligibility sweep"
  Repro: 1. Run the sweep for Staging 2026-27.
  Expected: suspensions and missing data count against eligibility. Unknown stays unknown or pending, never "eligible".
  Actual (observed): the sweep marks Staging Player "eligible" with dobDate = null and ageAtReferenceDate = null, and runs no suspension check.
    Actual (code only): when season.config.requireUsaHockeyId is set, a self-attested PENDING ID counts as "verified" (usaStatus defaults to "verified"
    and identity_verifications.status is never read), and "not_provided" still returns eligible. The "blocked" summary is never returned.
  Evidence: j12-evidence/05-db-eligibility.json; j09-evidence/05-db-eligibility-after-sweep.json; compliance-sweeps.controller.ts:525-605
  Root cause: evaluateRegistrationChecks hard-codes status "eligible" for the age, gender and roster blocks, and lets status fall through to eligible.
  Proposed fix: move the checks into a pure kernel evaluator that returns unknown or pending for missing DOB or ID, reads identity_verifications.status,
    and adds a suspension block. Map not_provided or pending to "pending" / "ineligible" per season config.
```

```
[COMP-18] Lineup editor roster is not the game's season: Staging Player is missing · major
  Journey: J12 (and J11) · UC-14, UC-11
  Surface: team-admin-web /lineups/[gameId]
  Repro:
    1. Captain -> Lineups -> open game 0dec4d47 (home = Staging Skaters).
  Expected: every active member of Staging Skaters for the game's season is offered. Staging Player has an active membership in "Staging 2026-27".
  Actual: the player table lists only "Staging Captain". Staging Player does not appear.
  Evidence: j12-evidence/04-editor.txt; db: team_memberships shows Staging Player active only in season 922061b1 (Staging 2026-27), while Staging Captain is also active
    in two newer E2E seasons created today by other testers; games.season_id = null for this game.
  Root cause: lineups/[gameId]/page.tsx calls captain.roster.list(myTeamId) with no seasonId, so captain-roster.controller.ts:119-121 falls back to
    loadActiveSeason(teamId). That picks whichever season it treats as active, not the game's season. The game row has no season_id (scheduler side, J10),
    so the page has nothing to pass.
  Proposed fix: games must carry season_id (scheduler / game create). The lineup page passes game.seasonId to roster.list,
    and LineupsController.upsert validates each personId against memberships for that season.
```

Not logged as COMP bugs (noise, outside this cluster):
- Every page load on staging-team and staging-player gets HTTP 400 for `OPTIONS https://<app>/` (seen on /, /compliance, /captain/compliance, /lineups, /notifications). Cause not traced. It looks app-wide, not compliance-specific.
- /no-show-report lets the same season be picked as both Previous and New (Run stays enabled). It is a team-retention report and does not cover UC-14.

---

## Gaps

Backend without UI
- POST /suspensions, /suspensions/:id/lift, /suspensions/:id/serve (COMP-10).
- GET /compliance/documents/signatures/by-person/:personId and POST /compliance/documents/signatures/:id/revoke. No admin screen shows who signed what.
- POST /compliance/eligibility/:id/reevaluate. The SDK has it, but /eligibility shows only Waive.

UI without (usable) backend
- player /compliance and captain /captain/compliance read a super_admin-only endpoint (COMP-5).
- "Update USA Hockey ID" depends on governing_bodies rows that nothing seeds or creates (COMP-2).
- The /eligibility "New record" governing-body dropdown lists orgs, but the column references governing_bodies (COMP-9).

PPHL use case steps not built at all
- UC-29: player file upload; admin queue of pending documents; view file with DOB and division rules; Approve; Reject with reason; Request resubmission; override despite mismatch (COMP-1, COMP-3).
- UC-05: "Pending Roster Approvals" view; approve -> roster Active; reject -> removed from roster and captain/player notified; "Incomplete" status for missing documents. Only Waive exists.
- UC-14: rules config; auto-detection from finalized scoresheets; notifications; auto-expiry; admin issue, reduce, extend or remove; lineup block (COMP-10, 11, 13).
- UC-27: signing from /compliance; admin manual verification of an uploaded scanned waiver (COMP-4, COMP-3).

Built but broken
- Player and captain compliance views (COMP-5). League-admin access (COMP-8). Sweep overwrites waivers (COMP-17). Sweep calls unknown data eligible (COMP-14). Person names (COMP-9). Stale table (COMP-6). No decision notification (COMP-7). USA Hockey ID submit (COMP-2).

Built and working (observed in the browser)
- Waiver template: SA /documents -> New document (kind dropdown, name) -> row appears without reload -> detail -> Publish version -> "ACTIVE · v1" without reload. DB: active_version_id set, 1 version.
- Waive: the row turns WAIVED in place within 10 s; DB status = waived, reason stored.
- Season sweep endpoint: "2 evaluated, 0 flagged", and the DB rows are written.
- /no-show-report: previous season Staging 2026-27 vs another season -> "1 TEAM DID NOT RETURN: Staging Skaters · Open · staging-team@sportspulse.us".
- Sidebar discoverability: PL Compliance, TA Compliance and Lineups, SA Compliance group -> Documents / Eligibility / No-show report, SA Persons.

## Evidence table

| Journey step | Verified (how, evidence kind) | NOT verified / Blocked (why) |
|---|---|---|
| J9.1 player reaches /compliance from the sidebar | Playwright click, dom-snapshot + screenshot | none |
| J9.1 upload ID document | Counted file inputs = 0 (dom-snapshot) -> COMP-3 | not built |
| J9.1 sign outstanding waiver on /compliance | Counted Sign buttons = 0 -> COMP-4 | not built |
| J9.2 USA Hockey ID validation (too short) | dialog text "Format must be 6–12 alphanumeric..." | none |
| J9.2 USA Hockey ID submit | dialog text + http 404 + db-row [] -> COMP-2 | admin verification of the ID: blocked (no row, no endpoint) |
| J9.3 admin sees the upload in /documents | dom-snapshot: template list only -> COMP-1 | not built |
| J9.3 admin approve / reject | 0 matching buttons on /eligibility -> COMP-1 | not built |
| J9.4 create + publish waiver template | UI clicks, same-surface refresh, db-row (documents + versions) | player signing the new waiver: belongs to J4's registration funnel, not run here |
| J9.5 season sweep | flash text + db-row; table stale (COMP-6); waiver overwritten (COMP-17) | lock sweep and playoff sweep not exercised |
| J9.5 decision (Waive) | in-place row update + db-row status=waived | true Approve/Reject: not built |
| J9.6 captain /captain/compliance reflects decision | fresh TA session, dom-snapshot "No compliance records yet" -> COMP-5 | none |
| J9.7 player sees decision | fresh PL session, dom-snapshot "No requirements yet" -> COMP-5 | none |
| J9.7 notification produced | PL /notifications dom-snapshot: empty -> COMP-7 | email channel not checked |
| J9.8 league_admin /eligibility | SA league host, dom text "Super admin access required" + http 403 -> COMP-8 | org-isolation with 2 orgs: not run (staging has 1 org with data) |
| J12.1 admin issue / lift suspension | person page dom-snapshot, 0 buttons; grep shows no SDK callers -> COMP-10 | not built |
| J12.2 auto-suspension from penalties | db schema check + code grep -> COMP-11 | Blocked: 0 games on staging (J10/J11 must run first) |
| J12.3 captain sees suspended | TA dom-snapshot, no suspension wording -> COMP-12 | cannot create a suspension through the UI |
| J12.4 lineup refuses suspended player | first runs: /lineups "No upcoming games" (0 games). Last run: 1 game (in_play, made by another tester), opened from the list: header UUID (COMP-13), player missing from roster (COMP-18) | Blocked: no UI can create a suspension (COMP-10) and the only game is already LOCKED. Needs COMP-10 fixed plus a scheduled game (J10). |
| J12.5 /no-show-report | UI run, table row observed | none (same-season pick allowed, noted) |
| J12.5 /eligibility sweep and suspensions | db-row rule_evaluation has no suspension key -> COMP-14 | none |
