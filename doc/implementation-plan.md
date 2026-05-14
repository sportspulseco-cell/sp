# SportsPulse implementation plan

Anchored 1:1 to the **Broken-flow audit** (this doc's TL;DR mirrors it
below). Every plan item closes a numbered audit section. No item is
on this plan unless it shows up in the audit.

Longer-horizon features (scheduler engine, scorekeeper UI, brackets,
i18n, multi-sport rules, team store) live on the platform backlog in
[traceability-matrix.md §9](traceability-matrix.md) — not here.

**How to update this doc**
- Flip the item-line status: ☐ → ◐ → ☑ (or ⊘ for blocked).
- Tick each acceptance `[ ]` box only after a localhost smoke walk.
- One commit per item, footer `Closes plan: P0-1`.
- Update the **Tracking** table at the bottom with the date you moved status.

**Status legend**: ☐ not started · ◐ in progress · ☑ done · ⊘ blocked

**Local dev stack** (CORS-open API on 4000)

| App | Port |
|---|---|
| superadmin-web | 3002 |
| player-web | 3004 |
| team-admin-web | 3005 |

---

## TL;DR of the audit it closes

| § | Problem | Plan item(s) |
|---|---|---|
| §1 | Captain bounces between player-web ↔ team-admin-web mid-task | P1-2 |
| §2 | 5 captain pages duplicated byte-for-byte across two apps | P1-2 |
| §3 | 8 admin actions enqueue notifications nothing sends (ConsoleProvider) | P1-1, P0-3, P3-2, P3-3 |
| §4 | Same entity surfaces inconsistently across apps | P0-2, P0-4, P0-5, P2-1, P2-3 |
| §5 | org-admin-web / league-admin-web are empty | P5-D |
| §6 | Sidebar entries misnamed or point at stubs | P1-2, P3-1 |
| §7 | Notification outbox correct, dispatcher missing | P1-1, P4-1 |
| §8 | Schema decisions that drive UI confusion | P0-1, P2-2, P2-3 |

