# SportsPulse implementation plan

Anchored to the broken-flow audit in [traceability-matrix.md](traceability-matrix.md).
Each item below is independently trackable — flip the checkbox in the
**Status** column as work lands. Phases are ordered by **what the user
notices first**, not by code size.

> **How to update:** edit this file directly. Acceptance criteria stay
> as `[ ]` until verified by a fresh smoke walk on localhost (per the
> CLAUDE.md "test like the testers test" rule).

**Legend**

- ☐ not started
- ◐ in progress
- ☑ done (acceptance criteria all checked)
- ⊘ blocked / waiting on another item or external

**Local dev stack assumed** (per [traceability-matrix.md §Local dev contract](traceability-matrix.md))

| App | Port | Notes |
|---|---|---|
| superadmin-api | 4000 | CORS open to 3001–3005 |
| superadmin-web | 3002 | god app |
| player-web | 3004 | player + (currently) duplicate captain pages |
| team-admin-web | 3005 | captain console + wizard |

---

## Phase 0 — Hot fixes (this week, ~1.5 engineer-weeks)

Outright bugs introduced during the build sprint. Doing these first
because they break the flows we *just shipped*.

### P0-1 — `team_join_requests.season_id` must be NOT NULL ☐

| Field | Value |
|---|---|
| Audit ref | §8.3 |
| Estimate | 0.5 day |
| Depends on | — |
| Owner | TBD |

**Why:** the new player→team apply flow creates `team_memberships` rows
on captain approval. `team_memberships.season_id` is NOT NULL — when
`team_join_requests.season_id` is null, the insert crashes inside the
transaction. The unique-pending index also treats null season as
"always different", so duplicate applications slip through.

**Acceptance**
- [ ] Migration: `ALTER TABLE team_join_requests ALTER COLUMN season_id SET NOT NULL` *(after backfilling existing nulls)*.
- [ ] `ApplyBodyDto.seasonId` becomes required (drop `IsOptional`).
- [ ] `/registrations/[id]/teams/page.tsx` passes a resolved seasonId on apply — either from the registration row's division → season, or from a season picker if division-less.
- [ ] Smoke: apply with no season → 400. Apply with season → roster row created on approve.
- [ ] Unique-pending index re-asserted.

**Files**
- migration in `packages/db/migrations/`
- `apps/superadmin-api/src/modules/captain/interface/team-join-requests.controller.ts`
- `apps/player-web/src/app/(app)/registrations/[id]/teams/page.tsx`
- `apps/player-web/src/app/(app)/registrations/[id]/teams/find-team-client.tsx`

---

### P0-2 — `userIsCaptainOfTeam` everywhere `teams.captain_user_id` is read ☐

| Field | Value |
|---|---|
| Audit ref | §4.2 |
| Estimate | 1 day |
| Depends on | — |

**Why:** I wired six controllers to use the shared helper (commit
`a8cbe59`), but a follow-up grep finds more direct reads of the
legacy column — especially inside `captain-roster.controller.ts` past
the requireCaptainTeam check, and inside the team-admin-web client
fetch path that reads `team.captainUserId` to gate UI affordances.

**Acceptance**
- [ ] `grep -r "captainUserId" apps/superadmin-api/src/modules/` returns zero occurrences outside the helper.
- [ ] Same in `apps/team-admin-web/src` (UI gate falls back to `scope.roleCodes.includes("captain")`).
- [ ] Smoke: captain whose `teams.captain_user_id` is NULL but has the role assignment loads `/captain/roster` without 403 deep in the flow.

---

### P0-3 — Captain rejection notification reaches the captain ☐

| Field | Value |
|---|---|
| Audit ref | §3.5 |
| Estimate | 0.5 day |
| Depends on | — |

**Why:** `TEAM_REGISTRATION_REJECTED` fans out to 3 admin roles only;
the captain who applied gets nothing. They have to refresh
`/captain/register` to see the pink reason box.

**Acceptance**
- [ ] `admin-applications.controller.ts:reject()` queues an additional notification with `targetRole: "captain"` and `recipientPersonId: <captain person>`.
- [ ] `TEAM_REGISTRATION_REJECTED_CAPTAIN` template added to catalog with the rejection reason interpolated.
- [ ] Smoke: admin rejects → captain's `/captain/register` shows the banner *and* a row appears on their `/notifications` page.

