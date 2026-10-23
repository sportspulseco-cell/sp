# PPHL journey matrix

Started 2026-10-23 for the PowerPlay Hockey League (PPHL) test round.
This file maps every module to the apps it lives in, the cross-app
journeys that start in one app and finish in another, and what each
journey depends on. It is the test plan for `tests/e2e/journeys/`.

Status is only taken from a Playwright run in a real browser on staging
(`codex/staging` deploy, staging Supabase). Code reading is not a status.

Status legend: `untested` · `pass` · `fail (BUG-n)` · `blocked (reason)` · `not built`

Statuses below are from the first Playwright round on staging
(2026-10-23, code at 057550a, before any fix). 128 findings across
doc/testing/bugs/*.md. Fixes are on branch pphl-journey-fixes; every
journey must be re-run on staging after deploy before any status here
changes to pass.

---

## 1. Surfaces

| Key | App | Prod URL | Staging URL | Signs in as |
|---|---|---|---|---|
| SA | superadmin-web | superadmin.sportspulse.us | staging-superadmin.sportspulse.us | super_admin, league_admin (scoped) |
| OA | org-admin-web | org.sportspulse.us | staging-org.sportspulse.us | org_admin |
| TA | team-admin-web | team.sportspulse.us | staging-team.sportspulse.us | captain (team_admin merged into captain, migration 0047) |
| PL | player-web | player.sportspulse.us | staging-player.sportspulse.us | player, parent, free agent |
| LD | landing-web | sportspulse.us | staging.sportspulse.us | anonymous |
| API | superadmin-api | api.sportspulse.us | staging-api.sportspulse.us | all of the above |

Inventory (counted 2026-10-23): 5 web apps, about 190 page routes;
19 API modules, 373 endpoints; 305 typed SDK methods in
`packages/api-client/src/sdk.ts`.

---

## 2. Module map

Which app each module appears in, which API module backs it, and what it
needs to exist first.

| # | Module | SA routes | OA routes | TA routes | PL routes | API module | Depends on | PPHL UC |
|---|---|---|---|---|---|---|---|---|
| M1 | Identity, users, roles | /users, /users/[id], /persons, /roles | onboarding | onboarding | onboarding, /profile | iam | none | all |
| M2 | Orgs and org setup | /organizations, /org-setup | /org-setup, / | none | none | org-management, org-admin | M1 | none |
| M3 | Leagues, seasons, divisions | /leagues, /seasons, /divisions | /leagues, /seasons, /divisions | none | none | league-management, org-admin | M2 | none |
| M4 | Teams | /teams, /teams/new, /teams/[id] | /teams, /teams/new | /captain/team | /team | league-management | M3 | UC-33 |
| M5 | Registration forms, pricing, waivers | /forms, /forms/[id] | /forms, /forms/[id] | none | none | registration-v2, org-admin | M3 | UC-01, UC-27 |
| M6 | Player registration funnel | /registrations, /registration/[id] | /registrations | none | /register, /register/[id], /registrations | registration-v2 (public), registration-compliance | M5, M8 | UC-01, UC-02, UC-27, UC-28 |
| M7 | Free agents | /registrations (pool) | /registrations | /captain/free-agents | /register/free-agent | registration-v2 free-agent-pool | M6 | UC-03 |
| M8 | Finance: invoices, payments, wallet, refunds | /finance, /finance/ar, /finance/[id], /payments | /finance | /captain/dues | /payments | finance | M5, M6 | UC-15 to UC-18 |
| M9 | Captain team registration (approval gate) | /seasons/[id]/applications, /division-applications | /divisions/[id] | /captain/register | none | team-applications, captain | M3, M5 | none |
| M10 | Roster and invites | /rosters, /transfers | /teams/[teamId] | /roster, /captain/roster, /captain/invites, /captain/join-requests | /team | roster-membership, captain, registration-v2 team-invites | M4, M9 | UC-04, UC-33 |
| M11 | Eligibility, documents, suspensions | /eligibility, /documents | none | /captain/compliance | /compliance | registration-compliance, game-operations suspensions | M6, M10 | UC-05, UC-14, UC-29 |
| M12 | Venues and scheduling | /venues, /scheduling/* | /venues, /scheduling/* | /schedule | /schedule | scheduling-inventory, scheduler Edge Function | M3, M4 | UC-06 to UC-10 |
| M13 | Games, events, lineups | /games, /games/[id], /game-events | none | /lineups, /lineups/[gameId] | none | game-operations | M12, M10 | UC-11, UC-12 |
| M14 | Stats and standings | /stats | none | /stats | /stats | stats | M13 | UC-13 |
| M15 | Communications and notifications | /communications | /communications/compose | /comms | /notifications | communications, org-admin broadcast | M1, M4 | UC-19 to UC-21 |
| M16 | Team store | none | none | /captain/store | /store | team-store | M10 | UC-25, UC-26 |
| M17 | Audit and reports | /audit, /reports, /no-show-report | /audit | none | none | audit, reports | all writes | none |
| M18 | Data migration | /data-migration | none | none | none | data-migration | M2 to M4 | none |
| M19 | Video | none | none | none | /video | none | M13 | UC-22 to UC-24 |
| M20 | Referees and substitutes | games/[id] officials | none | none | none | game-operations officials | M13 | UC-30, UC-31 |
| M21 | Parent / multi-child | none | none | none | /parental-consent/[token] | registration-compliance | M6 | UC-28, UC-32 |

---

## 3. Cross-app journeys

Each journey names every step as `role @ surface → action`. A journey
depends on the journeys listed under "Needs". If a needed journey fails,
this one is `blocked`, not `fail`.

| ID | Journey | Steps | Needs | Spec | Status |
|---|---|---|---|---|---|
| J1 | Org, league, season, division setup | super_admin @ SA /org-setup → creates org, league, season, divisions → org_admin @ OA sees them in /leagues, /seasons, /divisions | none | journeys/j01-setup.spec.ts | fail (SETUP-6 team create 500, SETUP-2 no edit, SETUP-10) |
| J2 | Invite admin and sign in | super_admin @ SA /users → invite org_admin with org scope → invitee signs in @ OA → lands on own org only | J1 | journeys/j02-invite.spec.ts | pass with defects (SETUP-8 no invite email, SETUP-7, SETUP-17) |
| J3 | Build and publish registration form | org_admin @ OA /forms (or SA /forms) → season, divisions, pricing, questions, waivers → publish → season status registration_open | J1 | journeys/j03-form.spec.ts | fail (REG-10, REG-12, REG-14, REG-5) |
| J4 | Player registers and pays | anonymous/player @ PL /register → funnel → waiver sign → invoice → PL /payments shows invoice → admin @ SA/OA /registrations sees submission → approve | J3 | journeys/j04-player-registration.spec.ts | fail (REG-1, REG-2, REG-3, REG-4, REG-8, REG-9) |
| J5 | Minor with parental consent | player @ PL funnel with minor DOB → consent pending → parent opens /parental-consent/[token] → signs → registration unblocks for admin | J3 | journeys/j05-minor-consent.spec.ts | fail (REG-6, REG-7 dead end, REG-15) |
| J6 | Free agent placed on team | player @ PL /register/free-agent → captain @ TA /captain/free-agents or admin pool → assign → player @ PL /team shows the team | J3, J8 | journeys/j06-free-agent.spec.ts | fail (CAP-3, CAP-7, CAP-9, CAP-10) |
| J7 | Captain registers team (approval gate) | captain @ TA /captain/register → picks season + division → admin @ SA /seasons/[id]/applications approves → captain @ TA sees approved, set-up wizard → team appears in SA /divisions/[id] | J3 | journeys/j07-team-application.spec.ts | fail (CAP-2 denied division confirmed, CAP-4, CAP-5, CAP-6) |
| J8 | Captain invites player | captain @ TA /captain/invites → creates invite → invite link opened by player @ PL → player joins → captain @ TA /captain/roster shows player | J7 | journeys/j08-captain-invite.spec.ts | fail (CAP-1 invite cannot be accepted) |
| J9 | Eligibility and documents | player @ PL /compliance uploads ID → admin @ SA /documents verifies → SA /eligibility status changes → captain @ TA /captain/compliance reflects it | J4 | journeys/j09-eligibility.spec.ts | fail (COMP-5, COMP-1 not built, COMP-2, COMP-3) |
| J10 | Schedule generate and publish | admin @ SA /venues (rink, ice slots) → /scheduling/[seasonId]/generate → conflicts → publish → captain @ TA /schedule and player @ PL /schedule show games → notification in PL /notifications | J7 | journeys/j10-schedule.spec.ts | blocked (SCH-1 Edge Functions not deployed to staging); SCH-2, SCH-6 |
| J11 | Game day to stats | captain @ TA /lineups/[gameId] sets lineup → admin/scorekeeper @ SA /games/[id] enters goals, penalties → finalize → SA/TA/PL /stats and standings update | J10 | journeys/j11-game-stats.spec.ts | fail (SCH-22, SCH-12, SCH-13, SCH-17) |
| J12 | Suspension blocks lineup | admin issues suspension (or auto from penalty) → player shows suspended in TA /captain/compliance → lineup refuses player | J11 | journeys/j12-suspension.spec.ts | not built (COMP-10, COMP-11) |
| J13 | Invoice, pay, refund, overdue | admin @ SA /finance creates invoice → player @ PL /payments pays → admin refunds from SA /finance/[id] → wallet credit visible to player → overdue reminder | J4 | journeys/j13-finance.spec.ts | fail (MON-1 invoice create 500, MON-4, MON-5) |
| J14 | Captain splits dues | captain @ TA /captain/dues → split team fee across roster → each player @ PL /payments sees their share | J7, J8 | journeys/j14-dues-split.spec.ts | fail (MON-7, MON-8 split not saved) |
| J15 | Announcement and team message | admin @ OA /communications/compose (league-wide) → player @ PL /notifications receives; captain @ TA /comms → team players receive | J8 | journeys/j15-comms.spec.ts | fail (MON-2, MON-3, MON-12 not built) |
| J16 | Team store | captain @ TA /captain/store sets up store → player @ PL /store sees it and orders | J8 | journeys/j16-store.spec.ts | partial (catalog works; ordering not built, MON-15) |
| J17 | Role isolation | each role on each app: org A user never sees org B rows; wrong-role user is blocked | J1, J2 | auth/role-gates.spec.ts + journeys/j17-isolation.spec.ts | fail (SETUP-15 league_admin sees sibling seasons); org_admin isolation pass |

---

## 3a. Status after the fix rounds (staging, 2026-10-23)

Observed in Playwright on staging (`codex/staging` at 530d8f8), one
role per browser, run one journey group at a time. "Fixed" means the
round-1 failure no longer happens in the browser; it does not mean the
journey is complete. Unbuilt use-case steps stay listed under "Open".

| Journey | Fixed and seen working in the browser | Open (not built, or not yet verified) |
|---|---|---|
| J1 setup | Team create with blank rink (SETUP-6); status menu offers legal moves only (SETUP-4); sport defaults from the org, else empty (SETUP-3) | Edit org/league/season/division/team after creation (SETUP-2); add a season to an existing league (SETUP-10) |
| J2 invites | Invites with scope pickers; invitees sign in to their own app; /users lists every account | No invite email on staging (no RESEND key); magic-link invite 500 (SETUP-8) |
| J3 form | Season picker lists the new season; form builds and publishes; real registration link on Review | Prices typed in cents; no early-bird; registration type not saved (REG-14) |
| J4 player registration | Wrong password rejected on funnel Sign in (REG-1, screenshot "Email or password is incorrect."); existing email needs its password (REG-2); org admin sees submissions with names (REG-4/17) | Anonymous /register redirects to sign-in (REG-9); waiver skipped when text empty (REG-5); payment is a mock (owner decision: keep dummy) |
| J5 minor consent | Guardian consents from the link; minor continues; registration reaches approved (REG-7); consent tokens signed (REG-6) | Guardian signature/consent record not stored (REG-15) |
| J6 free agent | Free agent lists self; captain claims | Pool follows newest division entry (CAP-7); no accept/decline step (CAP-9); no admin pool view (CAP-10) |
| J7 team application | Apply, approve, deny; set-up wizard refuses an unapproved division (CAP-2) | Wizard does not preselect the approved division; no "Register the team" entry in season (CAP-6); denial reason not shown (CAP-5) |
| J8 captain invite | Full player-app link; invitee opens it and joins; invite marked accepted (CAP-1, UC-04) | No invite email (CAP-4) |
| J9 eligibility | Player /compliance shows real status (COMP-5); USA Hockey ID submit works (COMP-2); captain view scoped with names | No ID review queue (COMP-1, UC-29); no file upload (COMP-3) |
| J10 schedule | Scheduler functions answer on staging (SCH-1); slots carry a season (SCH-2) | Generate needs 2+ teams in a division and no admin screen places a team (SCH-4); no reschedule (SCH-6) |
| J11 game to stats | Event player picker lists the team roster (SCH-22) | Assists/PIM not counted; finalize does not update stats; scorekeeper/league admin cannot run a game |
| J12 suspensions | — | Not built (COMP-10/11) |
| J13 finance | Invoice create (MON-1); composer with people, payment plan, Create and send / Save draft; org admin sees own invoices; no demo data (MON-17) | No fee schedule picker; refund ledger issues (MON-9) |
| J14 dues | Per-player Remind (MON-7) | Custom split not saved (MON-8) |
| J15 comms | Announcements delivered; player inbox shows them; unread count drops in place (MON-2/3) | No league/division targeting (MON-13); captain team message not built (MON-12) |
| J16 store | Captain adds product; player sees it | Ordering not built (MON-15) |
| J17 isolation | org_admin: 0 org-B leaks across 11 pages, 4 direct URLs and all payloads; league_admin season filter fixed in code (SETUP-15) | league_admin browser check pending a clean run |

Cross-cutting fixes verified: lists no longer stop at 25 rows
(fetchAll in every app); super-admin-only endpoints no longer hidden as
empty states for players, captains and org admins; garbled characters
removed; assistant button no longer covers submit buttons.

Test-environment notes: the local ISP DNS hijacks `*.supabase.co`
(resolves to 183.82.14.22); runs pin the real edge IP via
`E2E_SUPABASE_IP`. Under parallel load some pages showed the error
boundary; not reproduced in single runs, cause unconfirmed.

## 4. Backend with no screen (found by static sweep, 2026-10-23)

Typed SDK methods that no page calls. Each is a candidate gap, to be
confirmed against the PPHL use case before building UI.

| Area | SDK methods with no caller | PPHL impact |
|---|---|---|
| Suspensions | gameOps.issueSuspension, liftSuspension, serveSuspension | UC-14: admin cannot issue or lift a suspension from any screen |
| Dues splits | finance.createSplit, createSplitsBatchEqual, patchSplit | UC-16: check what /captain/dues actually calls |
| Invoices | finance.createInvoice, sendInvoice, reconcileInvoice, updateFeeSchedule | UC-15/17: check what /finance/create calls |
| Wallet | finance.freezeWallet, unfreezeWallet, issueWalletCreditForPerson | UC-17 credit path |
| League setup | leagueMgmt.updateLeague, assignTeamCaptain, setTeamStatus | cannot edit a league after creation |
| Venues | schedulingInventory.updateVenue, deleteVenue, updateSurface, updateIceSlot | cannot fix a rink or ice slot typo |
| Officials | gameOps.officialsForPerson, updateOfficialStatus | UC-30: referee cannot see or accept assignments |
| Notifications | communications.myUnreadCount, pushSubscribe | UC-21 push |
| Invites | GET /public/registration/invites/:token has no caller; captain invite form shows `/invite/<token>` but no app has an `/invite` route | UC-04 likely broken |

---

## 5. Bug log

Bugs found by the journey runs are logged in
[pphl-bug-log.md](pphl-bug-log.md) in the format from CLAUDE.md.
