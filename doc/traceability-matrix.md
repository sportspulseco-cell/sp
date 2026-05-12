# Traceability matrix

Maps every requirement / spec / tester ask raised in the SportsPulse build
to the implementation files it landed in, the anchor commit, and the
verification state. Use this when a feature regresses to find the
canonical implementation, or before extending an area to confirm prior
intent.

Sort order: roughly newest first within each section.

Status legend:
- ✅ live, smoke-tested locally
- 🟡 live, partial wiring (UI ships, one or more backend hooks deferred)
- ⏳ scaffolded only — backend or follow-up needed
- 🐛 known bug surfaced by tester

---

## 1. Approval-gate captain registration (Spec 1)

| # | Ask | Implementation | Commit | Status |
|---|---|---|---|---|
| 1.1 | Captain applies to a division → `pending_approval` DTE | [captain-applications.controller.ts](../apps/superadmin-api/src/modules/team-applications/interface/captain-applications.controller.ts) | `d676340` | ✅ |
| 1.2 | Admin review queue per season | [admin-applications.controller.ts](../apps/superadmin-api/src/modules/team-applications/interface/admin-applications.controller.ts), [applications-queue.tsx](../apps/superadmin-web/src/app/(admin)/seasons/[id]/applications/applications-queue.tsx) | `1f49249` | ✅ |
| 1.3 | Approve/reject scoped to super_admin / org_admin / league_admin | `RolesGuard` + `AllowScopedWrite` + `ensureLeagueInScope` in admin-applications | `6613254` | ✅ |
| 1.4 | Notification fan-out per admin role (super_admin / org_admin / league_admin) | apply() / withdraw() loop in captain-applications | `1d16e00` | ✅ |
| 1.5 | Division detail lists approved teams | [divisions/[id]/page.tsx](../apps/superadmin-web/src/app/(admin)/divisions/[id]/page.tsx) | `1d16e00` | ✅ |
| 1.6 | Division detail surfaces pending applications with inline approve/deny | [division-pending-applications.tsx](../apps/superadmin-web/src/components/divisions/division-pending-applications.tsx) | `7ab8825` | ✅ |
| 1.7 | Captain "Register your team" approval-gate route on player-web | [player-web /captain/register/page.tsx](../apps/player-web/src/app/(app)/captain/register/page.tsx) | `4767d09` | ✅ |
| 1.8 | Captain UX redesign — landing / picker / submitted / approved / denied (5 mocks) | [page.tsx](../apps/player-web/src/app/(app)/captain/register/page.tsx) + [division-picker.tsx](../apps/player-web/src/app/(app)/captain/register/[seasonId]/division-picker.tsx) | `d2297b2` | ✅ |
| 1.9 | Same editorial flow ported to team-admin-web | [team-admin /captain/register/page.tsx](../apps/team-admin-web/src/app/(app)/captain/register/page.tsx) | `151552d` | ✅ |
| 1.10 | requireCaptainTeam honours user_role_assignments captain role | [shared/auth/captain.ts](../apps/superadmin-api/src/shared/auth/captain.ts) (one helper, 6 controllers wired) | `a8cbe59` | ✅ |
| 1.11 | Captain Set-up CTA URL is env-aware | NEXT_PUBLIC_TEAM_ADMIN_URL in [page.tsx](../apps/player-web/src/app/(app)/captain/register/page.tsx) | `0c2c701` | ✅ |

---

## 2. Payments & Invoicing (Spec 2 + 6 mocks)