---

### P0-4 — Season `is_active` symmetry on tier deactivation ☐

| Field | Value |
|---|---|
| Audit ref | §4.4 |
| Estimate | 0.5 day |

**Why:** flipping season `registration_open → draft` doesn't
deactivate pricing tiers, so they stay live and visible to captains
who already have the season URL. The auto-activate side I added
should have a symmetric inverse.

**Acceptance**
- [ ] `ChangeSeasonStatusHandler`: when status transitions *away from* `registration_open`, deactivate (`is_active = false`) all this season's tiers.
- [ ] Smoke: open registration on a season → tiers active. Demote to draft → tiers inactive. Re-open → re-activate.

---

### P0-5 — `seasons.config.rosterLockAt` consumers consolidated ☐

| Field | Value |
|---|---|
| Audit ref | §4.5 |
| Estimate | 0.5 day |

**Why:** form-builder writes both column + JSONB; readers that pre-date
the fix still hit one or the other. We should pick the column and
delete the JSONB copy.

**Acceptance**
- [ ] `grep -r "config.rosterLockAt\|config\.\\?rosterLockAt" apps/` returns zero occurrences.
- [ ] One-off data migration: copy `config.rosterLockAt` → `seasons.roster_lock_at` for rows where the column is null but the JSONB has a value.
- [ ] form-builder writes only to the column going forward.

---

## Phase 1 — Plumbing (~3 weeks)

The "looks-broken" surfaces. Largest user-perception payoff per week
of work.

### P1-1 — Real email provider (SendGrid) ☐

| Field | Value |
|---|---|
| Audit ref | §3, §7, matrix §9.4a |
| Estimate | 1 week |
| Depends on | — |

**Why:** unblocks every "did it work?" tester loop. Eight orphan flows
listed in §3 of the audit all collapse to "the email never reached
the user". One provider swap fixes all eight.

**Acceptance**
- [ ] New `SendgridEmailProvider` class implementing the existing dispatcher interface in `apps/superadmin-api/src/modules/communications/infrastructure/providers/`.
- [ ] Env: `SENDGRID_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_REPLY_TO`. `.env.example` updated.
- [ ] `CommunicationsModule` registers the SendGrid provider in prod; keeps `ConsoleProvider` in dev unless `SENDGRID_API_KEY` is set (then SendGrid even in dev).
- [ ] Backoff + retry: 3 attempts with exponential, then `status='failed'`.
- [ ] Manual test: trigger `registration.approved` for a test user → real email lands in inbox; `notifications.status = 'sent'`.
- [ ] Manual test: trigger `TEAM_REGISTRATION_REJECTED_CAPTAIN` (P0-3) → captain receives the rejection reason.
- [ ] Manual test: overdue cron's `invoice.overdue.r1` lands.

**Files**
- `apps/superadmin-api/src/modules/communications/infrastructure/providers/sendgrid-provider.ts` (new)
- `apps/superadmin-api/src/modules/communications/communications.module.ts`
- `apps/superadmin-api/.env.example`

---

### P1-2 — Delete duplicate `/captain/*` pages from player-web ☐

| Field | Value |
|---|---|
| Audit ref | §1, §2 |
| Estimate | 2 days |
| Depends on | — |

**Why:** five pages exist as byte-identical copies across two apps.
Maintenance silo. Captain console is the team-admin-web's job;
player-web should have a *banner* deep-linking out.

**Acceptance**
- [ ] Delete `apps/player-web/src/app/(app)/captain/` directory.
- [ ] Player-web sidebar removes the "Captain console" section.
- [ ] New banner component on player-web home: if `scope.roleCodes.includes("captain")`, show "You're a captain — open the captain console" deep-linking to `NEXT_PUBLIC_TEAM_ADMIN_URL/captain/register` or `/` depending on registration state.
- [ ] Removed routes return 404 — no orphan links inside the player-web codebase.
- [ ] Smoke: Azmath signs in to player-web → sees banner → clicks → arrives at team-admin-web logged in.

---

### P1-3 — Notification preferences UI + retry scheduler ☐

| Field | Value |
|---|---|
| Audit ref | matrix §9.4d |
| Estimate | 1 week |
| Depends on | P1-1 |