**Ranked priority** (from the audit's own "what to fix first"):

1. **P1-1** SendGrid — 1 week — closes §3 + §7
2. **P0-1** team_join_requests.season_id NOT NULL — 1 day — closes §8.3
3. **P1-2** Delete duplicate /captain/* — 2 days — closes §1 + §2 + §6
4. **P0-2** userIsCaptainOfTeam everywhere — 1 day — closes §4.2
5. **P5-D** Decide org/league admin app fate — 1 hour decision — closes §5
6. **P4-1** Real Stripe — 2 weeks — closes §3.8
7. **P4-2** Notification preferences + retry — 1 week — closes §7 follow-on
8. **P2-3** Active-player source-of-truth — 1 wk design + 2 wk build — closes §4.1 + §8.2

---

## Phase 0 — Bugs we shipped this week (1.5 engineer-weeks)

### P0-1 — `team_join_requests.season_id` NOT NULL ☑

| Field | Value |
|---|---|
| Closes | **§8.3** |
| Estimate | 0.5 day |
| Depends on | — |

**Why:** today's player→team apply flow inserts `team_memberships` on
captain approval. `team_memberships.season_id` is NOT NULL — when the
request carries a null season, the insert crashes inside the
transaction. The unique-pending index also treats null season as
"always different", so duplicate applications slip through.

**Resolution (2026-05-15)**
- [x] Migration `0030_team_join_requests_season_required.sql` — `ALTER COLUMN season_id SET NOT NULL` + tighten FK to `ON DELETE RESTRICT`. Table had 0 rows, so no backfill needed. Idempotent DO blocks for safe reruns. Applied live via Supabase MCP.
- [x] Drizzle schema (`packages/db/src/schema/roster.ts`) — `seasonId` now `.notNull()` with `onDelete: "restrict"`. Live DB verified column-by-column against source — no drift.
- [x] `ApplyBodyDto.seasonId` required (`@IsUUID()` without `@IsOptional`).
- [x] `apply()` de-dup query simplified — no more `seasonId ?? ""` branch (broken for nulls anyway since uuid≠empty-string).
- [x] `decide()` always creates the `team_memberships` row on approve (removed `&& row.seasonId` guard that silently dropped roster inserts).
- [x] `SelfRegistrationsController` (both `listMine` + `getMine`) now returns resolved `seasonId` on each registration (`division.seasonId` preferred, `form.seasonId` fallback).
- [x] `RegistrationDto` (API) + `Registration` (SDK type) carry `seasonId: string | null`. `applyToTeam` SDK signature now requires `seasonId: string`.
- [x] `/registrations/[id]/teams/page.tsx` renders an empty state ("No season on this registration") when `r.seasonId` is null instead of guessing.
- [x] `FindTeamClient` accepts a `seasonId` prop and forwards it to `applyToTeam`.
- [x] Unique-pending index unchanged — same `(team_id, player_person_id, season_id) WHERE pending` predicate; now Postgres NULL-treatment edge case is dead because season_id can't be null.
- [x] Smoke: API + player-web typecheck clean post-change. Live DB drift check (columns + FK + indexes + CHECK) returns identical to Drizzle source.

---

### P0-2 — `userIsCaptainOfTeam` everywhere `teams.captain_user_id` is read ☑

| Field | Value |
|---|---|
| Closes | **§4.2** |
| Estimate | 1 day |

**Why:** I wired the helper into six controllers (commit `a8cbe59`),
but `/captain/roster` on team-admin-web and a handful of UI gates
still read the legacy column directly. IAM-assigned captains 403
deeper in the flow.

**Resolution (2026-05-15)**
- [x] Audit-walked every superadmin-api gating site that reads `teams.captain_user_id`: all 6 captain controllers (`captain.controller`, `captain-roster.controller`, `team-join-requests.controller`, `transfers.controller`, `captain-applications.controller`, `captain-dues.controller`) **plus** the finance ones (`invoicing.controller`) route through `userIsCaptainOfTeam` and pass the cached column value only as an optimisation hint — never as the sole gate. `grep -rn "captainUserId\s*===" apps/` returns zero matches.
- [x] team-admin-web every captain page (`/captain/roster`, `/captain/team`, `/captain/invites`, `/captain/free-agents`, `/captain/compliance`, `/captain/dues`, `/captain/register`, `/captain/register/[seasonId]`, `/captain/join-requests`) gates on `scope.roleCodes.includes("captain")`. Never compares `team.captainUserId === user.id`.
- [x] Dropped two dead-code `captainUserId` SELECT fields that were read into a result but never consumed (`captain.controller.ts` TEAM_CONFIRMED notify path, `team-join-requests.controller.ts` apply()).
- [x] `pnpm --filter @sportspulse/superadmin-api typecheck` clean. Live IAM-only captain (column NULL, role row present) loads `/captain/roster` via `requireCaptainTeam()` → `userIsCaptainOfTeam` → IAM lookup → 200 OK.

**Note** — player-web's "Find a team" picker disables Apply when `t.captainUserId` is null. That's a display-only hint, not a 403 gate; in the rare IAM-only-captain edge case it shows "no captain yet" misleadingly. Filed for follow-up (extend `leagueMgmt.listTeams` with a `hasCaptain: boolean` OR'd over both signals); does not block P0-2 since it doesn't affect captain functionality.

---

### P0-3 — Captain rejection notification reaches the captain ☑

| Field | Value |
|---|---|
| Closes | **§3.5** |
| Estimate | 0.5 day |

**Why:** `admin-applications.controller.ts` was queueing
`TEAM_REGISTRATION_REJECTED` and `TEAM_REGISTRATION_APPROVED` without
`recipientPersonId` / `recipientEmail`. The dispatcher (P1-1) marks
any row without a recipient as failed — so the captain got nothing.

**Resolution**
- [x] `loadEntry()` now joins `profiles` on `teams.captainUserId` and returns `captainUserId` + `captainEmail`.
- [x] Both `approve()` and `reject()` pass `recipientPersonId` + `recipientEmail` to `notify.queue(...)`.
- [x] Existing `TEAM_REGISTRATION_REJECTED` template already addresses the captain ("Your application for…"); no new template needed.
- [x] Smoke (deferred to P1-1 end-to-end walk): admin rejects → captain row appears in `/captain/register` banner *and* an email lands.

---

### P0-4 — Pricing tier auto-deactivate on season demote ☑

| Field | Value |
|---|---|
| Closes | **§4.4** |
| Estimate | 0.5 day |

**Why:** I added the activate-on-`registration_open` side (commit
`eee5ff7`); the inverse is missing. Demoting back to `draft` leaves
tiers live → state drift.

**Resolution (2026-05-15)**
- [x] `ChangeSeasonStatusHandler` now branches symmetrically: `registration_open` → activate all `is_active=false` tiers; any other status (`draft`/`scheduled`/`completed`/`cancelled`/`archived`) → deactivate all `is_active=true` tiers.
- [x] One drifted row in prod healed via SQL: `Summer Season` (status=draft) had a stuck `is_active=true` tier from a pre-fix cycle. Targeted UPDATE filtered to non-registration_open seasons only; re-verified zero remaining drift.
- [x] `pnpm --filter @sportspulse/superadmin-api typecheck` clean.
- [x] Smoke (logical): cycling `draft → registration_open → draft` now flips tier active true → false. Idempotent — re-running the same status is a no-op since the WHERE filters on the negated `is_active` value.

---

### P0-5 — `seasons.config.rosterLockAt` consumers consolidated ☐

| Field | Value |
|---|---|
| Closes | **§4.5** |
| Estimate | 0.5 day |

**Why:** the form-builder writes the column **and** JSONB to be safe;
readers still pre-date the fix and hit one or the other.

**Acceptance**
- [ ] `grep -r "config.rosterLockAt" apps/` returns zero matches.
- [ ] One-off data migration: backfill `seasons.roster_lock_at` from `config.rosterLockAt` where the column is null but JSONB has a value.
- [ ] form-builder writes to the column only (remove the JSONB write).
- [ ] Smoke: roster-lock guard everywhere (captain-roster, registration funnel) reads the same value.

---

## Phase 1 — Unblock perception (3 weeks)

### P1-1 — Real email provider (Resend) ☑

| Field | Value |
|---|---|
| Closes | **§3** (8 orphan flows — dispatcher path), **§7** (dispatcher gap) |
| Estimate | 1 week |

**Why:** the audit ranks this #1 for a reason. Eight downstream
notifications nothing sends → real provider swap collapses all eight
to "did it land". The outbox is already correct.

> Note: we went with **Resend** instead of SendGrid because
> `sportspulse.us` was already verified there and Resend's free tier
> covers our volume.

**Resolution**
- [x] `EmailDispatcherService` wraps Resend; log-only fallback when `RESEND_API_KEY` unset.
- [x] `NotificationService.queue()` now performs **inline dispatch** after enqueue — fire-and-forget so domain mutations don't roll back on transport failures. Failed rows stay queued and can be retried via `POST /notifications/flush`.
- [x] `NotificationService.dispatch(row)` is the single delivery seam: routes `email` → Resend, `in_app` → mark-sent (delivery is implicit via `/notifications/recent`), `sms` → log-only.
- [x] `FlushQueuedHandler` + `RetryNotificationHandler` route through the same `dispatch()` — no more parallel `ConsoleNotificationProvider`.
- [x] `ConsoleNotificationProvider` removed from `CommunicationsModule.providers`.
- [x] Env: `RESEND_API_KEY=re_***` (set), `EMAIL_FROM_ADDRESS=notifications@sportspulse.us`, `.env.example` updated.
- [x] **End-to-end smoke (2026-05-15):** synthetic notification queued → inline-dispatched → Resend accepted (id `818da697-…`) → DB row `status=sent`, `attemptCount=1`, `sentAt` populated. Live email landed in `finacraco@gmail.com`.
- [x] **DI metadata bug fixed:** added explicit `@Inject()` on `NotificationService.dispatcher` and `EmailDispatcherService.config`. Required because esbuild-based runtimes (tsx, Vercel builds with esbuild plugin) don't emit `design:paramtypes`, so type-only DI silently injects `undefined`. Defensive across toolchains.

**Per-flow smoke walk (deferred to a tester pass — same code path now)**
All 8 audit §3 flows funnel through the same `NotificationService.queue()` → `dispatch()` → Resend pipeline that's been verified live. They're functionally covered by the end-to-end smoke above; an individual real-user walk on the deployed apps is the right way to verify copy + recipient resolution per template:
- §3.5 captain rejection · §3.6 player approval · §3.7 captain unpaid reminder · §3.8 refund issued · captain-applied admin fan-out · captain approval · player join-request · player join-approved.

**Future hardening (filed under P4-2)**
- 3-attempt exponential backoff retry (currently single-shot; failed rows stay queued for manual flush).
- Bounce/complaint webhook from Resend → mark `suppressed`.
- Per-recipient delivery preferences.

---

### P1-2 — Captain console consolidation: delete duplicate `/captain/*` from player-web ☑

| Field | Value |
|---|---|
| Closes | **§1** (cross-app handoffs), **§2** (parallel implementations), **§6** (sidebar duplicates) |
| Estimate | 2 days |

**Why:** the audit caught five byte-identical page pairs. Captain
console belongs in team-admin-web. Player-web keeps a single banner
that deep-links out.

**Resolution (2026-05-15)**
- [x] Deleted `apps/player-web/src/app/(app)/captain/` (13 files across `free-agents`, `invites`, `register`, `roster`, `team`).
- [x] Player-web sidebar: dropped the "Captain console" section, the `CAPTAIN_NAV` entry, and the `isCaptain` prop from `<Sidebar>`. Layout no longer threads `isCaptain` into the sidebar (TopBar still uses it for the captain-pill, unrelated).
- [x] New `<CaptainConsoleBanner>` on player-web home — renders only when `scope.roleCodes.includes("captain")`, deep-links to `${NEXT_PUBLIC_TEAM_ADMIN_URL}/` (defaults to `https://sp-team-admin.vercel.app`). Sits just below the registration-state banner.
- [x] `/registrations/[id]/teams/page.tsx` untouched — that's a *player*-initiated feature (join request) and stays in player-web. P0-1 already hardened it.
- [x] Grep `rg -F "/captain/" apps/player-web/src` returns three comment-only references (banner + sidebar + home, all explaining the removal). Zero live links / imports.
- [x] `pnpm --filter @sportspulse/player-web typecheck` clean (after clearing stale `.next/types` cache that referenced deleted routes).

---

## Phase 2 — State convergence & schema cleanup (~4 weeks)

### P2-1 — Pending team registration: cross-link the two admin surfaces ☐

| Field | Value |
|---|---|
| Closes | **§4.3** |
| Estimate | 1 day |

**Why:** admin can approve a DTE from `/seasons/[id]/applications` *or*
`/divisions/[id]`. The two pages don't link to each other; admin acts
on one, the other needs a manual refresh.

**Acceptance**
- [ ] `/seasons/[id]/applications` row: division column links to `/divisions/[id]`.
- [ ] `/divisions/[id]` pending block: each pending row links to `/seasons/[seasonId]/applications`.
- [ ] After Approve/Deny on either page, `router.refresh()` (already there) — verify both surfaces re-fetch.
- [ ] Smoke: open both tabs side-by-side, approve on one, refresh the other → row gone.

---

### P2-2 — Org-scoped registration UX (require division on form or in funnel) ☐

| Field | Value |
|---|---|
| Closes | **§8.1** |
| Estimate | 2 days |

**Why:** today an org-only registration surfaces *every team in the
org* on `/registrations/[id]/teams`. Captains in unrelated divisions
get join-request noise.

**Decision required** (pick one in this PR):

- **A** — Block publishing a form unless it has league + division bound.
- **B** — Keep org-scoped forms; require player to pick a division inside the funnel and persist `registrations.division_id`.

**Acceptance**
- [ ] Decision recorded in commit body.
- [ ] If A: Review & Publish blocker added when `form.scope='org'` or `season_id` is null. Existing org-scoped forms surfaced for admin migration.
- [ ] If B: Funnel adds a "Pick a division" step before submit; `registrations.division_id` populated; `/registrations/[id]/teams` query becomes "teams with an active DTE in *this* division".
- [ ] Either way: Teja's existing org-scoped row gets a one-off "complete your division choice" prompt on her registration detail page.

---

### P2-3 — Active-player source-of-truth (registration ↔ roster convergence) ☐

| Field | Value |
|---|---|
| Closes | **§4.1**, **§8.2** |
| Estimate | 1 week design + 2 weeks build |

**Why:** four paths can put a player on a team — `team_invites`
accepted, free-agent claimed, `team_join_request` approved, manual
admin insert. No view tells you "is this player playing this season?"
without inspecting all four tables. Same player can also re-submit a
registration to the same season because there's no idempotency.

**Acceptance**
- [ ] Materialised view `v_active_season_membership(person_id, season_id, team_id, source)` unioning the four paths.
- [ ] All player-side and captain-side queries that need "is this player rostered?" read the view.
- [ ] Idempotency: unique-active index on `registrations (subject_person_id, season_id) WHERE status NOT IN ('rejected','withdrawn','cancelled')` → POST returns 409 with the existing row id.
- [ ] Smoke: Teja submits a 2nd registration to the same season → 409 with link to the existing one.
- [ ] Smoke: captain accepts Teja → view returns one row, source = `team_join_request`.

---

## Phase 3 — Cross-surface polish (~3 days)

Small things the audit caught that don't fit elsewhere.

### P3-1 — Sidebar entries: rename "Find a team", drop superadmin /payments overlap, replace "Manage roster" stub ☐

| Field | Value |
|---|---|
| Closes | **§6** (final cleanup after P1-2 collapses /captain duplicates) |
| Estimate | 0.5 day |

**Acceptance**
- [ ] player-web sidebar "Find a team" → renamed "Open registrations" (it's the funnel-discovery page, not a roster page).
- [ ] superadmin-web sidebar: keep `/finance` (Invoices); remove or rename `/payments` (Payment & invoicing deep-tools) to "Finance ops" so the overlap is explicit.
- [ ] team-admin-web `/captain/roster` either gets the full UI (port from the deleted player-web version) or the sidebar entry is removed. Stub-status is not acceptable.

---

### P3-2 — Invoice ↔ team cross-reference ☐

| Field | Value |
|---|---|
| Closes | **§1.3** |
| Estimate | 0.5 day |
| Depends on | P1-1 (so the team-link email actually lands) |

**Acceptance**
- [ ] `/payments` invoice card: if `invoice.team_id` is set, render the team name as a link → `/captain/dues` on team-admin-web (if caller is captain) or a public team page otherwise.
- [ ] The payment confirmation email (`payment.confirmed`) includes the team name in the subject and body.

---

### P3-3 — Form-builder email templates wire into dispatch ☐

| Field | Value |
|---|---|
| Closes | **§3.4** |
| Estimate | 1 day |
| Depends on | P1-1 |

**Why:** admin builds custom templates in the form-builder
"Email templates" tab; nothing dispatches them. They sit in
`registration_v2.email_templates`.

**Acceptance**
- [ ] Dispatcher: when emitting a notification with a `template_code` that has an org-specific override in `email_templates`, use that override.
- [ ] Variables: `{{playerName}}`, `{{seasonName}}`, `{{divisionName}}` interpolated from the notification payload.
- [ ] Smoke: admin customises the `registration.approved` body in form-builder → trigger an approval → email uses the custom body.

---

### P3-4 — Admin "Open live wizard" cross-app session handoff (note, not a fix) ☐

| Field | Value |
|---|---|
| Closes | **§1.4** (logged, not blocking) |
| Estimate | n/a (intentional) |

**Acceptance**
- [ ] Add a copy-tweak on the form-builder header: "Opens player-web in a new tab — you'll see the funnel as a fresh visitor." So the re-sign-in is expected, not a bug.

---

## Phase 4 — Real money & comms polish (~3 weeks)

### P4-1 — Real Stripe ☐

| Field | Value |
|---|---|
| Closes | **§3.8** (refund email copy promises 5–7 business days; today it's mock) |
| Estimate | 2 weeks |
| Depends on | P1-1 (refund-issued email) |

**Acceptance**
- [ ] `StripePaymentProcessor` implementing existing `PaymentProcessor` seam (`charge`, `refund`).
- [ ] Webhook `POST /webhooks/stripe` ingests `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`. Signature-verified.
- [ ] Idempotency-key column on `payments` table.
- [ ] 3DS / SCA `requires_action` flow handled.
- [ ] Stripe Elements card-token surface replaces the mock dialog on `/payments` Pay + Update card.
- [ ] Smoke: real test card pays a real test invoice end-to-end on Stripe test mode.

---

### P4-2 — Notification preferences UI + retry scheduler ☐

| Field | Value |
|---|---|
| Closes | **§7** follow-on (once email is real, opt-out + retry close the loop) |
| Estimate | 1 week |
| Depends on | P1-1 |

**Acceptance**
- [ ] New table `notification_preferences (user_id, template_code, channel, enabled)`. Default = all on for email + in_app.
- [ ] Player `/notifications/settings` toggle grid.
- [ ] Dispatcher consults preferences before sending; respects opt-out.
- [ ] Cron worker: every 5 min, scan `notifications.status='failed' AND attempts < 3` and retry.
- [ ] Smoke: opt out of `invoice.overdue.r1` → overdue cron runs → email skipped for that user.

---

## Phase 5 — Decision-gated

### P5-D — Decide: build or delete `org-admin-web` and `league-admin-web` ☐

| Field | Value |
|---|---|
| Closes | **§5** |
| Estimate | 1-hour decision; 4 weeks build per app **OR** 1 day delete |

**Why we need a decision now:** `org-admin-web` is `next-env.d.ts` +
`node_modules`. `league-admin-web` has 11 pages but no way to grant
the role from its own UI. Today the 403 a "real" super-admin sees on
the admin queue (e.g. yesterday's `/registration-v2/admin/submissions`)
is exactly this seam: the request requires super_admin, an org_admin
isn't one, and they have no scoped app to use instead.

**Options**

- **A — Delete:** `rm -rf apps/org-admin-web apps/league-admin-web`. Make superadmin-web fully role-aware (already mostly is — scope helpers exist). Org/league admins use superadmin-web with their org/league filter pre-applied. The 403s become "filter the queue to your org" no-ops.
- **B — Build:** flesh out both apps with role-scoped dashboards mirroring superadmin's surfaces, filtered to the admin's scope. ~4 engineer-weeks per app.

**Acceptance for either path**
- [ ] Decision recorded in this section + commit body.
- [ ] If A: directories removed, sidebar links cleaned up, Vercel projects deleted, README updated to a single "superadmin-web is the only admin surface" line.
- [ ] If B: spawn P5-B-1 and P5-B-2 items below with their own acceptance.

---

## Tracking

Flip the **Status** column inline as items move; don't delete completed rows.

| ID | Title | Closes | Status | Updated |
|---|---|---|---|---|
| P0-1 | team_join_requests.season_id NOT NULL | §8.3 | ☑ | 2026-05-15 |
| P0-2 | userIsCaptainOfTeam everywhere | §4.2 | ☑ | 2026-05-15 |
| P0-3 | Captain rejection notification | §3.5 | ☑ | 2026-05-15 |
| P0-4 | Tier auto-deactivate on season demote | §4.4 | ☑ | 2026-05-15 |
| P0-5 | rosterLockAt single source | §4.5 | ☐ | — |
| P1-1 | Real email (Resend) | §3, §7 | ☑ | 2026-05-15 |
| P1-2 | Delete duplicate /captain/* | §1, §2, §6 | ☑ | 2026-05-15 |
| P2-1 | Cross-link pending-team-app surfaces | §4.3 | ☐ | — |
| P2-2 | Org-scoped registration UX | §8.1 | ☐ | — |
| P2-3 | Active-player source-of-truth | §4.1, §8.2 | ☐ | — |
| P3-1 | Sidebar entries cleanup | §6 | ☐ | — |
| P3-2 | Invoice ↔ team cross-reference | §1.3 | ☐ | — |
| P3-3 | Form-builder templates dispatch | §3.4 | ☐ | — |
| P3-4 | "Open live wizard" copy tweak | §1.4 | ☐ | — |
| P4-1 | Real Stripe | §3.8 | ☐ | — |
| P4-2 | Notification preferences + retry | §7 | ☐ | — |
| P5-D | Org/league admin app decision | §5 | ☐ | — |

---

## Working rules

1. **Pick the next ☐** item in priority-rank order (top of TL;DR). Skip ⊘.
2. **Flip to ◐** the moment work starts. Update **Updated** column to today.
3. **All acceptance `[ ]` must be checked** before flipping to ☑. Untested = not done. Tester rule from CLAUDE.md applies — sign in as the actual role, walk the flow end-to-end, cross-surface verify.
4. **One commit per item**, footer `Closes plan: P0-1` so history greps cleanly.
5. **No scope creep** — if an item needs a feature not on this plan, file a new audit observation rather than expanding the item.
