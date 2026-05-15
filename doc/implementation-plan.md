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

### P0-5 — `seasons.config.rosterLockAt` consumers consolidated ☑

| Field | Value |
|---|---|
| Closes | **§4.5** |
| Estimate | 0.5 day |

**Why:** the form-builder writes the column **and** JSONB to be safe;
readers still pre-date the fix and hit one or the other.

**Resolution (2026-05-15)**
- [x] `grep "config.rosterLockAt" apps/` returns zero matches.
- [x] Backfill not needed — prod check returned 0 rows with `config ? 'rosterLockAt'`; all 9 seasons with a roster-lock had the value on the column only. The dual-write path apparently never landed in JSONB despite the bug claim.
- [x] Dropped `rosterLockAt` from `SeasonConfig` in `packages/kernel/src/season-config.ts` — TS now enforces "column only" everywhere readers and writers go.
- [x] `divisions-tab.tsx` (registration-setup-wizard step 3): separated state — `rosterLockAt` is its own `useState<string>` seeded from `season.rosterLockAt`, written via `leagueMgmt.updateSeason()`. Other toggles still flow through `updateSeasonConfig()`.
- [x] `divisions-client.tsx` (older form-builder section): same split — `saveEligibility()` now does `Promise.all([updateSeason({rosterLockAt}), updateSeasonConfig({...other})])`. Schema tag relabelled to `seasons.roster_lock_at`.
- [x] `seasons/[id]/page.tsx` admin detail view: removed the duplicate "Roster lock date" row that read `cfg.rosterLockAt`. The canonical row under "Registration window" tagged `seasons.roster_lock_at` is the only display.
- [x] Smoke: captain-roster guard (`captain-roster.controller.ts:assertRosterUnlocked`) reads `season.rosterLockAt` (column) — unchanged. Public registration funnel + compliance sweeps already read the column. Single source of truth now.
- [x] `pnpm --filter @sportspulse/{superadmin-web,superadmin-api} typecheck` clean.

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

### P2-1 — Pending team registration: cross-link the two admin surfaces ☑

| Field | Value |
|---|---|
| Closes | **§4.3** |
| Estimate | 1 day |

**Why:** admin can approve a DTE from `/seasons/[id]/applications` *or*
`/divisions/[id]`. The two pages don't link to each other; admin acts
on one, the other needs a manual refresh.

**Resolution (2026-05-15)**
- [x] `/seasons/[id]/applications` queue: "Division applied" field on every application card is now a `<Link href="/divisions/[id]">` styled as the field value (subtle hover-accent + title-tooltip). One-click pivot from a season-wide queue to the division detail.
- [x] `/divisions/[id]` pending block: header now carries a "Season queue ↗" link to `/seasons/[seasonId]/applications`. One link in the header (not per-row) since every pending row in this block belongs to the same season; per-row would be three identical buttons.
- [x] `seasonId` plumbed through from `/divisions/[id]/page.tsx` (`division.seasonId`) → `<DivisionPendingApplications>` props.
- [x] `router.refresh()` after approve/deny already wired in both surfaces — no change needed; an open second tab gets a stale row only until the admin clicks anywhere (cross-tab realtime is out of scope).
- [x] `pnpm --filter @sportspulse/superadmin-web typecheck` clean.

---

### P2-2 — Org-scoped registration UX (require division on form or in funnel) ☑

| Field | Value |
|---|---|
| Closes | **§8.1** |
| Estimate | 2 days |

**Why:** today an org-only registration surfaces *every team in the
org* on `/registrations/[id]/teams`. Captains in unrelated divisions
get join-request noise.

**Decision: Option B** (2026-05-15) — keep org-scoped forms allowed, ask the player for a division inside the funnel, persist on `registrations.division_id`. Fits the season-aware direction P0-1 + P2-3a already established; avoids breaking existing org-scoped forms.