**Acceptance**
- [ ] New table `notification_preferences` (user_id, template_code, channel, enabled). Default = all on for email + in_app.
- [ ] Player `/notifications/settings` page with toggle grid (template × channel).
- [ ] Dispatcher reads preferences before sending; respects opt-out.
- [ ] Cron worker: every 5 min, scan `notifications.status='failed'` rows where `attempts < 3` and retry.
- [ ] Smoke: opt out of `invoice.overdue.r1` → overdue cron runs → no email lands for that user.

---

### P1-4 — In-app notification center on captain side ☐

| Field | Value |
|---|---|
| Audit ref | §6 (team-admin-web has no notif center) |
| Estimate | 2 days |
| Depends on | P1-1 |

**Acceptance**
- [ ] Add `/notifications` page on team-admin-web (mirror of player-web's).
- [ ] Sidebar entry "Notifications" with unread count badge.
- [ ] Captain join-request notifications + dues reminder confirmations show here.

---

## Phase 2 — Player-side flow completion (~1.5 weeks)

Close the last-mile gaps where a player action *says* it succeeded but
nothing real happens downstream.

### P2-1 — Free-agent claim → roster + notification ☐

| Field | Value |
|---|---|
| Audit ref | §3.1, matrix §9.9 |
| Estimate | 0.5 day |
| Depends on | P1-1 (for the email) |

**Acceptance**
- [ ] `ClaimFreeAgentHandler`: insert `team_memberships` row (idempotent on the active index) inside the same transaction that sets `free_agent_pool_entries.status='placed'`.
- [ ] Queue `CAPTAIN_CLAIMED_FREE_AGENT` notification (template already in catalog) to the player.
- [ ] Smoke: captain claims player → player's `/registrations` page shows them rostered + email lands.

---

### P2-2 — Org-scoped registration ↔ team apply UX ☐

| Field | Value |
|---|---|
| Audit ref | §8.1 |
| Estimate | 2 days |

**Why:** today an org-scoped registration (Teja's case) shows *every*
team in the org on `/registrations/[id]/teams` — including teams in
different leagues / sports. The captain inbox then gets noise.

**Acceptance**
- [ ] On the form-builder, **require** league + division on the form definition before publish (block via Review & Publish blockers list).
- [ ] Or: keep org-only scope but require the player to **pick a division** inside the funnel; persist `division_id` on the `registrations` row.
- [ ] `/registrations/[id]/teams` query becomes "teams with an active DTE in the player's division".
- [ ] Decision recorded in audit log: which path we took.

*(Pick one of the two acceptance paths — needs a product call.)*

---

### P2-3 — Player can withdraw their team-join request ☐

| Field | Value |
|---|---|
| Audit ref | §3 (flow incompleteness) |
| Estimate | 0.5 day |

**Acceptance**
- [ ] `POST /me/team-join-requests/:id/withdraw` (player-only, scope-checked against `playerPersonId`).
- [ ] On `/registrations/[id]/teams`, pending requests render a **Withdraw** button next to the "Application pending" chip.
- [ ] Status flips to `withdrawn`; captain inbox excludes withdrawn entries.

---

### P2-4 — Player registration row + roster status convergence ☐

| Field | Value |
|---|---|
| Audit ref | §4.1, §8.2 |
| Estimate | 1 week (design + implementation) |

**Why:** four paths can put a player on a team (invites, free-agent
claim, team_join_request approve, manual admin). No view tells you
"is this player playing this season?" without inspecting all four
tables.

**Acceptance**
- [ ] Materialised view `v_active_season_membership` (person_id, season_id, team_id, source) unioning the four paths.
- [ ] All player-side and captain-side queries that ask "is this player rostered?" read from the view.
- [ ] Idempotency check on registration: 409 if `(subject_person_id, season_id)` already has a non-rejected row.

---

## Phase 3 — Real money (~3.5 weeks)

### P3-1 — Real Stripe via existing `PaymentProcessor` seam ☐

| Field | Value |
|---|---|
| Audit ref | §3.8, matrix §9.5 |
| Estimate | 2 weeks |
| Depends on | P1-1 (for refund-issued email) |

**Acceptance**
- [ ] New `StripePaymentProcessor` class implementing `charge`, `refund`.
- [ ] Webhook ingestion at `POST /webhooks/stripe`: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`. Signature-verified.
- [ ] Idempotency-key tracking column on `payments` table.
- [ ] 3DS / SCA: `requires_action` flow with frontend redirect handling.
- [ ] Stripe Elements card-token surface replaces the mock dialog on `/payments` Update card and `/payments` Pay action.
- [ ] Smoke: real test card pays a real test invoice end-to-end on Stripe test mode.

---

### P3-2 — QuickBooks sync worker + OAuth ☐

| Field | Value |
|---|---|
| Audit ref | matrix §9.6 |
| Estimate | 2 weeks |
| Depends on | — |

**Acceptance**
- [ ] Intuit OAuth 2.0 connect flow per-org, surfaced on `/payments` "QuickBooks" tab.
- [ ] Cron job: every 5 min, dequeue `quickbooks_sync_logs.status='queued'` and push to QB. Update with `qbId` on success.
- [ ] `invoice.created`, `payment.recorded`, `refund.issued` enqueue a sync log row.
- [ ] Pull-back: nightly cron polls QB for invoice paid status and reconciles to local `invoices.status`.

---

## Phase 4 — Operations (~10 weeks)

### P4-1 — Scheduler engine + venue / slot model ☐

| Field | Value |
|---|---|
| Audit ref | matrix §9.1 |
| Estimate | 4 weeks |

**Acceptance**
- [ ] New tables `venues` + `venue_slots` (slot = venue + surface + start_ts + duration).
- [ ] New module `modules/scheduling/`: `roundRobin` / `splitSquads` algorithms; conflict resolver against slots + team blackouts.
- [ ] Generate schedule for a season → fans out into `games` rows + queues `game.scheduled` notifications.
- [ ] Reschedule = soft-archive + recreate + cascade notifications via the `game.rescheduled` template.
- [ ] Admin UI: schedule generator form + conflict report + drag-to-move calendar.
- [ ] Smoke: 8-team division generates a 14-game schedule with zero conflicts.

---

### P4-2 — Scorekeeper UI / live scoring ☐

| Field | Value |
|---|---|
| Audit ref | matrix §9.2 |
| Estimate | 3 weeks |

**Acceptance**
- [ ] New `/games/[id]/score` route on superadmin-web (or new scorekeeper sub-app).
- [ ] Period clock UI (start/pause/reset) with second-level persistence.
- [ ] Score-entry buttons → write `game_events` rows.
- [ ] Sub tracking UI: pick-a-player drawer.
- [ ] Realtime: WebSocket or Server-Sent Events for "live state" updates to spectators.
- [ ] Two-officials co-sign on Confirm Result.

---

### P4-3 — Referees: availability + scheduling + payroll ☐

| Field | Value |
|---|---|
| Audit ref | matrix §9.3 |
| Estimate | 3 weeks |
| Depends on | P4-1 (slot model) |

**Acceptance**
- [ ] Ref availability calendar: refs self-flag open/busy slots.
- [ ] Ref scheduling UI: filter available refs per game, send invites via existing notifications, track confirmations.
- [ ] Payroll calculator: rate × games × overtime → generate `referee_payroll` invoices.
- [ ] Suspension enforcement: cannot assign while suspended.

---

## Phase 5 — Platform expansion (~12 weeks)

### P5-1 — Tournament brackets ☐

| Field | Value |
|---|---|
| Audit ref | matrix §9.7 |
| Estimate | 3 weeks |
| Depends on | P4-1 |

**Acceptance**
- [ ] Bracket generator: single-elim, double-elim, round-robin playoff.
- [ ] Series tracking (best-of-N progress, game dependencies).
- [ ] Auto-advancement: winner of series N feeds into series N+1.
- [ ] Bracket visualisation UI on superadmin + player surfaces.

---

### P5-2 — i18n delivery layer ☐

| Field | Value |
|---|---|
| Audit ref | matrix §9.11 |
| Estimate | 2.5 weeks |

**Acceptance**
- [ ] `next-intl` wired across the 4 web apps.
- [ ] Locale picker in each app shell.
- [ ] Translation management UI on superadmin `/admin/i18n` reading from existing `nameTranslations` JSONB columns.
- [ ] Locale-aware middleware to serve es/fr variants.

---

### P5-3 — Multi-sport rule engine ☐

| Field | Value |
|---|---|
| Audit ref | matrix §9.10 |
| Estimate | 4 weeks |

**Acceptance**
- [ ] Sport-agnostic stat schema (`stat_lines.core` becomes JSONB driven by `sports.statSchema`).
- [ ] Rule packs for soccer / basketball / rugby (event types, period config, OT rules).
- [ ] Validation engine rejects events not in the sport's vocabulary.

---

### P5-4 — Team store / Shopify ☐

| Field | Value |
|---|---|
| Audit ref | matrix §9.8 |
| Estimate | 2 weeks |

**Acceptance**
- [ ] Shopify OAuth + product sync (per-org).
- [ ] Embedded storefront on player-web `/store`.
- [ ] No fulfilment side built; order tracking pulls from Shopify via webhook.

---

## Phase 6 — Role-targeted apps (decision-gated)

### P6-D — Decision: build or delete `org-admin-web` and `league-admin-web` ☐

| Field | Value |
|---|---|
| Audit ref | §5 |
| Estimate | 1-hour decision; then 4 weeks if build, 1 day if delete |

**Why we need a decision now:** today these apps are directory rot.
`org-admin-web` is `next-env.d.ts` + `node_modules` only.
`league-admin-web` has 11 pages but no IAM flow to grant the role,
and the role-scoped queries on superadmin already work.

**Decision options**

- **Option A — Delete:** `rm -rf apps/org-admin-web apps/league-admin-web`. Make superadmin-web fully role-aware (it mostly is — scope helpers exist). Org/league admins use superadmin-web with their org/league filter pre-applied.
- **Option B — Build:** flesh out both apps with role-scoped dashboards mirroring superadmin's surfaces, filtered to the admin's scope. 4 engineer-weeks per app.

**Acceptance for either path**
- [ ] Decision recorded here.
- [ ] If A: directories removed, sidebar links cleaned up, Vercel projects deleted, README updated.
- [ ] If B: P6-1 + P6-2 below get their own acceptance criteria + estimates.

---

## Tracking dashboard

Edit the table as items move. Don't delete completed rows — they're
the project audit trail.

| ID | Title | Status | Updated |
|---|---|---|---|
| P0-1 | team_join_requests.season_id NOT NULL | ☐ | — |
| P0-2 | userIsCaptainOfTeam everywhere | ☐ | — |
| P0-3 | Captain rejection notification | ☐ | — |
| P0-4 | Tier auto-deactivate on season demote | ☐ | — |
| P0-5 | rosterLockAt single source | ☐ | — |
| P1-1 | Real email (SendGrid) | ☐ | — |
| P1-2 | Delete duplicate /captain/* | ☐ | — |
| P1-3 | Notification prefs + retry | ☐ | — |
| P1-4 | Captain notification center | ☐ | — |
| P2-1 | Free-agent claim → roster + notif | ☐ | — |
| P2-2 | Org-scope ↔ team apply UX | ☐ | — |
| P2-3 | Player withdraw join request | ☐ | — |
| P2-4 | Registration ↔ roster convergence | ☐ | — |
| P3-1 | Real Stripe | ☐ | — |
| P3-2 | QuickBooks sync | ☐ | — |
| P4-1 | Scheduler engine | ☐ | — |
| P4-2 | Scorekeeper UI | ☐ | — |
| P4-3 | Referees end-to-end | ☐ | — |
| P5-1 | Tournament brackets | ☐ | — |
| P5-2 | i18n delivery | ☐ | — |
| P5-3 | Multi-sport rule engine | ☐ | — |
| P5-4 | Team store | ☐ | — |
| P6-D | Org/league admin app decision | ☐ | — |

---

## How we'll work

1. **Pick the next ☐ item.** Default order = file order above (P0 then P1 …); skip if blocked.
2. **Flip to ◐** as soon as work starts, with the **Updated** column = today.
3. **All acceptance criteria boxes must be checked** before flipping to ☑. Untested = not done.
4. **Localhost smoke walk** for any UI item. Per CLAUDE.md "test like the testers test" rule — sign in as the actual role and walk the flow end-to-end, cross-surface verification mandatory.
5. **One commit per item** with a `Closes plan: P0-1` line in the body so we can grep history.
6. **Re-rank** the tracking table if priorities shift — the order isn't sacred.
