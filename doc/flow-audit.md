# Flow audit — every app, every role

End-to-end inventory of user-facing flows across `superadmin-web`,
`org-admin-web`, `team-admin-web`, `player-web`, and the public
funnel (anonymous → player-web). Each step is labelled with **who**
takes it and **which app** they take it in.

**Status legend**

- ☑ Done — works on the deployed apps
- ◐ Partial — some part works, some pending (sub-bullets call out which)
- ☐ Not started — nothing exists yet
- 🧪 Needs tester verification — code path exists but no real human has stepped through it on the deployed apps

Each step has its own checkbox; each flow rolls up to a single status.
Each section letter (A, B, …) rolls up to a section-level status.

---

## A. Platform setup

### A1. First org + league setup &nbsp;·&nbsp; ☑
- [x] Super-admin / superadmin-web signs in.
- [x] Super-admin / superadmin-web → `/org-setup` wizard → fills Phase 1 (Org), Phase 2 (League + Season), Phase 3 (Divisions).
- [x] Wizard writes `orgs`, `leagues`, `seasons`, `divisions` in one go.
- [x] Super-admin / superadmin-web → `/organizations/[id]` → sees the new org with its leagues.

**Done:** entire wizard + downstream views. **Pending:** none. **Not started:** none.

### A2. Inviting an org admin &nbsp;·&nbsp; ☑
- [x] Super-admin / superadmin-web → `/users` → "Invite user" → enters email, picks `org_admin` role + the org scope.
- [x] API creates Supabase auth user (mock-confirm flow), assigns role.
- [x] Org-admin recipient gets invite email (real Resend now, P1-1).
- [x] Org-admin / org-admin-web → signs in at `https://sp-org-admin.vercel.app/sign-in` → onboarding wizard → lands on `/` overview filtered to their org.

**Done:** full invite-to-onboarded loop + foundations for real verification (env flag wired, `/auth/callback` route on all four apps). **Pending:** flip the env flag in production + ship "check your inbox" UI states on the sign-up pages. **Not started:** none.

### A3. Inviting a league admin (P5-D — uses superadmin-web) &nbsp;·&nbsp; ☑
- [x] Super-admin / superadmin-web → `/users` → invite with `league_admin` role + league scope.
- [x] League-admin / superadmin-web signs in. Sees the same UI as super-admin but every list filtered to their league(s) via the scope helpers.

**Done:** role + filtered superadmin-web view. **Pending:** none. **Not started:** none.