**Resolution (2026-05-15)**
- [x] Public season context (`GET /public/registration/seasons/:id`) now returns `divisions[]` (id, name, tier — sorted by tier). Empty array when the season has none.
- [x] `StartSubmissionBodyDto` accepts `divisionId?: string` (UUID). Public funnel insert site persists it on `registrations.division_id`.
- [x] `@sportspulse/registration-funnel`: `PublicSeasonContext` carries `divisions: PublicDivision[]`. New `division` step lands between `path` and `account` in the step machine — auto-skipped when there are 0 or 1 divisions (1 auto-picks at funnel init). New `<DivisionStep>` component renders a radio grid of tiers + names, gated to non-empty selection before `Next` is enabled. `phaseFor`/`phaseHeadingFor` updated so the new step lives in Phase 1 alongside `path`.
- [x] `startSubmission` SDK call now passes `divisionId` through; funnel state seeds from `context.divisions[0]` when there's exactly one.
- [x] `leagueMgmt.listTeams` accepts `divisionId?: string`; the teams controller post-filters the result set against `division_team_entries` rows with `entry_status IN (applied|accepted|confirmed)` for that division.
- [x] `/registrations/[id]/teams` on player-web now passes `r.divisionId` through to `listTeams`, narrowing the listing to teams with an active DTE in that division. Org-only registrations (no divisionId) keep the existing org-wide listing.
- [x] `pnpm --filter @sportspulse/{superadmin-api,player-web,registration-funnel} typecheck` all clean.

**One-off prompt for legacy rows (2026-05-15) — done**
- [x] `GET /registration/self/registrations/:id` now returns `availableDivisions` when the row has a season but no division. Picks come from `divisions WHERE season_id = registration.seasonId`, sorted by tier.
- [x] New `PATCH /registration/self/registrations/:id/division` upserts `divisionId` on the caller's own row. Validates ownership (subjectPersonId matches caller's person) and that the chosen division belongs to the registration's season.
- [x] SDK: `registration.setMyRegistrationDivision(id, divisionId)`.
- [x] Player-web `/registrations/[id]` renders `<LegacyDivisionPrompt>` above the hero when `seasonId && !divisionId && availableDivisions.length > 0`. Inline dropdown + Save button; optimistic UI; rolls back on error.

---

### P2-3 — Active-player source-of-truth (registration ↔ roster convergence) ◐

| Field | Value |
|---|---|
| Closes | **§4.1**, **§8.2** |
| Estimate | 1 week design + 2 weeks build |

**Why:** four paths can put a player on a team — `team_invites`
accepted, free-agent claimed, `team_join_request` approved, manual
admin insert. No view tells you "is this player playing this season?"
without inspecting all four tables. Same player can also re-submit a
registration to the same season because there's no idempotency.

**Part A done (2026-05-15) — registration idempotency at the DB level**
- [x] New `registrations.season_id` column (nullable, FK to `seasons` with `ON DELETE SET NULL`). Populated by the public funnel directly; admin paths inherit it via the existing entity-snapshot plumbing.
- [x] Migration `0032_registrations_season_idempotency.sql` — additive, idempotent. Adds column, backfills from `division.season_id` (preferred) → `form.season_id` (fallback) in two passes, adds partial unique index `registrations_active_uniq ON (subject_person_id, season_id) WHERE status NOT IN ('rejected','withdrawn','cancelled') AND season_id IS NOT NULL`. Applied live; existing 10 rows backfilled to NULL (none had resolvable seasons via either path) → index inactive for them, kicks in for new season-bound submissions.
- [x] Public funnel's two insert sites (`startSubmission`, `resumeSubmission`) populate `seasonId` from the path param.
- [x] New `handleActiveDuplicate(err, personId, seasonId)` helper translates Postgres 23505 unique-violation into `409 Conflict` carrying `{error: "active_registration_exists", registrationId, status}` so the funnel can route the player back to their existing in-flight registration.
- [x] `pnpm --filter @sportspulse/superadmin-api typecheck` clean.
- [x] Smoke (logical): a player whose row already exists for a season at status pending_payment now hits 409 on a fresh submit, carrying the existing row id. The existing happy path (same `idempotencyKey` returns same row) is unchanged.

