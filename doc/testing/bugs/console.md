# Admin console audit bug log (crawl, 24 Oct 2026)

Tester: full-surface crawl (`tests/e2e/audit/crawl.spec.ts`) signed in as
each role on its app, staging **and** production (read-only), plus a
league-admin probe. Context: PPHL (Ven), 24 Oct: "404 errors all over the
place ... so many modules and subdomains". Evidence:
`test-results-audit/crawl-<role>.json` (staging) and
`test-results-audit/prod/crawl-<role>.json` (production), one record per
page visited (status, h1, 404 / error / could-not-load flags, failed API
calls, console errors, load time).

Crawl totals (pages visited / pages with a problem):

| Role | Staging | Production |
|---|---|---|
| super_admin (admin console) | 129 / 3 | 127 / 3 |
| league_admin (admin console) | 78 / 19 | 73 / 18 |
| org_admin (org console) | 68 / 1 | 68 / 1 |
| captain (captain app) | 17 / 0 | 15 / 0 |
| player (player app) | 21 / 0 | 18 / 0 |

---

[CONSOLE-1] Every API failure renders Next's "404 This page could not be found" · blocker
  Journey: all · M1–M17 (every detail page)
  Surface: superadmin-web, org-admin-web, team-admin-web, player-web
  Repro:
    1. Sign in as any admin. Open any detail page (team, season, user, game, invoice, form…) while the API answers 403 or 500 (the 22 Oct EMAXCONN outage did this for every call).
  Expected: "Could not load this team. This is a server problem on our side" (or "Your role does not have access") with a retry; a 404 only when the record does not exist.
  Actual: 43 pages did `.catch(() => null)` then `notFound()`, so a 403/500/timeout became a 404 page. This is what PPHL saw on Thursday night.
  Evidence: grep of `notFound()` after a swallowed fetch (58 call sites, 43 files); crawl as league_admin: `/users/:id` → 404 because `GET /iam/users/:id` returned 403.
  Root cause: loaders discard the HTTP status. Fix: `load()` (`packages/api-client/src/load.ts`) + `LoadError` (`packages/ui/src/load-error.tsx`); every page now calls `notFound()` only on API 404. Commit c66e81f. Not yet deployed (push blocked, see report).

[CONSOLE-2] Roles rows link to /roles/:id, which does not exist · major
  Journey: J2 · M1
  Surface: superadmin-web /roles (staging and production, super_admin)
  Repro: 1. Open /roles. 2. Click any role code.
  Expected: the role's page (permissions, who holds it).
  Actual: "404 This page could not be found" (HTTP 404). 13 dead links on the page.
  Evidence: crawl superAdmin staging + prod, 3 × `/roles/:id status=404`.
  Root cause: list linked to a page that was never built. Fix: `apps/superadmin-web/src/app/(admin)/roles/[id]/page.tsx` (commit c66e81f).

