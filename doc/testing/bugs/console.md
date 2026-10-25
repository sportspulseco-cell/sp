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

[CONSOLE-14] List pages without a query string ignore router.refresh() · local build only (not reproduced on deployed staging)

  Journey: J1 step 1 (also CONSOLE-11's symptom); reproduced 25 Oct on a local production build (next build + next start) against staging data.

  Surface: superadmin-web /organizations and /teams (any URL without ?query)

  Repro: open /organizations; create an org (dialog or API); call router.refresh().

  Expected: the new row appears without a reload.

  Actual: the refresh request returns 200 in under a second and its RSC payload contains the new row ("Showing 37"), but the page keeps "Showing 36 of 36". The same refresh on /organizations?search=Iso updates the list. A full reload always shows it. The game page (/games/[id], refresh inside a React transition) updates fine.

  Evidence: scratchpad regfa/refresh-isolate.mjs, refresh-org-q.mjs, repro-org.mjs output (payload hasNew=true, count=37; page unchanged).

  Not the cause (checked): API or fetch caching (no-store, payload is fresh), connection limits, UrlFilters (no replace on mount), console errors (none).

  Deployed staging (24355fb) does not show it: list-filters and pdf-items 3/7 change the URL with router.replace on the same pages and pass there, while they fail on the local next start build. Treated as a local-stack artifact; local runs are not evidence for refresh/replace on query-less list URLs. CONSOLE-11's dismiss-after-create path now navigates to ?created=<id> (row marked New) instead of refreshing.

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