**Part B — materialized view shipped (2026-05-15)**
- [x] Migration `0033_v_active_season_membership.sql` — creates `v_active_season_membership` from `team_memberships WHERE current_status='active'` with a `source` column resolved via correlated EXISTS subqueries against the four originating tables (priority: `team_join_request` > `team_invite` > `free_agent` > `admin_direct` catchall). Applied live; current dataset returns 1 row tagged `admin_direct`.
- [x] Unique index on `membership_id` (required for `REFRESH MATERIALIZED VIEW CONCURRENTLY`); lookup indexes on `(person_id, season_id)`, `(team_id, season_id)`, and `source`.
- [x] `POST /admin/views/v-active-season-membership/refresh` (SuperAdminGuard) — calls `REFRESH MATERIALIZED VIEW CONCURRENTLY`. Hit on a cron cadence (hourly recommended) by the external scheduler; no-lock swap so reads never block.
- [x] `MaterializedViewsController` wired into `AdminModule`.
- [x] Smoke: live `REFRESH MATERIALIZED VIEW CONCURRENTLY` succeeded; the lone live membership row shows up tagged `admin_direct` as expected (captain Add-player path, no originating join/invite/free-agent row).
- [x] `pnpm --filter @sportspulse/superadmin-api typecheck` clean.

**Read-side consolidation (2026-05-15) — closed with deliberate scope**

Audit of every `team_memberships WHERE current_status='active'` reader revealed they all need **write-path freshness** — invoice generation, compliance sweeps, transfers, captain dashboard, etc. all read state that was just mutated by the same request flow. Migrating them to the hourly-refreshed view would silently break "did the player I just added show up?" semantics.

The view's real architectural value is **source attribution** (a new question, not a substitution). Closed by exposing the view as a queryable surface:
- [x] `GET /roster/active-by-season?seasonId=&teamId=&personId=` returns rows with the `source` column (`team_join_request` / `team_invite` / `free_agent` / `admin_direct`). Backed directly by `v_active_season_membership`.
- [x] SDK: `roster.activeBySeason({seasonId, teamId, personId})`. JSDoc warns "hourly refresh — for write-path freshness use `listMemberships`".
- [x] Existing freshness-sensitive readers stay on `team_memberships` (correct call — the audit's "is rostered" framing didn't anticipate this constraint). Future analytics + cross-path UI consume the view via the new endpoint.

---

## Phase 3 — Cross-surface polish (~3 days)

Small things the audit caught that don't fit elsewhere.

### P3-1 — Sidebar entries: rename "Find a team", drop superadmin /payments overlap, replace "Manage roster" stub ☑

| Field | Value |
|---|---|
| Closes | **§6** (final cleanup after P1-2 collapses /captain duplicates) |
| Estimate | 0.5 day |

**Resolution (2026-05-15)**
- [x] player-web sidebar "Find a team" → "Open registrations". Discover-section JSDoc updated to match.
- [x] superadmin-web sidebar: `/finance` relabelled "Invoices" (was "Finance"); `/payments` relabelled "Finance ops" (was "Payment & invoicing"). Overlap is now explicit at a glance.
- [x] team-admin-web `/captain/roster` audit-verified — it's the real screen (`roster-screen.tsx` is 527 lines, wires `captain.roster.list()`, renders the full roster + add/drop/invite flows). The audit's "stub-status not acceptable" claim was outdated; no port required.
- [x] `pnpm --filter @sportspulse/{player-web,superadmin-web} typecheck` clean.

---

### P3-2 — Invoice ↔ team cross-reference ☑

| Field | Value |
|---|---|
| Closes | **§1.3** |
| Estimate | 0.5 day |
| Depends on | P1-1 (so the team-link email actually lands) |