[CONSOLE-3] League admin: Users and Forms say "Could not load"; Registrations, Division applications, Transfers, Eligibility say "Super admin access required"; Documents and Game events show an empty list as if true · blocker
  Journey: J1/J2/J3/J4/J7/J9 · M1, M5, M6, M9, M10, M11, M13
  Surface: superadmin-web as league_admin (staging and production)
  Repro: 1. Sign in as a league admin (the role PPHL's league operators get). 2. Open each page.
  Expected: the league's users, forms, registrations, applications, transfers, eligibility and documents; nothing from other organisations.
  Actual: `GET /iam/users` 403 → "Could not load users"; `GET /registration/forms` 403 → "Could not load forms"; `/registration-v2/admin/submissions` 403; `/league/division-team-entries` 403; `/league/admin/transfers` 403; `/compliance/eligibility/season/:id/{summary,duplicates}` 403; `/compliance/documents` 403 swallowed → "No documents yet" (10 exist); `/game-events` 403 swallowed → "No events yet" (24 exist); every detail page's admin picker (`/iam/users?roleCode=…`) 403.
  Evidence: `test-results-audit/crawl-leagueAdmin.json` (19 problem pages) and `prod/crawl-leagueAdmin.json` (18); probe log in the session scratchpad.
  Root cause: 26 controllers are `SuperAdminGuard` at class level although league admins were moved into this console in P5-D. Fix (commit 3ad966b): `ScopedAdminGuard` + `shared/auth/visibility.ts`; reads filtered to the caller's orgs/leagues (league-owned records use orgWideOrgIds ∪ leagueIds), out-of-scope → 404. Covered: users, roles catalogue, role assignments, forms (+versions), pricing tiers, registrations queue, division entries, transfers, eligibility (+summary, duplicates), documents (+versions). Still super-only (league admin sees "Could not load" honestly): finance invoices/AR, game events, suspensions, reports, notification templates, imports — listed in the matrix as open.

[CONSOLE-4] League admin: user detail page is a 404 · major
  Journey: J2 · M1
  Surface: superadmin-web /users/:id as league_admin
  Repro: 1. As league admin open /organizations/<org>. 2. Click an org admin's name.
  Expected: the user's page.
  Actual: "404 This page could not be found" (API 403 masked as 404, CONSOLE-1 + CONSOLE-3).
  Evidence: crawl leagueAdmin staging `/users/83587f09-…` → 404.
  Root cause: as above. Fix: both commits.

[CONSOLE-5] League admin sees super-admin-only modules in the navigation · minor
  Journey: — · navigation
  Surface: superadmin-web sidebar as league_admin
  Repro: sign in as league admin.
  Expected: only the modules the role can use.
  Actual: "Admin Console" (opens to "Restricted to super-admin" + "STATUS API unreachable" because the health call 403s) and "Data Migration" are offered. 30 nav items for a role that can use ~20.
  Evidence: crawl leagueAdmin `/admin` text "STATUS API unreachable".
  Root cause: sidebar had no role filter. Fix: `superOnly` items hidden for non-super admins (commit c66e81f).

[CONSOLE-6] Org admin: division page links the organisation to /organizations/:id, which the org console does not have · minor
  Journey: J1 · M2/M3
  Surface: org-admin-web /divisions/:id → Organization link
  Repro: 1. As org admin open a division. 2. Click the organisation name under Identity.
  Expected: the organisation page (/organization).
  Actual: "404 This page could not be found" (staging and production).
  Evidence: crawl orgAdmin staging + prod, `/organizations/<id> status=404 from /divisions/<id>`.
  Root cause: shared `DivisionDetail` defaulted to the admin console's route. Fix: `orgHref` prop; org-admin passes `/organization` (commit c66e81f).

[CONSOLE-7] Placeholder pages in the navigation: captain "Communications" (Coming soon), player "Video" (coming soon), player and captain "Team store" (CHECKOUT SOON) · minor
  Journey: — · M15, M16, M19
  Surface: team-admin-web /comms, /captain/store; player-web /video, /store
  Repro: open the pages from the sidebar.
  Expected: either a working feature or no entry (PPHL: "we cannot move forward unless we pin down the major components of our first release").
  Actual: construction/coming-soon placeholders reachable from the main navigation.
  Evidence: crawl teamAdmin `/comms` placeholder "Coming soon"; player `/video` "Video pipeline coming soon"; `/store` "CHECKOUT SOON".
  Root cause: later-release modules shipped as nav entries. Fix: removed from the menus (routes stay reachable by URL), commit c66e81f. Reversible in one line each; PPHL to confirm the release-1 list in the matrix.

[CONSOLE-8] Six sign-in subdomains, no single entry point · major (product)
  Journey: — · all
  Surface: landing-web nav + CTA: superadmin., league., org., team., player.sportspulse.us
  Repro: open sportspulse.us → "Sign in".
  Expected: one sign-in that routes by role.
  Actual: five app links; a league admin must know that "league." is a redirect to the admin console. PPHL: "so many modules and subdomains, which I don't understand".
  Evidence: `apps/landing-web/src/components/landing/nav.tsx:91-95`, `section-cta.tsx:15-19`.
  Root cause: per-app sessions by design (owner directive 2026-05-09). Not changed; proposed in the matrix as a release-1 decision (single sign-in page that forwards to the right app by role).

[CONSOLE-9] Admin registrations page fails for every admin once a minor has registered: "Invalid status: pending_consent" · blocker

  Journey: J4/J5 · M6

  Surface: superadmin-web /registrations (super admin, staging-v2 crawl 24 Oct after the honest-banner fix; before it the KPI hero silently showed zeros)

  Repro: 1. A minor registers (status pending_consent, written by the v2 funnel). 2. Open /registrations as any admin.

  Expected: the queue and KPIs.

  Actual: GET /registration/registrations 500s: the registration-compliance domain keeps its own status list (v1 names pending_parental_consent / pending_email_verification) and rejects the kernel v2 names pending_consent / pending_verification. Two sources of truth for one enum (CLAUDE.md anti-pattern).

  Evidence: test-results-audit/staging-v2/crawl-superAdmin.json (/registrations errorBoundary, text Invalid status: pending_consent); staging has 2 rows in pending_consent.

  Root cause / fix: statuses.vo.ts now accepts both name sets with transitions (commit below). Follow-up: derive the domain list from @sportspulse/kernel REGISTRATION_STATES and migrate the v1 names.

[CONSOLE-10] Dialog close icon has no accessible name; the only control named "Close dialog" is the backdrop · minor

  Journey: J1 · M2

  Surface: superadmin-web Choose the org admin dialog (and the shared Dialog primitive)

  Repro: open any dialog; inspect the X button.

  Expected: the X button is named Close (screen readers, tests).

  Actual: X is an unnamed button with an icon; aria-label Close dialog sits on the backdrop div (snapshot test-results-journeys-setup-v2/journeys-j01-setup-*/error-context.md).

  Root cause: components/ui/dialog.tsx labels the backdrop, not the icon button. Fix pending.

[CONSOLE-11] Organizations list does not show the new org when the org-admin step is dismissed · major

  Journey: J1 step 1, J17 step 1 · M2

  Surface: superadmin-web /organizations → New organization → Create → close Choose the org admin

  Repro: 1. Create an organization. 2. Close the Choose the org admin step without picking anyone.

  Expected: the new row appears in the list (same-surface refresh).

  Actual: list still says Showing 31 of 31; the org exists in the database (setup-v3 run, orgs PPHL E2EMVMLO6VD and Org B E2EMVMLR7L4 created 16:15/16:17 UTC).

  Root cause: CreateOrgDialog.close() only reset state; router.refresh() ran on Done only. Fixed: refresh on close when an org was created.

[CONSOLE-12] League admin's audit log shows sibling leagues' history · major (data isolation)

  Journey: J17 step 3 (staging ship run of 24355fb, 25 Oct)

  Surface: superadmin-web /audit as league_admin; API GET /audit

  Repro: sign in as a league admin whose org has other leagues; open the Activity log.

  Expected: own actions and events on own league's leagues, seasons, divisions and games only.

  Actual: 2 sibling-league names in the page and in the /audit payload. On staging the league admin could read all 391 of the org's events.

  Root cause: audit.controller.ts filtered by scope.orgIds (league grants project their org) and used AuthorizedAccessGuard, whose scope also widens with roster spots.

  Fix: ScopedAdminGuard (admin roles, admin scope) and visibleAuditWhere in shared/auth/visibility.ts; event by id outside scope is 404. Verified on the local API against staging: 125 of 391 events, 0 from 58 sibling leagues.

[CONSOLE-13] Wrong-role sign-in shows no reason on org, team and player apps · minor

  Journey: J17 step 5 (staging ship run of 24355fb, 25 Oct)

  Surface: sp-org-admin, sp-team-admin, sp-player /sign-in after signing in with an account of another role

  Repro: sign in to the org app as a captain.

  Expected: a message saying the account is signed in but is not an org admin, and what to do.

  Actual: the sign-in form comes back empty with no message (body text ends "Email / Password / Sign in"). Access itself is blocked correctly.

  Root cause: the three sign-in pages set the wrong_role message only in useState's initial value; the redirect back to /sign-in?error=wrong_role reuses the mounted component, so it never showed. The message also sat below the password field.

  Fix: derive the message from the URL on every render and show it above the form, in all three apps (superadmin already had a recovery panel).

[CONSOLE-14] List pages without a query string ignore router.refresh() · local build only (not reproduced on deployed staging) · closed: local harness

  Journey: J1 step 1 (also CONSOLE-11's symptom); reproduced 25 Oct on a local production build (next build + next start) against staging data.

  Surface: superadmin-web /organizations and /teams (any URL without ?query)

  Repro: open /organizations; create an org (dialog or API); call router.refresh().

  Expected: the new row appears without a reload.

  Actual: the refresh request returns 200 in under a second and its RSC payload contains the new row ("Showing 37"), but the page keeps "Showing 36 of 36". The same refresh on /organizations?search=Iso updates the list. A full reload always shows it. The game page (/games/[id], refresh inside a React transition) updates fine.

  Evidence: scratchpad regfa/refresh-isolate.mjs, refresh-org-q.mjs, repro-org.mjs output (payload hasNew=true, count=37; page unchanged).

  Not the cause (checked): API or fetch caching (no-store, payload is fresh), connection limits, UrlFilters (no replace on mount), console errors (none).

  Deployed staging (24355fb) does not show it: list-filters and pdf-items 3/7 change the URL with router.replace on the same pages and pass there, while they fail on the local next start build. Treated as a local-stack artifact; local runs are not evidence for refresh/replace on query-less list URLs. CONSOLE-11's dismiss-after-create path now navigates to ?created=<id> (row marked New) instead of refreshing.

  Update 26 Oct: wider than list pages on the local build. /games/[id] (after logging an event), /persons/[id] and
  /leagues/[id] also keep their old content after router.refresh() locally, although the refresh payload carries the new
  data (regfa/debug-refresh.mjs: payload "1 entry", page "0 entries"). The same probe on deployed staging updates both
  /leagues/[id] and /leagues (regfa/debug-samepage-staging.mjs 2/2), and the COMP-11 walk on staging passed both
  same-page updates (event log 0.9 s, Change games). Status: closed as a local harness artifact, not a product defect;
  same-page refresh is verified on staging only.

  25 Oct, ruled out: a hydration mismatch (CONSOLE-16). After the locale fix there is no React #418 on /organizations, /users, /games/<id>, /leagues/<id>, /forms, /teams, /teams/new, /leagues or /seasons (regfa/walk-hydration.mjs 18/18), yet J1, J2, J17, list-filters, pdf-items 3 and blockers-oct24-b item 2 still fail the same way locally. Cause still unknown; deployed staging stays the judge.

[CONSOLE-15] Notices written by database jobs never send; "Flush queued" would send months-old ones · major

  Journey: production email go-live check, 25 Oct (production read-only queries; fix verified on staging).

  Surface: superadmin-web /communications ("Flush queued"); every notice written by a database job (overdue sweep, compliance sweep, invite expiry).

  Repro: production notifications, read-only: 494 email rows queued, oldest 4 May (453 compliance-sweep rows with no recipient; about 40 with a recipient: payment confirmations, overdue stages 2 to 4, invite reminders). 0 have an attempt.

  Expected: a notice is sent soon after it is written, or not at all. A notice from May must never reach a person in October.

  Actual: only the API's own inline send ever dispatches a row. Rows inserted by SQL jobs stay queued forever, so the overdue sweep's email reminders (UC-18) would never go out. The only drain is "Flush queued", which sends the oldest 100 queued rows, whatever their age; with the email key live, one click would mail months-old notices to real people.

  Fix: the existing 5-minute retry job (POST /notifications/cron/retry-failed, pg_cron) also sends queued email, in-app and push rows from the last 24 hours that are at least 2 minutes old (the inline send keeps its turn). "Flush queued" sends only the last 24 hours and reports how many older rows it skipped; the button shows that line. SMS has no provider and is left alone. Older rows stay queued, untouched.

  Evidence: local API (no email key) against staging, scratchpad regfa/verify-queued.mjs 14/14: recent in-app row sent by the sweep; recent email enters the send path (failed "RESEND_API_KEY not configured", attempt 1, then the normal retry backoff); 3-day-old email untouched by sweep and flush; 30-second-old row left to the inline send; SMS left alone; wrong cron secret 403; flush sends a fresh row (sent 1) and reports skippedStale 27; a player cannot flush (403). Seeds deleted.

  Production before email goes live: the retry job runs every 5 minutes and answers 201; all 30 failed email rows are at 3 attempts, so none is retried.

[CONSOLE-16] Money and dates follow the viewer's locale: React hydration errors and "$1,18,572.18" · major

  Journey: J13 step 5 (local build against staging, 25 Oct); org Finance showed "$1,18,572.18" earlier the same day.

  Surface: every app (super admin, org, team, player, landing) and the shared admin pages: money, counts, dates and times.

  Repro: open super admin /finance in a browser whose locale differs from the server's (local: server en-IN, browser en-US; Vercel: server en-US, a viewer in India on en-IN).

  Expected: one format for a US league billing in USD ("$118,572.18"), and server and browser render the same text.

  Actual: 28 format calls passed no locale (Intl.NumberFormat(undefined, ...), toLocaleString(), toLocaleDateString(undefined, ...)), so the server and the browser produced different text. React threw error #418 (hydration text mismatch) on every load of /finance (6 of 6) and re-rendered the page on the client, which also wiped text typed in the search box during that moment. Viewers outside en-US saw Indian digit grouping on dollar amounts.

  Fix: every one of the 28 calls pins "en-US" (the kernel already did for its dates). Time zones are not changed here: times still render in the server's zone first and the browser's after.

  Evidence: local stack against staging, browser en-US and en-IN, scratchpad regfa/walk-hydration.mjs 32/32 (no #418 on super admin /finance, /dashboard, /games; org /finance, /; player /, /payments; team /captain/dues; US grouping everywhere). Before: #418 on 6 of 6 loads (regfa/walk-finance-race.mjs).

  Follow-up: twelve apps/packages each carry their own money formatter; move one into packages/kernel and import it everywhere.

[CONSOLE-17] Lists past one page skipped and repeated rows (cursor did not match the sort order) · major

  Journey: J2 on deployed staging (25 Oct): /users showed Type "—" for the staging org admin, whose org_admin role is one of the oldest of 144 active assignments.

  Surface: every "load all pages" reader of games, game events, invoices, role assignments, notifications, import jobs and roles (schedules, rosters, season overview, users Type, Communications, Finance readers).

  Expected: walking the pages returns every row once.

  Actual: these lists sorted by one column (created_at, scheduled start, event time, role code) but paged by `id > cursor` (random UUID order). Before the fix, walking staging with small pages returned 38 of 144 active role assignments, 212 invoice rows for 893 (97 repeats, 778 missing), and notifications with 31 repeats and 53 missing. Production today is small (31 games, 69 assignments, 21 invoices) except notifications (565); a PPHL season passes 100 games quickly.

  Fix: shared keyset paging (apps/superadmin-api/src/shared/pagination/keyset.ts): the cursor carries "<sort value>|<id>", the next page starts after that pair, ORDER BY adds id as the tie-break. Timestamps compare at millisecond precision, because the cursor goes through a JS Date and bulk inserts share a created_at (the first version still lost 73 bulk team invoices). An old plain-id cursor falls back to the previous rule, so a request in flight during a deploy cannot loop.

  Evidence: local API against staging, scratchpad regfa/verify-keyset.mjs, walking with small pages and comparing with the database: 8/8 lists exact (role assignments 144/144, roles 13/13, games 25/25, invoices 893/893 in pages of 97 and of 23, in-app notifications 173/173, all notifications 1495/1495, game events 37/37 in pages of 6); 3 runs in a row 8/8. One earlier run had one failing case that was not captured (likely rows written to staging during the walk; not verified). Unit tests 3/3.

  Not changed: notification templates sort by code, channel and locale and still page by id; production has 0 template rows (the catalogue is in code).
  Templates, 26 Oct: they now page on code, channel, locale and id (an old id cursor starts from the top). Local API
    against staging with 7 throwaway rows inserted out of order (regfa/verify-template-paging.mjs 2/2): pages of 3 give
    the same 7 in the same order as one page.

[CONSOLE-18] Dates follow the viewer's time zone: hydration errors, and a season date shown a day early · major
  Found: 26 Oct, React #418 on /leagues/<id> during the CONSOLE-14 probes; the dev server named the text.
  Actual: client components formatted dates with no time zone. The server renders in UTC and the browser in the
    viewer's zone, so the text differed and React re-rendered the page: /leagues/<id> and /organizations/<id> (role
    "since" date), /teams/<id> (team movement dates), /division-applications (applied date), /forms/<id> (season
    dates). Date-only values were also wrong, not just different: a season starting Nov 22 read "Nov 21" for anyone
    west of UTC (season setup panel; scheduling parity windows the same way).
  Fix: kernel formatCalendarDate prints a calendar date as written for every reader; @sportspulse/ui LocalDate prints
    a moment in the reader's zone after first rendering the same text as the server. Season moments (registration
    opens, roster lock) print in the season's zone with formatInZone.
  Evidence: dev server, browser in America/New_York, server in UTC, regfa/hydration-probe.mjs: before, one mismatch
    each on the five pages above (2026-10-25 vs 2026-10-26; Nov 21 vs Nov 22); after, 0 on those five and on 14 more
    (/dashboard, /seasons, a season, a division, /games, a game, /scheduling, /registrations, /payments,
    /communications, /users, /teams, /eligibility, /audit).
  Not swept: about 35 other client components format moments without a zone (lists filled after the page loads, so
    no mismatch, but the zone is the browser's). Org, captain and player apps not probed in dev mode this round.

[CONSOLE-19] A failed call for the user's scope reads as an empty org, team or player · major
  Found: list-filters on staging 006939b (26 Oct): the org /leagues page showed "0 active · 0 total" and "No leagues
    yet" for an org with 79 leagues. The staging org admin's assignment was unchanged; the list call itself was not
    reached because the scope call had failed.
  Actual: 55 pages in the org, captain and player apps loaded the scope with iam.meScope().catch(() => null). A failure
    left no org or team id, so the page rendered as if the user had none: "No leagues yet", "Captain role required",
    "Not on a roster yet". The data was there; only the call had failed. A user with no org gets a scope with empty
    lists, never null, so null only ever meant a failure.
  Fix: each app's server API exports loadMeScope(): one retry, then the error goes to the app's error screen ("We
    couldn't load this page ... Try again"). All 55 call sites use it.
  Evidence: local org app against staging: with the API up /leagues shows "Showing 85 of 85 leagues"; with the API
    stopped it shows the error screen, not "No leagues yet". Typecheck of the three apps.
  Not found: why the scope call failed during the staging run (no reproduction; pages load in about 1 s on their own).

[CONSOLE-20] API instances keep pooler connections after use; staging pages fail with EMAXCONN · major
  Found: staging journeys failed at random (list-filters, J7.3 pricing, J10 brackets). Vercel logs for sp-api on 26 Oct
    showed "PostgresError: (EMAXCONN) max client connections reached, limit: 200" on /api/iam/me/scope, /api/games and
    /api/league/teams. The org app then logged "[scope] meScope failed, retrying once" (CONSOLE-19).
  Actual: the API runs on Vercel Fluid compute. An instance is suspended as soon as its last response ends, and a
    suspended or discarded instance keeps its open sockets to the Supavisor pooler. The pool closes unused connections
    after an idle timer, but that timer cannot run while the instance is suspended. The 23 Oct fix (4 per instance,
    5 s idle, d248740) lowered the rate but not the cause. Measured on staging with no traffic: 177 of the 200 pooler
    client slots held at 02:34 UTC, 87 at 02:38 UTC. The database itself had 6 backends, so the cap is the pooler
    client count, not Postgres.
  Fix: api/index.ts keeps each instance awake after a response (waitUntil from @vercel/functions) until the pool idle
    timeout has closed the connections that request used. This is what Vercel attachDatabasePool does for pg; that
    helper does not support postgres.js. Idle timeout lowered from 5 s to 2 s to keep the extra awake time short.
  Evidence: probe script opens pooler clients until Supavisor refuses, then closes them; held = 200 - opened.
  Not verified: production. The same code and pooler limits apply there; the probe was not run on production because
    it briefly fills the pooler.

[CONSOLE-21] After "Invite user", the new user was sometimes missing from /users until a reload · minor
  Found: J2.2 on staging, 2 of 4 runs (26 Oct): invite 201, "Account created for ...", Close, and no row for the new
    user within 15 s. 3 direct repeats showed the row in 1.3-1.8 s.
  Actual: the dialog refreshes the list right after the invite; when that refresh is sent while the page's link
    prefetches are still loading it can be dropped (the same pattern REG-28 found on the org admin's queue).
  Fix: the dialog refreshes the list again when it closes after an invite.
  Evidence: regfa/repro-invite-refresh.mjs 3/3 before the change; J2 in the next staging run.

[CONSOLE-22] Pages that fetch one list per season or per org ran the database pooler out of connections · major
  Found: list-filters on staging c043a5a (26 Oct), 2 of 5 runs: the org admin's /teams or /seasons page showed "We
    couldn't load this page". Live API logs during a repeat (07:32 UTC) showed dozens of /api/league/divisions calls in
    the same second and "PostgresError: (EMAXCONN) max client connections reached, limit: 200", then the next pages
    failed.
  Actual: the org admin's Divisions, Compose and New invoice pages and the super admin's org detail and New invoice
    pages called listDivisions once per season, all at once (staging: 104 seasons in the org, 163 in total); the super
    admin's New invoice page also listed people once per org (73 orgs). Each request could start its own API instance
    with its own pool. CONSOLE-20 stopped idle instances holding connections; this was a burst.
  Fix: those pages read divisions with one paged call (the API already limits it to the caller's leagues) and keep the
    org's seasons; per-org people, the game labels on Game events and the venue details for rinks go six at a time
    (api-client mapLimit).
  Evidence: before the change the org admin's /divisions showed "Showing 147 of 147 divisions" (database: 147 in the
    org). Typecheck of both admin apps.
  Not verified: the change on staging (deploy cap: 96 of 100 deployments in 24 h at 07:45 UTC; next push after
    11:56 UTC).