### A — Section roll-up &nbsp;·&nbsp; ☑ Done
All three flows complete. Real-email-verification foundations shipped (backlog #18 — env flag + `/auth/callback` on all 4 apps); flipping `SUPABASE_REQUIRE_EMAIL_CONFIRM=true` in env is now a config switch, gated on a "check your inbox" UI state being added.

---

## B. Forms + registration setup

### B1. Build a season-registration form &nbsp;·&nbsp; ☑
- [x] Super-admin (or org_admin) / superadmin-web → `/forms` → "New form" → form-builder wizard.
- [x] Six tabs: Season → Divisions → Pricing → Form-questions → Waivers → Email-templates → Review.
- [x] Admin publishes the form (locks the active version).
- [x] Form rows land in `registration_forms` + `registration_form_versions` (versioned).

**Done:** all six tabs ship; locking + versioning works. **Pending:** none. **Not started:** none.

### B2. Open the season for registration &nbsp;·&nbsp; ☑
- [x] Admin / superadmin-web → `/seasons/[id]` → status dropdown → flips season to `registration_open`.
- [x] Side effect: all this season's pricing tiers auto-flip to `is_active=true` (P0-4). Demoting back to `draft` flips them back.
- [x] The funnel URL `https://sp-player-red.vercel.app/register/[seasonId]` is now live for anyone.

**Done:** symmetric tier activation + URL live. **Pending:** none. **Not started:** none.

### B — Section roll-up &nbsp;·&nbsp; ☑ Done

---

## C. Player journey

### C1. New player registers &nbsp;·&nbsp; ◐
- [x] Visitor / player-web → opens `/register/[seasonId]` (anonymous, no auth needed).
- [x] Funnel step 1 — Path (Player / Free agent / Captain).
- [x] Funnel step 1b — Division (P2-2 — only shown if season has 2+ divisions).
- [x] Funnel step 2 — Account (email + password + name). API creates Supabase auth user, inserts `registrations` row, idempotency-key `(email|season|type)`, DB unique partial index blocks duplicates (P2-3a → 409 with the existing row id).
- [x] Funnel step 3 — Details + custom questions (form schema rendered).
- [x] Funnel step 4 — Compliance (waivers + parental consent if minor + photo release).
- [ ] **Funnel step 5 — Pricing tier → Payment** (mock card today; real Stripe is P4-1 deferred).
- [x] Funnel step 6 — Confirmation.
- [x] Backend queues `registration.submitted` email → Resend (admin can override the template per season).

**Done:** every funnel step + email queue + idempotency. **Pending:** real Stripe payment (P4-1 deferred). **Not started:** none.

### C2. Admin reviews + approves &nbsp;·&nbsp; ☑
- [x] Admin / superadmin-web → `/registrations` (or `/seasons/[id]/applications` for team apps) → sees the submission.
- [x] Admin clicks Approve / Reject.
- [x] On approve: registration → `approved`, invoice spawned, `registration.approved` email queued (with `playerName` / `seasonName` / `divisionName` interpolated — P3-3).
- [x] On reject: `registration.rejected` email queued with the admin's reason.

**Done:** all four steps. **Pending:** none. **Not started:** none.

### C3. Player sees the outcome &nbsp;·&nbsp; ☑
- [x] Player / player-web → signs in at `https://sp-player-red.vercel.app/sign-in`.
- [x] Lands on `/` home → "Welcome" + KPIs (next game, balance due, etc).
- [x] Sees `<RegistrationStateBanner>` if mid-funnel.
- [x] Sees `<CaptainConsoleBanner>` if they hold captain role (deep-links to team-admin-web — P1-2).
- [x] Player / player-web → `/registrations` → list of their submissions → click → `/registrations/[id]` detail page.
- [x] If `seasonId && !divisionId` (legacy row) → `<LegacyDivisionPrompt>` lets them pick a division inline.

**Done:** every surface listed. **Pending:** none. **Not started:** none.

### C4. Player finds a team &nbsp;·&nbsp; ☑
- [x] Approved player / player-web → `/registrations/[id]/teams` ("Find a team").
- [x] List filters: division-bound registration → only teams with an active DTE in that division (P2-2). Org-only → all org teams.
- [x] Player picks a team → `<ApplyDialog>` → optional message → Submit.
- [x] API inserts `team_join_requests` row (NOT NULL season_id per P0-1).
- [x] `PLAYER_JOIN_REQUEST` email queued to captain.

**Done:** all five steps. **Pending:** none. **Not started:** none.

### C5. Captain decides &nbsp;·&nbsp; ☑
- [x] Captain / team-admin-web → signs in at `https://sp-team-admin.vercel.app/sign-in`.
- [x] Sidebar → "Join requests" → sees the pending row.
- [x] Approve → `team_memberships` row inserted (active). `PLAYER_JOIN_APPROVED` email queued to player.
- [x] Reject → reason captured, `PLAYER_JOIN_REJECTED` email queued.

**Done:** all four steps. **Pending:** none. **Not started:** none.

### C6. Free-agent path &nbsp;·&nbsp; ☑
- [x] Player / player-web → funnel picks "Free agent" path OR `/register/free-agent` standalone.
- [x] Submits positions + availability + skill level → `free_agent_pool_entries` row.
- [x] Captain / team-admin-web → `/captain/free-agents` → browses + claims.
- [x] Claim → `team_memberships` row inserted; free-agent entry status → `placed`.

**Done:** four steps. **Pending:** none. **Not started:** none.

### C — Section roll-up &nbsp;·&nbsp; ◐ Partial
Every step works except payment, which uses a mock outcome. Real Stripe (P4-1) is the single blocker for marking C as ☑.

---

## D. Captain journey

### D1. Captain registers a team for a season &nbsp;·&nbsp; ☑
- [x] Captain / team-admin-web → `/captain/register` → sees seasons currently open in their org.
- [x] Picks a season → `/captain/register/[seasonId]` → division picker → submits.
- [x] `divisionTeamEntries` row inserted with status `pending_approval`. `TEAM_REGISTRATION_APPLIED` email fans out to admins.
- [x] Admin / superadmin-web → `/seasons/[id]/applications` (or `/divisions/[id]` — cross-linked in P2-1) → Approve / Reject.
- [x] On approve: status → `applied`, captain gets `TEAM_REGISTRATION_APPROVED` email with link to `/captain/register/setup/[entryId]`. On reject: `TEAM_REGISTRATION_REJECTED` to captain with reason (P0-3).

**Done:** all five steps. **Pending:** none. **Not started:** none.

### D2. Captain runs the setup wizard &nbsp;·&nbsp; ◐ 🧪
- [x] Captain / team-admin-web → `/captain/register/setup/[entryId]` → rollover wizard.
- [ ] **Imports prior roster (if any)** — code path exists in `captain.controller`; tester walk not yet done on deployed app.
- [x] Sends personal invites via email → sets per-player dues split.
- [x] `team_invites` rows created; each player receives a `TEAM_INVITE_NEW` / `_RETURNING` email with a one-time URL.

**Done:** wizard skeleton + invite/dues. **Pending:** end-to-end tester walk of prior-roster import. **Not started:** none.

### D3. Player accepts an invite &nbsp;·&nbsp; ◐ 🧪
- [x] Invited player / player-web → opens the URL → funnel pre-fills their details.
- [ ] **Completes pay step** — mock card today (blocked on P4-1).
- [x] `team_invites.status='accepted'` + `team_memberships` row inserted.
- [x] Captain's dashboard shows their commitment toward the confirmation threshold.

**Done:** invite-URL handling + roster insert + dashboard. **Pending:** real card payment; full tester walk. **Not started:** none.

### D4. Team confirms &nbsp;·&nbsp; ☑
- [x] When `divisionTeamEntries.collectedCents >= confirmationThresholdCents`, status auto-transitions to `confirmed`.
- [x] `TEAM_CONFIRMED` email queued to all members.

**Done:** auto-transition + email. **Pending:** none. **Not started:** none.

### D5. Captain manages the live roster &nbsp;·&nbsp; ☑
- [x] Captain / team-admin-web → `/captain/roster` → see roster + add/drop/invite (527-line real screen — audit-verified in P3-1).
- [x] Add player (mid-season) → `roster_moves` + `team_memberships` in one tx; blocked after `seasons.roster_lock_at` (single source per P0-5).
- [x] Drop player with reason ≥ 20 chars → membership → `released`; if they paid a sub-invoice, a refund-assessment row is created for admin review.
- [x] Invite by email → `team_invites` row + sub-invoice on the team's master invoice.

**Done:** all four steps. **Pending:** none. **Not started:** none.

### D6. Captain initiates a transfer &nbsp;·&nbsp; ☑
- [x] Captain A / team-admin-web → `/captain/roster/[teamId]` → "Transfer player" → picks destination team.
- [x] Transfer row created, `TRANSFER_REQUEST` email queued to captain B.
- [x] Captain B / team-admin-web → `/captain/transfers/incoming` → accept/decline.
- [x] Accept → goes to Admin / superadmin-web → `/transfers` for final approval. On approve: source roster → released, dest roster → active.

**Done:** four-step cross-captain + admin approval. **Pending:** none. **Not started:** none.

### D7. Captain covers a player's dues &nbsp;·&nbsp; ◐
- [x] Captain / team-admin-web → `/captain/dues` → "Pay outstanding for player X".
- [ ] **Captain card charged** — mock today (P4-1 deferred).
- [x] Sub-invoice marked paid; `DUES_COVERED_BY_CAPTAIN` email goes to the player.

**Done:** dues UI + email. **Pending:** real card charge. **Not started:** none.

### D — Section roll-up &nbsp;·&nbsp; ◐ Partial
Six of seven flows ☑. D2 + D3 + D7 carry payment-mocked + needs-tester-walk caveats. The captain console itself is solid; the unverified parts are the rollover/setup edge cases and anything that touches money.

---

## E. Game day

### E1. Schedule a game &nbsp;·&nbsp; ◐ 🧪
- [x] Admin / superadmin-web → `/games` → new game → picks home + away + venue + time.
- [ ] **`game.scheduled` email** — template exists in the catalog; queue site at game-creation needs tester verification.

**Done:** create-game UI. **Pending:** verify dispatch fires. **Not started:** none.

### E2. Player sees their schedule &nbsp;·&nbsp; ☑
- [x] Player / player-web → `/schedule` → calendar + list of upcoming games.
- [x] Captain / team-admin-web → `/schedule` → same view filtered to their team.

**Done:** both views. **Pending:** none. **Not started:** none.

### E3. Set lineups &nbsp;·&nbsp; ☑
- [x] Captain / team-admin-web → `/lineups` → list of scheduled / in-play games for the captain's team.
- [x] Captain → `/lineups/[gameId]` → editor with one row per active roster player. Three radio buckets (starter / bench / scratch) + inline jersey-number + position inputs + scratch-reason. Live counts on three stat cards.
- [x] Save → `PUT /games/:gameId/lineups/:teamId` (captain-gated via `userIsCaptainOfTeam`). Upsert via unique `(game_id, team_id)` index.
- [x] Auto-lock: when game.status flips to `in_play` via `StartPlayHandler`, the handler stamps `locked_at = now()` on every `game_lineups` row for that game. Subsequent PUTs return 409 `lineup_locked`.
- [x] Migration 0037 adds the `game_lineups` table; SDK exposes `gameOps.getLineup` + `gameOps.putLineup`.
- [x] `pnpm --filter @sportspulse/{superadmin-api,team-admin-web} typecheck` clean.

**Done:** every step. **Pending:** none. **Not started:** none.

### E4. Score the game &nbsp;·&nbsp; ◐
- [x] Scorekeeper (no app yet — currently a super-admin task) → Admin / superadmin-web → `/game-events` → enter goals/assists/penalties.
- [x] Admin → `/games/[id]` → "Finalize" → game status `completed`, stat lines updated.
- [ ] **`game.finalized` email** — template exists; queue-on-finalize needs verification.

**Done:** entry + finalize. **Pending:** finalize-email dispatch. **Not started:** a real scorekeeper app for non-admins.

### E5. Stats roll up &nbsp;·&nbsp; ☑
- [x] Admin or cron triggers stats recompute.
- [x] Player / player-web → `/stats` → career / season / playoffs view.
- [x] Captain / team-admin-web → `/stats` → team-level stats.
- [x] Admin / superadmin-web → `/stats` → all-leagues stats + leaderboards.

**Done:** all four. **Pending:** none. **Not started:** none.

### E — Section roll-up &nbsp;·&nbsp; ◐ Partial
Stats ☑, schedule view ☑, lineups ☑ (built this session). Schedule-game + score-game still rely on the super-admin doing scorekeeper work because the dedicated scorekeeper app doesn't exist (Backlog #3). `game.scheduled` / `game.finalized` email dispatches still need tester verification.

---

## F. Money

### F1. Player pays their invoice &nbsp;·&nbsp; ◐
- [x] Player / player-web → `/payments` → invoice card lists invoiceNumber + team name link (P3-2) → "Pay".
- [x] Pay dialog → wallet credit + card portions → submit.
- [ ] **API charges card** — mock today; P4-1 will swap to real Stripe.
- [x] Invoice status → `paid` or `partial`. `payment.confirmed` email queued with team name in subject + body.

**Done:** UI + state-machine + email. **Pending:** real card. **Not started:** none.

### F2. Installment retry on failure &nbsp;·&nbsp; ◐
- [x] Cron / pg_cron runs the installment-retry sweep on schedule.
- [x] Failed card → `installment.failed` email queued.
- [x] Player / player-web → `/payments` → "Update card" → retry.
- [ ] Real Stripe to actually retry the charge against the card (P4-1).

**Done:** state machine + UI + emails. **Pending:** real Stripe. **Not started:** none.

### F3. Overdue dunning &nbsp;·&nbsp; ☑
- [x] Cron (in `apps/superadmin-api/.../finance`) walks overdue invoices at intervals → queues `invoice.overdue.r1` → `r2` → `r3` → `r4` → admin-case email.
- [x] Player / player-web → `/payments` → shows overdue badge + can opt out per template (P4-2 prefs).

**Done:** stages + opt-out. **Pending:** none. **Not started:** none.

### F4. Refund &nbsp;·&nbsp; ◐
- [x] Admin / superadmin-web → `/finance/ar` → refund row → approves.
- [ ] **Wallet credited / card refunded** — wallet works; card-refund is mock until Stripe.
- [x] `refund.issued` email queued.

**Done:** wallet refund + email + UI. **Pending:** real card refund (P4-1). **Not started:** none.

### F — Section roll-up &nbsp;·&nbsp; ◐ Partial
Everything except the literal "money moves" is done. Real Stripe (P4-1) is the single blocker for marking F as ☑.

---

## G. Notifications

### G1. End-to-end pipeline &nbsp;·&nbsp; ☑
- [x] Domain mutation (any of the above) → `NotificationService.queue()`.
- [x] Resolves admin-authored override in `email_templates` (P3-3) → falls back to catalog default.
- [x] Renders subject + body with payload variables → enqueues row in `notifications` table.
- [x] Dispatcher checks `notification_preferences` for opt-out (P4-2 prefs) → if opted out, marks `suppressed`.
- [x] Otherwise routes by channel — email → Resend (verified `notifications@sportspulse.us`); in_app → mark sent (read via `/notifications/recent`).
- [x] pg_cron `retry-failed` sweeps `attempts < 3` every 5 min with exponential backoff (waiting on `CRON_SECRET` env on Vercel for the deployed retry to start returning 200).

**Done:** queue → enqueue → dispatch → retry. **Pending:** set `CRON_SECRET` on the `sp-api` Vercel project so the deployed retry job stops 404'ing. **Not started:** SMS / push providers.

### G2. Player views their inbox &nbsp;·&nbsp; ☑
- [x] Player / player-web → `/notifications` → list of in_app rows.
- [x] Bell icon shows unread count.
- [x] Player / player-web → `/notifications/settings` → 16-row grid grouped by category (Registration · Team · Payments · Compliance) with email + in-app toggles per template.

**Done:** all three. **Pending:** none. **Not started:** none.

### G — Section roll-up &nbsp;·&nbsp; ☑ Done
Notifications is the most-finished surface — real provider, opt-outs, retry, prefs UI all live. Only soft pending is the `CRON_SECRET` env on Vercel + future SMS/push channels.

---

## H. Compliance + audit

### H1. Compliance sweep at roster lock &nbsp;·&nbsp; ☑
- [x] pg_cron `compliance-lock-sweep` runs hourly and POSTs to `/compliance/eligibility/cron/lock-sweep` with `X-Cron-Secret` (migration 0036).
- [x] API finds seasons where `roster_lock_at <= now()` AND (`last_lock_sweep_at` IS NULL OR `last_lock_sweep_at < roster_lock_at`) and runs the sweep for each. Stamps `seasons.last_lock_sweep_at` so re-runs skip already-swept seasons.
- [x] Manual fallback: `POST /compliance/eligibility/season/:id/lock-sweep` (SuperAdminGuard).
- [x] Flags USA Hockey IDs expired or expiring within season window.
- [x] Emails the player + captain (`USA_HOCKEY_EXPIRED`, `_EXPIRING_SOON`, `_EXPIRED_CAPTAIN`).
- [x] `COMPLIANCE_SWEEP_COMPLETE` idempotency key fixed (was `lock-sweep-${seasonId}-${Date.now()}` — spammed admins on every cron pass; now stable per season).

**Done:** all six steps including the auto-trigger. **Pending:** none. **Not started:** none.

### H2. Playoff eligibility &nbsp;·&nbsp; ☑
- [x] Admin / superadmin-web → `/compliance` → "Run playoff sweep" → 3 checks per active player.
- [x] `PLAYOFF_INELIGIBLE` email queued to players who fail.

**Done:** both steps. **Pending:** none. **Not started:** none.

### H3. Audit log &nbsp;·&nbsp; ☑
- [x] Every successful 2xx mutation auto-records via the global audit interceptor.
- [x] Super-admin / superadmin-web → `/audit` → full table + `/audit/[id]` detail with before/after diffs.
- [x] Org-admin / org-admin-web → `/audit` → same view filtered to their org (added this session).

**Done:** all three. **Pending:** none. **Not started:** none.

### H — Section roll-up &nbsp;·&nbsp; ☑ Done

---

## I. Operational

### I1. Background jobs (pg_cron, in-DB) &nbsp;·&nbsp; ◐
- [x] `refresh-active-season-membership` — hourly, refreshes the source-attributed materialized view.
- [ ] **`retry-failed-notifications`** — every 5 min, pg_net POST to API with vault-stored secret. Scheduled and active in cron.job; pg_net call returns 404 today because the deployed API doesn't have the new controller (commit `577304d`) + `CRON_SECRET` env yet.

**Done:** MV refresh job running cleanly. **Pending:** `CRON_SECRET` env on Vercel `sp-api` + redeploy of commit `577304d` for the retry-failed job to start returning 200. **Not started:** none.

### I2. Materialized-view-backed reads &nbsp;·&nbsp; ☑
- [x] Any consumer → `GET /roster/active-by-season?seasonId=&teamId=&personId=`.
- [x] Returns rows tagged with `source` ∈ {`team_join_request` / `team_invite` / `free_agent` / `admin_direct`}.

**Done:** endpoint + SDK + view. **Pending:** none. **Not started:** none.

### I — Section roll-up &nbsp;·&nbsp; ◐ Partial
Both jobs scheduled; one waiting on the API deploy + CRON_SECRET env to actually succeed end-to-end.

---

## Top-level roll-up

| Section | Status |
|---|---|
| **A.** Platform setup | ☑ Done |
| **B.** Forms + registration setup | ☑ Done |
| **C.** Player journey | ◐ Partial (Stripe) |
| **D.** Captain journey | ◐ Partial (Stripe + setup-wizard tester walk) |
| **E.** Game day | ◐ Partial (lineups stub; scorekeeper app missing) |
| **F.** Money | ◐ Partial (Stripe) |
| **G.** Notifications | ☑ Done (CRON_SECRET env to flip retry on deployed API) |
| **H.** Compliance + audit | ☑ Done |
| **I.** Operational | ◐ Partial (retry-failed pending deploy) |

---

## Backlog (not started · platform-wide)

| # | Item | Why it matters | Effort |
|---|---|---|---|
| 1 | **Real Stripe** (P4-1) | Unblocks C1, D3, D7, F1, F2, F4 to flip from ◐ → ☑. Production payments don't work today. | ~2 weeks |
| 2 | **Set `CRON_SECRET` on Vercel `sp-api`** + redeploy | Flips I1 retry-failed from ◐ → ☑. 5 min. | ≤ 1 hour |
| 3 | **Scorekeeper app** | Today scoring is a super-admin chore in `/game-events`. Real ops need a lightweight scorer UI on the rink-side iPad. | ~2 weeks |
| 4 | **Referee app** | API has assignments + payroll; no UI. Refs see emails today, can't accept/decline assignments in-app. | ~2 weeks |
| 5 | ~~Lineups full UI~~ ☑ | **Done 2026-05-15** — `game_lineups` table (migration 0037) + `/games/:gameId/lineups/:teamId` GET + PUT API. Captain UI at `/lineups` (game list) + `/lineups/[gameId]` (editor: starter / bench / scratch radio buckets + jersey + position inputs). Auto-locks when game flips to `in_play` via `StartPlayHandler`. SDK: `gameOps.getLineup` + `gameOps.putLineup`. | — |
| 6 | **org-admin-web action mutations** ◐ | **Leagues + seasons + divisions + teams + comms broadcast + finance recordPayment done 2026-05-16** — six `/org-admin/...` write endpoints each delegate to the matching handler after per-org scope + `org_admin` role check. UI: `/leagues/new`, `/seasons/new`, `/divisions/new`, `/teams/new`, `/communications/compose`, plus inline "Record payment" on every open invoice on `/finance`. Manual offline payments go through the same RecordPaymentHandler the super-admin path uses, so reconciliation + downstream notifications fire the same way. **Still pending:** registrations + form composer (large — full form builder). | ~3 days remaining |
| 7 | ~~org-admin-web multi-org switcher~~ ☑ | **Done 2026-05-15** — cookie-backed `getActiveOrgId(scope)` helper + `<OrgSwitcher>` in the topbar (hidden when scope has <2 orgs). Every page (overview, leagues, seasons, divisions, teams, registrations, finance, communications, audit) consumes the active org via the helper. | — |
| 8 | ~~Parent portal~~ ☑ | **Done 2026-05-15** — anonymous `/parental-consent/[token]` page on player-web. `GET /public/registration/parental-consent/:token` returns context (child name, season, org, expired flag). `POST .../redeem { action: confirm \| decline }` advances or cancels. Tokens carry an embedded timestamp; 24h TTL enforced. The start-consent endpoint now emails the parent a one-click URL. Middleware whitelists the path so the parent (no Supabase account) can land directly. | — |
| 9 | **Brackets + playoff scheduling UI** | Domain entities exist; UI doesn't. | ~2 weeks |
| 10 | **Scheduler engine** | Auto-generates round-robin schedules; today every game is hand-entered. | ~3 weeks |
| 11 | ~~Team store~~ ◐ | **Catalog slice done 2026-05-15** — `team_store_products` table (migration 0038) + `TeamStoreModule` with captain CRUD (`/captain/store/:teamId/products` GET/POST/PATCH/DELETE) and player browse (`/team-store/:teamId/products` GET, gated to active team members + captains + super_admin). Captain UI at team-admin-web `/captain/store` (add/edit/hide/delete, inline forms). Player UI at player-web `/store` replaces the "Coming soon" stub with a real product grid. **Still pending:** purchase/checkout flow — blocked on real Stripe (P4-1). | Checkout: depends on #1 |
| 12 | **Video** | Same — sidebar link + "Coming soon" page. | ~3 weeks |
| 13 | **i18n** ◐ | **Scaffold landed 2026-05-16 on landing-web.** `next-intl` wired with cookie-driven locale (no URL prefix yet — `/` stays canonical, switching flips `NEXT_LOCALE`). `src/i18n/config.ts` defines `LOCALES = ['en','es']` and the picker; `src/i18n/request.ts` is the `getRequestConfig` reading the cookie. `messages/en.json` + `messages/es.json` baseline the hero block; `<LocaleSwitcher>` in the nav swaps + reloads. Hero now consumes `useTranslations("hero")`. **Still pending:** translate the remaining sections (logistics, sub-engine, revenue, family, intelligence, contact, CTA, footer-ticker, every other page), then mirror the pattern to the four app surfaces (superadmin, org-admin, team-admin, player) once locale targets are confirmed. | ~1 week per surface |
| 14 | **Multi-sport rule packs** | Hockey-specific stat fields hardcoded; other sports need different shapes. | ~2 weeks per sport |
| 15 | **Per-flow tester walk** | Every ◐/🧪 flow above needs a real human stepping through it on deployed apps. | ~3-5 days |
| 16 | **Push notifications** ◐ | **Channel scaffolded 2026-05-16** — migration 0039 adds `push_subscriptions` (web-push endpoint + keys, FCM/APNs ready) and relaxes the channel CHECK on `notifications` + `notification_preferences` to allow `'push'`. New `PushDispatcherService` mirrors `EmailDispatcherService` (env kill-switch: log-only without `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`). `NotificationService.dispatch` routes the `push` channel through it, honours opt-outs, and pg_cron's retry-failed sweep (migration 0034) re-tries failed pushes the same way it re-tries email. New `POST /communications/push/subscribe` + GET + DELETE endpoints + SDK methods for browser registration. **Still pending:** add the `web-push` lib once VAPID keys are generated, plus a service-worker on each app to actually call `pushManager.subscribe`. | Lib + SW: ~3 days |
| 17 | ~~Org-admin extended actions~~ ☑ | **All three slices done 2026-05-15 → 2026-05-16.** (a) Captain assignment — `OrgAdminTeamsController` at `/org-admin/teams/:teamId` (GET + assign-captain POST + revoke), scope-guarded on caller's org, syncs `teams.captain_user_id`. UI: org-admin-web `/teams/[teamId]` detail with inline assign/revoke. (b) Dispute resolution — `OrgAdminRefundAssessmentsController` at `/org-admin/refund-assessments` (list scoped to caller's orgs + POST `/:id/resolve`). Decisions: refund (capped at paidCents), no_refund, void; writes status + decisionNotes + resolvedAt. UI: org-admin-web `/disputes` with status tabs + inline adjudication. (c) Kick off setup — `OrgAdminLeaguesController` at `POST /org-admin/leagues` delegates to `CreateLeagueHandler` after a per-org scope check. UI: org-admin-web `/leagues/new` form (name / sport / format) + "New league" CTA on the leagues list and dashboard empty state. Seasons + divisions still require super_admin until backlog #6 mirrors those mutations. | — |
| 18 | ~~Email-verification roundtrip~~ ◐ | **Foundations done 2026-05-15** — env flag `SUPABASE_REQUIRE_EMAIL_CONFIRM` now conditional in `SupabaseAdminService.inviteUserByEmail`. `/auth/callback` route added to org-admin-web, team-admin-web, player-web (only superadmin-web had one). Documented in `.env.example`. **Still pending:** "check your inbox" UI state on each app's sign-up — product-copy decision. | UI states: ~1 day |
| 19 | **Captain rollover wizard tester walk** (D2) | Code path exists for prior-roster import; no real human has walked it through on deployed apps. | 1 day |
| 20 | ~~Compliance lock-sweep auto-trigger~~ ☑ | **Done 2026-05-15** — pg_cron `compliance-lock-sweep` runs hourly (migration 0036). `seasons.last_lock_sweep_at` column added (migration 0035) for idempotency; spammy notification key fixed. | — |

---

## How to maintain this doc

1. **Flip a checkbox the moment work starts** on a sub-step (☐ → ◐).
2. **Flip the whole sub-step to ☑** only when every checkbox is checked AND a tester has walked it end-to-end on the deployed app.
3. **Add a new row to Backlog** if you find something the audit missed.
4. **Section roll-ups follow the weakest sub-step** — a single ◐ keeps the section at ◐.