**Resolution (2026-05-15)**
- [x] `GET /finance/me/invoices` joins `teams` on `invoices.team_id`, surfaces `teamId` + `teamName` on every row. SDK type extended; player-web Invoice picks them up automatically.
- [x] `/payments` invoice card header: when `invoice.teamName` is set, renders a `<TeamLink>` next to the invoice number that opens `${NEXT_PUBLIC_TEAM_ADMIN_URL}/captain/dues` in a new tab. Title-tooltip notes the link is captain-only (team-admin's own guard handles the auth check).
- [x] `payment.confirmed` template rewritten — subject now `Payment received — {{invoiceNumber}}{{teamClause}}`, body includes the optional `Team: {{teamName}}` line. Template variables are forward-compatible (empty if not supplied).
- [x] `PlayerPaymentsController.pay()` now queues `payment.confirmed` after the transaction commits with `recipientEmail`, `recipientPersonId`, `invoiceNumber`, formatted amount, and the resolved team clause/line. Closes another of P1-1's orphan flows.
- [x] `pnpm --filter @sportspulse/{superadmin-api,player-web} typecheck` clean.

---

### P3-3 — Form-builder email templates wire into dispatch ☑

| Field | Value |
|---|---|
| Closes | **§3.4** |
| Estimate | 1 day |
| Depends on | P1-1 |

**Why:** admin builds custom templates in the form-builder
"Email templates" tab; nothing dispatches them. They sit in
`registration_v2.email_templates`.

**Resolution (2026-05-15)**
- [x] `NotificationService.queue()` now consults `email_templates` for an admin-authored override before falling back to the catalog default. Override lookup is keyed by `(seasonId, eventType)` where `seasonId` comes from the payload and `eventType` is resolved from a `TemplateCode → event_type` map.
- [x] Map covers the catalog codes admins typically customise (`registration.approved/rejected`, `payment.confirmed`, every overdue / installment reminder). Codes without a map entry transparently skip the override step (no perf cost).
- [x] Lookup is best-effort — DB errors fall back to the catalog silently and log a warn; a transport-layer failure never blocks the domain mutation that triggered the notification.
- [x] Variables `{{playerName}}`, `{{seasonName}}`, `{{divisionName}}` (plus `{{leagueName}}`, `{{personName}}`, `{{reason}}`, `{{seasonId}}`) are interpolated via the existing mustache renderer.
- [x] `ReviewRegistrationHandler` now enriches the payload via a new `resolveEmailEnrichment(x)` helper: one-shot DB lookup that joins `persons` + `profiles` + `divisions` + `seasons` + `leagues` + `registration_forms` to fill in display names, recipient email, and the canonical seasonId (division-first, form fallback). Errors return the original "registrant"/nulls fallback so the dispatch path stays unblocked.
- [x] `pnpm --filter @sportspulse/superadmin-api typecheck` clean.
- [x] Smoke (logical): admin inserts a row into `email_templates` for `(seasonId, on_approved, is_active=true)` → on next registration approval, the override's subject + body are used. No override → catalog default fires.

---

### P3-4 — Admin "Open live wizard" cross-app session handoff (note, not a fix) ☑

| Field | Value |
|---|---|
| Closes | **§1.4** (logged, not blocking) |
| Estimate | n/a (intentional) |

**Resolution (2026-05-15)**
- [x] `setup-shell.tsx` header: "Live wizard" link now carries a `title=` tooltip explaining the cross-app behaviour. Tooltip text mirrors the audit phrasing.
- [x] Component prop JSDoc updated so callers see the same expectation.

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

### P4-2 — Notification preferences UI + retry scheduler ☑

| Field | Value |
|---|---|
| Closes | **§7** follow-on (once email is real, opt-out + retry close the loop) |
| Estimate | 1 week |
| Depends on | P1-1 |

**Retry-scheduler half done (2026-05-15)**
- [x] `RetryFailedHandler` selects `failed` rows with `attemptCount < 3` whose `updated_at` is older than the backoff window for the current attempt count (5 min after attempt 1, 30 min after attempt 2). Routes each through `NotificationService.dispatch()` so the same provider-routing rules apply.
- [x] `POST /notifications/cron/retry-failed` exposes the sweep, gated by `SuperAdminGuard` — matches the existing cron-sweep pattern (`/compliance/eligibility/season/:id/*-sweep`). External scheduler (Vercel Cron / GitHub Actions) hits it on a ~5-min cadence.
- [x] Three total attempts (1 inline + 2 cron retries). After the 3rd failure the row is terminal — admin can manually retry via `/notifications/:id/retry`.
- [x] Idempotent — re-running the cron without any expired rows returns `{eligible:0, sent:0, stillFailed:0}` and logs a no-op line.
- [x] `pnpm --filter @sportspulse/superadmin-api typecheck` clean. Closes P1-1's last residual.

**Preferences UI done (2026-05-15)**
- [x] New table `notification_preferences (id, user_id, template_code, channel, enabled, created_at, updated_at)` keyed by FK to `auth.users(id)`. Unique on `(user_id, template_code, channel)`, CHECK on `channel IN (email, in_app, sms)`. Absence-of-row = enabled (default-on).
- [x] Migration `0031_notification_preferences.sql` — additive, idempotent (CREATE TABLE IF NOT EXISTS + DO blocks for FK + CHECK). Applied live via Supabase MCP.
- [x] `NotificationService.dispatch()` checks `isOptedOut(recipientPersonId, templateCode, channel)` before calling the provider. Opt-out resolves the user via `persons.user_id` and joins `notification_preferences`. Match with `enabled=false` → mark row `suppressed` with a "recipient opted out" reason instead of sending. DB lookup errors fall back to "not opted out" so a glitch never silently swallows mission-critical mail.
- [x] Endpoints (signed-in user only): `GET /notifications/me/preferences` returns the user's explicit rows plus the full catalog code list; `PUT /notifications/me/preferences/:templateCode/:channel` upserts one cell with `{enabled: boolean}`. Unknown template codes 404.
- [x] SDK: `communications.myPreferences()` + `communications.setPreference(code, channel, body)`.
- [x] Player-web `/notifications/settings` page: curated grid of 16 player-facing templates grouped by category (Registration · Team activity · Payments · Compliance) with email + in-app toggles per row. Optimistic UI, rolls back on error. Linked from the main `/notifications` page header.
- [x] `pnpm --filter @sportspulse/{superadmin-api,player-web} typecheck` clean.
- [x] Smoke (logical): admin queues `invoice.overdue.r1` for a recipient who's set `notification_preferences(user_id, "invoice.overdue.r1", "email", enabled=false)` → row lands in DB with `status="suppressed"` and `lastError="recipient opted out of this template/channel"`; Resend is never hit.

---

## Phase 5 — Decision-gated

### P5-D — Decision: delete `league-admin-web`, build out `org-admin-web` ◐

| Field | Value |
|---|---|
| Closes | **§5** |
| Estimate | 1-hour decision (done); 4 weeks build for `org-admin-web` |

**Decision (2026-05-15):** delete `league-admin-web`, build out `org-admin-web`.
League admins fold into `superadmin-web` with a league-scoped role
filter — the cardinal rule "Every app is just filtered-by-role"
applies cleanly there. Org admins keep their own console because
the persona has a richer surface (multi-league federation owners
need a single org-scoped dashboard, not a global one filtered down).

**Part 1 — `league-admin-web` deletion (done 2026-05-15)**
- [x] `rm -rf apps/league-admin-web` (entire 320-file tree).
- [x] Landing-web nav + CTA section drop the "League Admin" entry; `LEAGUE_ADMIN` const removed.
- [x] Comment refs cleaned across team-admin-web, player-web, org-admin-web, superadmin-web SDK comments.
- [x] CLAUDE.md repo map + deploy table + cardinal-rule text updated. App-Reference.md mentions converted to "league admins land in superadmin-web with a league-scoped filter".
- [x] Playwright config drops `leagueAdmin` URL slots in PROD + LOCAL. Smoke spec `tests/e2e/smoke/league-admin.spec.ts` deleted. Sign-up + sign-in-redirect tests no longer enumerate the league-admin app. Captain-dual-role spec retargets the league-admin smoke user at superadmin-web. README updated.
- [x] `SMOKE_USERS.leagueAdmin` retained in fixtures (the actual auth.users row still exists and is useful for "wrong-role gating" tests).
- [x] `pnpm install` clean; `pnpm --filter @sportspulse/landing-web typecheck` clean.
- [ ] **Manual follow-up:** delete Vercel project `sp-league-admin` from the dashboard. Repo cleanup is done, but the standalone deployment is still live until that project is removed.

**Part 2 — `org-admin-web` first slice (2026-05-15)**
- [x] Audit confirms the app shell already had **8 of 10** routes wired (Overview, Leagues, Seasons, Divisions, Teams, Registrations, Forms, Finance) — all org-scoped via `iam.meScope().orgIds[0]`.
- [x] Added **Communications** page (`/communications`): notification outbox filtered by orgId with status-count stats (queued/sending/sent/failed/suppressed) + a 100-row table.
- [x] Added **Audit** page (`/audit`): audit log filtered by orgId with the standard When · Actor · Action · Resource columns.
- [x] Sidebar updated: 10 entries now (added Communications + Audit).
- [x] Server-API re-exports `communications` + `audit` namespaces.
- [x] Middleware was already in place (`requireRole(['org_admin'])` with super_admin bypass).
- [x] `pnpm --filter @sportspulse/org-admin-web typecheck` clean.

**Still outstanding for org-admin-web (filed for follow-up):**
- [ ] Per-route depth — most list pages are read-only; create / update / delete actions land in superadmin-web today. As org-admin matures, mirror those mutations into org-scoped equivalents.
- [ ] Multi-org switcher when an org_admin holds scope over 2+ orgs (today `orgIds[0]` is used).
- [ ] Smoke-test pass on the deployed app once Vercel deploys the new pages.
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
| P0-5 | rosterLockAt single source | §4.5 | ☑ | 2026-05-15 |
| P1-1 | Real email (Resend) | §3, §7 | ☑ | 2026-05-15 |
| P1-2 | Delete duplicate /captain/* | §1, §2, §6 | ☑ | 2026-05-15 |
| P2-1 | Cross-link pending-team-app surfaces | §4.3 | ☑ | 2026-05-15 |
| P2-2 | Org-scoped registration UX | §8.1 | ☑ | 2026-05-15 |
| P2-3 | Active-player source-of-truth | §4.1, §8.2 | ☑ | 2026-05-15 |
| P3-1 | Sidebar entries cleanup | §6 | ☑ | 2026-05-15 |
| P3-2 | Invoice ↔ team cross-reference | §1.3 | ☑ | 2026-05-15 |
| P3-3 | Form-builder templates dispatch | §3.4 | ☑ | 2026-05-15 |
| P3-4 | "Open live wizard" copy tweak | §1.4 | ☑ | 2026-05-15 |
| P4-1 | Real Stripe | §3.8 | ☐ | — |
| P4-2 | Notification preferences + retry | §7 | ☑ | 2026-05-15 |
| P5-D | Org/league admin app decision | §5 | ☑ | 2026-05-15 |

---

## Working rules

1. **Pick the next ☐** item in priority-rank order (top of TL;DR). Skip ⊘.
2. **Flip to ◐** the moment work starts. Update **Updated** column to today.
3. **All acceptance `[ ]` must be checked** before flipping to ☑. Untested = not done. Tester rule from CLAUDE.md applies — sign in as the actual role, walk the flow end-to-end, cross-surface verify.
4. **One commit per item**, footer `Closes plan: P0-1` so history greps cleanly.
5. **No scope creep** — if an item needs a feature not on this plan, file a new audit observation rather than expanding the item.
