# Production release checklist · 25 Oct 2026

For whoever ships `main` to production (sp-api, sp-superadmin, sp-org-admin,
sp-team-admin, sp-player, sp-landing). Production runs build `a2cf243`; local
`HEAD` is over 100 commits ahead of production and over 50 ahead of staging (`codex/staging`).

## Order matters

1. **Staging first.** Push `HEAD` to `codex/staging`, wait for all six
   Vercel projects READY, run the crawl and the journeys (the ship script in
   the session scratchpad does this and stops before production). Vercel Hobby
   allows 100 deployments a day; each push is 6 (landing deploys too). Push
   only `codex/staging` and `main`: any other branch push also deploys previews.
2. **Production migrations before production code** (needs the owner's go-ahead):

   ```
   pnpm --filter @sportspulse/db migrate --target=production --status
   pnpm --filter @sportspulse/db migrate --target=production --confirm-production
   pnpm --filter @sportspulse/db drift --target=production
   ```

   Pending on production today (read 25 Oct, 04:30 UTC):

   | Migration | What it does | Read by |
   |---|---|---|
   | `0053_overdue_sweep_fix.sql` | rewrites `sp_overdue_sweep` (the daily pg_cron overdue job) | pg_cron `sp-daily-overdue-sweep` |
   | `0054_compliance_document_submissions.sql` | document uploads and the review queue | compliance upload and review API (COMP-1/3/4) |

   Both are applied and drift-clean on staging. Rollback files sit beside them.

   **Done 25 Oct, 07:23 UTC** (owner's go-ahead; runner with `SUPABASE_ACCESS_TOKEN`
   from the root `.env` and `PROD_SUPABASE_REF`): status 41 recorded, 0 pending;
   drift clean (90 tables, 1135 columns). `sp_overdue_sweep` source matches
   staging (same md5, result columns, SECURITY DEFINER, grants postgres and
   service_role only). Both new tables have RLS on, no policies, no anon or
   authenticated grants. Dry run inside a rolled-back block on production data:
   0 marked, 0 late fees, 0 reminders, 0 failed; nothing persisted.
3. **Email.** On the `sp-api` Production environment set `RESEND_API_KEY` and
   `EMAIL_FROM_ADDRESS` (values in `apps/superadmin-api/.env`; sender domain
   `sportspulse.us` is verified). Without them every email notice is stored
   as "failed" with the reason; in-app notices still arrive.

   **Set 25 Oct** on `sp-api` Production only (key encrypted). They take effect
   with the next production deployment, which also carries CONSOLE-15: the
   5-minute retry job sends queued notices from the last 24 hours only, and
   "Flush queued" never sends older ones. Production held 494 queued emails
   from 4 May onward; none of them will be sent. All 30 failed emails are at
   3 attempts, so the retry job resends none.
4. **Push `main`**, wait for READY, then a read-only production crawl.

## What ships (by bug id, see `doc/traceability/MATRIX.md`)

Notifications: schedule published (SCH-8), postponed / cancelled games
(MON-14), eligibility waivers (COMP-7), captain team message (MON-12),
invoice issued (MON-22), player inbox without delivery pills (SCH-26).

Access: audit log scoped to the admin's league (CONSOLE-12), bulk invoice
target checked against the org (MON-20), wrong-role sign-in message
(CONSOLE-13).

Captain and player: rosters show one season and every player, not the first
page (CAP-19; dashboard totals too), invite opens the email
form (CAP-16), dues pages honest when no invoice exists (MON-16), free-agent
form loads saved entries (CAP-17), one A–D skill level list (REG-21),
printable receipts and no fake card update (MON-18).

Admin set-up: New form dialog binds the season (REG-20, CAP-23), Preview shows
the player's form (REG-22), prices in dollars and live tiers in open seasons
(REG-19), season toggles show the real defaults (REG-18 part), duplicate team
link (SCH-19), venue org not preselected (SETUP-16), invoice notes saved
(MON-18).

Added 25 Oct (local stack against staging, browser-checked):

- Game times show in the rink's zone on every server-rendered page (SCH-28).
  On Vercel they showed UTC: "Nov 5, 1:00 AM" for a 9 PM Eastern game.
- Money, numbers and dates use one US format; no React hydration errors in
  en-US or en-IN browsers (CONSOLE-16).
- Super admin Finance search, filters and paging work (MON-24); one New
  invoice button.
- Notices written by database jobs (overdue reminders) are sent within 5
  minutes; nothing older than 24 hours is ever sent (CONSOLE-15).
- Player Home notices without "queued" or raw codes (SCH-26 sweep); bracket
  refusal in words (SCH-27); org admins can open an invoice (MON-19).

Open, needs a decision: MON-23 (composer "Team" invoice vs captain Dues).

## Evidence level

Each fix above was proven on a local build of this code against the staging
database (API checks and browser walks, scripts and screenshots in the
session scratchpad), or by typecheck only where the commit says so. None of
it has run on deployed staging or production yet. Client navigation after an
action does not commit on the local `next start` stack (CONSOLE-14, local
only), so flows that end in a page change need the staging round.

## Not in this release

- Payments stay in test mode (founder decision): no card is charged.
- Open: COMP-11 automatic suspensions (needs a founder decision), MON-15 team
  store, MON-19 org-admin refunds and invoice detail, REG-18 remaining
  duplicate settings, early-bird pricing.

## Released 25 Oct 2026, 20:06 UTC

- `main` fast-forwarded to `3cee6a8` (116 commits; app code identical to staging build `c280304`, which passed the crawl
  with 0 problems for every role and the journeys except MON-23). All six production projects READY on `3cee6a8`
  (Vercel API).
- Read-only production crawl after the deploy: 342 pages as super admin, league admin, org admin, captain and player;
  0 problems.
- Email: the 5-minute job runs the new code (response has queuedPicked/queuedSent from 20:15 UTC). 491 queued emails
  older than 24 hours untouched. No email has been sent since the deploy because nothing has triggered one yet; the
  first real send is not yet observed.
- Known after release: SETUP-2 (admins cannot edit a team), MON-23 (decision), COMP-19 (sweep emails with no
  recipient), hydration warnings on /teams/<id> and /forms/<id> (production crawl), refunds / COMP-11 / MON-15 decisions.