| # | Surface / ask | Implementation | Commit | Status |
|---|---|---|---|---|
| 2.1 | Backend Phases 3–7 — overdue cron, refunds, QB sync, captain dues, mock Stripe seam | [finance/interface/*.controller.ts](../apps/superadmin-api/src/modules/finance/interface/) | `ae7f15b`, `78d8df5` | ✅ |
| 2.2 | Mock 1 — Admin Invoices & AR dashboard (4 KPI tiles, filters, table, pagination) | [ar-dashboard-client.tsx](../apps/superadmin-web/src/components/finance/ar-dashboard-client.tsx) on `/finance` | `0eef2d1`, `8ef1656` | ✅ |
| 2.3 | Mock 2 — New invoice modal (org / scope / recipient / line items / payment plan) | [new-invoice-dialog.tsx](../apps/superadmin-web/src/components/finance/new-invoice-dialog.tsx) | `0eef2d1` | ✅ |
| 2.4 | Mock 3 — Player My Payments (wallet apply, line items, dot timeline, action buttons) | [player-web payments-client.tsx](../apps/player-web/src/app/(app)/payments/payments-client.tsx) | `0eef2d1` | 🟡 (Update card + Download receipt are stubs) |
| 2.5 | Mock 4 — Captain Team Dues (master invoice id, threshold marker, split dropdown, per-row remind) | [team-admin dues-screen.tsx](../apps/team-admin-web/src/app/(app)/captain/dues/dues-screen.tsx) | `0eef2d1` | 🟡 (custom-split persist deferred) |
| 2.6 | Mock 5 — Admin Invoice detail (two-column + admin actions sidebar + internal notes) | [invoice-detail-client.tsx](../apps/superadmin-web/src/components/finance/invoice-detail-client.tsx) | `0eef2d1` | 🟡 (internal-notes save is optimistic-only until endpoint lands) |
| 2.7 | Mock 6 — Refund modal (toggle + pro-rated suggestion + amount-aware CTA) | [refund-dialog.tsx](../apps/superadmin-web/src/components/finance/refund-dialog.tsx) | `0eef2d1` | ✅ |
| 2.8 | Auto-activate pricing tiers when season → registration_open | [ChangeSeasonStatusHandler](../apps/superadmin-api/src/modules/league-management/application/seasons/handlers.ts) | `eee5ff7` | ✅ |

---

## 3. Captain workflows 7A / 7B / 7C

| # | Workflow | Implementation | Commit | Status |
|---|---|---|---|---|
| 3.1 | 7A — captain rollover wizard, atomic 8-write submit | [captain.controller.ts](../apps/superadmin-api/src/modules/captain/interface/captain.controller.ts), [register-wizard.tsx](../apps/team-admin-web/src/app/(app)/captain/register/setup/[entryId]/register-wizard.tsx) | `f929523`, `4500b3b`, `f0f1278` | ✅ |
| 3.2 | 7B — roster management (10 cases across 2 sprints) | [captain-roster.controller.ts](../apps/superadmin-api/src/modules/captain/interface/captain-roster.controller.ts) | `8641049`, `4988d5b`, `7f668dc` | ✅ |
| 3.3 | 7C — Compliance / Eligibility / Captain Dashboard (4 modes) | [compliance.controller.ts](../apps/superadmin-api/src/modules/compliance/interface/compliance.controller.ts), [team-admin /(app)/page.tsx](../apps/team-admin-web/src/app/(app)/page.tsx) | `17287e5`, `7477522`, `cfb3412`, `34f01fc` | ✅ |

---

## 4. Superadmin enhancements

| # | Ask | Implementation | Commit | Status |
|---|---|---|---|---|
| 4.1 | User detail page surfaces team memberships + division | [users/[id]/page.tsx](../apps/superadmin-web/src/app/(admin)/users/[id]/page.tsx), `GET /iam/users/:id/memberships` | `d22a974` | ✅ |
| 4.2 | Teams list links owner-org name to org detail | [teams/page.tsx](../apps/superadmin-web/src/app/(admin)/teams/page.tsx) | `d22a974` | ✅ |
| 4.3 | Org detail rolls up leagues / seasons / divisions / teams | [organizations/[id]/page.tsx](../apps/superadmin-web/src/app/(admin)/organizations/[id]/page.tsx) | `d22a974` | ✅ |
| 4.4 | Inline season status dropdown on detail header | [season-status-control.tsx](../apps/superadmin-web/src/components/seasons/season-status-control.tsx) | `90572ac` | ✅ |
| 4.5 | Form-builder "Open live wizard" button | [form-builder-tab.tsx](../apps/superadmin-web/src/components/registrations/tabs/form-builder-tab.tsx) | `5ad4e59` | ✅ |
| 4.6 | Form-builder roster-lock display falls back to seasons.roster_lock_at column | [divisions-tab.tsx](../apps/superadmin-web/src/components/registrations/tabs/divisions-tab.tsx) | `eee5ff7` | ✅ |

---

## 5. Captain-side reach widening

| # | Ask | Implementation | Commit | Status |
|---|---|---|---|---|
| 5.1 | Open-seasons accepts draft + registration_open status (window-date driven) | [captain-applications.controller.ts](../apps/superadmin-api/src/modules/team-applications/interface/captain-applications.controller.ts) `openSeasons` | `c1e1092` | ✅ |
| 5.2 | Captain sees seasons in parent + child orgs via `org_relations` one-hop | `reachableOrgIds` helper, same controller | `c1e1092` (initial) → `289950c` (Date-bind fix) | ✅ |

---

## 6. Funnel + public registration

| # | Ask | Implementation | Commit | Status |
|---|---|---|---|---|
| 6.1 | Step-order matches the stepper labels | [packages/registration-funnel/src/funnel.tsx](../packages/registration-funnel/src/funnel.tsx) | `13cfad7` | ✅ |
| 6.2 | Sign-in email passed by value (not stale closure) | same | `f8da2ff` | ✅ |
| 6.3 | Funnel header date pinned to en-US (no hydration mismatch) | `fmtDate` helper | `5ad4e59` | ✅ |
| 6.4 | Player /register lists open registrations | [register/page.tsx](../apps/player-web/src/app/(app)/register/page.tsx), `GET /public/registration/open` | `69fa627` (UI) + `5ad4e59` (Date-bind fix) | ✅ |
| 6.5 | Player home surfaces open registrations card | [player-web /(app)/page.tsx](../apps/player-web/src/app/(app)/page.tsx) | `69fa627` | ✅ |
| 6.6 | pending_offline rows visible in review queue | review-queue page | `fb1c464` | ✅ |

---

## 7. Tester-reported regressions / bugfixes (this session)

| # | Symptom | Root cause | Fix commit |
|---|---|---|---|
| 7.1 | Captain saw "No open registrations" despite super-admin showing season as open | Captain check used legacy `teams.captain_user_id` only; ignored `user_role_assignments` captain role | `a8cbe59` |
| 7.2 | Still empty after #7.1 | Postgres.js couldn't bind JS `Date` inside raw `sql\`\`` template in `reachableOrgIds` | `289950c` |
| 7.3 | `/register` list empty in player-web | Same Date-bind bug in `/api/public/registration/open` | `5ad4e59` |
| 7.4 | `/finance/admin/invoices` returned `invalid input syntax for type uuid: "list"` | Route `/invoices/list` collided with `/invoices/:id` | `0eef2d1` (route renamed `/admin/invoices`) |
| 7.5 | Sidebar "Finance" pointed at old aging-bucket dashboard, not the new one with `+ New invoice` | Redesigned dashboard was mounted at `/finance/ar`, sidebar pointed at `/finance` | `8ef1656` |
| 7.6 | New-invoice modal Organisation + Fee Schedule dropdowns were empty | API not running locally → SSR fetches `.catch`-ed to empty | env / runtime fix; CORS_ORIGIN extended for local ports |
| 7.7 | Hydration mismatch on `/divisions/[id]` (date) | `toLocaleDateString(undefined, …)` differed Node ↔ browser | `6f5bc70` |
| 7.8 | Hydration mismatch on funnel header (date) | same root cause as #7.7 | `5ad4e59` |
| 7.9 | New seasons stuck in `draft` with no UI control | No dropdown on detail header | `90572ac` |
| 7.10 | Captain wizard said "No pricing tier configured" with `$—` even though the form-builder created one | `pricing_tiers.is_active=false` on creation by design, but the status dropdown bypassed the publish gate | `eee5ff7` (auto-activate on status flip) |
| 7.11 | Roster-lock date empty in form-builder despite season having one | Form bound to `seasons.config.rosterLockAt` (JSONB) but value lived on `seasons.roster_lock_at` (column) | `eee5ff7` (read column as fallback, write both on save) |

---

## 8. Cross-cutting

| # | Topic | Where it lives |
|---|---|---|
| 8.1 | Captain auth helper (used by 6 controllers) | [shared/auth/captain.ts](../apps/superadmin-api/src/shared/auth/captain.ts) |
| 8.2 | Org-scope projection (org → leagues → teams) for IAM | [shared/auth/scope.ts](../apps/superadmin-api/src/shared/auth/scope.ts) |
| 8.3 | Approval-gate state machine value object | `packages/kernel` |
| 8.4 | Notifications fan-out template | [communications/domain/templates/catalog.ts](../apps/superadmin-api/src/modules/communications/domain/templates/catalog.ts) |
| 8.5 | Captain testing rules (9 numbered, codified from tester transcripts) | [CLAUDE.md](../CLAUDE.md) "test like the testers test" section |

---

## Local dev contract (for verifying against the matrix)

| App | Port | env override |
|---|---|---|
| superadmin-api | 4000 | `apps/superadmin-api/.env` (CORS_ORIGIN extended to 3001–3005) |
| superadmin-web | 3002 | `apps/superadmin-web/.env.local` → `NEXT_PUBLIC_PLAYER_WEB_URL=http://localhost:3004`, `NEXT_PUBLIC_TEAM_ADMIN_URL=http://localhost:3005` |
| player-web | 3004 | `apps/player-web/.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:4000/api`, `NEXT_PUBLIC_TEAM_ADMIN_URL=http://localhost:3005` |
| team-admin-web | 3005 | `apps/team-admin-web/.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:4000/api` |
