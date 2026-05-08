# SportsPulse -- App Reference

**Purpose.** Canonical, ground-truth inventory of the platform as it exists today: every module, every feature, every table, every endpoint, every web surface. Use this as the **base for proposing changes** -- a new feature, a schema delta, a new view, a permission tweak.

**How to read this doc.**
- §1 -- the system at a glance (apps, deployment, role model, cross-cutting contracts).
- §2 -- module catalog. One section per backend bounded context. Each section pairs the *what's built* (tables, endpoints, web surfaces, features) with the *what's pending* (gaps and known spec deltas).
- §3 -- full schema reference (every table, every column).
- §4 -- web-app inventory (who sees what).
- §5 -- how to propose a change.

**Source of truth.** This doc is **derived** from `packages/db/src/schema/`, `apps/superadmin-api/src/modules/`, and the `apps/*-web` route trees -- not the spec docs. Where the spec (e.g. `doc/specs/registration-module-v2.md`) describes something not yet built, it is called out as a gap, not described as fact.

**Last regenerated:** 2026-05-08.

---

# §1. System overview

## 1.1 Apps and deploy targets

| App | Role | Vercel project | URL |
|---|---|---|---|
| `apps/superadmin-api` | NestJS API for everything (DDD modules) | `sp-api` | https://sp-api-one.vercel.app |
| `apps/superadmin-web` | Platform / "god" admin console | `sp-superadmin` | https://sp-superadmin.vercel.app |
| `apps/league-admin-web` | League admin scoped console | `sp-league-admin` | https://sp-league-admin.vercel.app |
| `apps/org-admin-web` | Org admin scoped console | `sp-org-admin` | https://sp-org-admin.vercel.app |
| `apps/team-admin-web` | Team admin / coach console | `sp-team-admin` | https://sp-team-admin.vercel.app |
| `apps/player-web` | Player + captain self-serve | `sp-player` | https://sp-player-red.vercel.app |
| `apps/landing-web` | Public marketing site | `sp-landing` | https://sp-landing-seven.vercel.app |

All seven projects auto-deploy from `main` on the GitHub repo. Postgres lives in Supabase; the API uses the service-role key server-side (bypasses RLS). Web apps use Supabase auth via the anon key for sign-in; data flows through the API.

## 1.2 Architectural rules (cardinal)

These are repo-owner directives in [CLAUDE.md](../CLAUDE.md). Every proposal must respect them.

1. **Reuse over silos.** Find the existing primitive before adding a new one. Permissions, role codes, scope types, audit-action labels, registration submission states live in canonical files under `packages/`. Do not duplicate.
2. **Superadmin is the god app.** All features land in `superadmin-web` first. `org-admin-web`, `league-admin-web`, `team-admin-web`, `player-web` are **role-filtered views of the same functionality** -- never parallel implementations.
3. **Design thinking before code.** Walk every UI flow as super_admin / new user / multi-role user / no-profile user before merging any new dialog or dropdown. Defaults must reflect context (no alphabetic-first, no `array[0]`).
4. **Drizzle is the schema source of truth.** Edit `packages/db/src/schema/*.ts` then `pnpm --filter @sportspulse/db generate`. Migrations are additive and idempotent.
5. **Audit interceptor is global.** Every successful 2xx mutation is logged automatically. Don't reimplement per handler; use action labels of the form `<resource>.<verb>`.

## 1.3 Tech stack

| Layer | Choice |
|---|---|
| Web (all 6 apps) | Next.js 15 App Router, TypeScript, Tailwind |
| API | NestJS, DDD per module (`domain` -> `application` -> `infrastructure` -> `interface`) |
| ORM / DB | Drizzle ORM on Postgres (Supabase) |
| Auth | Supabase Auth (JWT). Per-app login surfaces; one Supabase project, separate sessions per app. |
| Validation | Zod / class-validator on DTOs; ValidationPipe global with whitelist |
| Testing | Playwright e2e (`tests/e2e/`), Jest units inside each module |
| CI/CD | GitHub Actions -> Vercel preview deploys on every PR; merge to `main` -> production |

## 1.4 Roles and scope model

Defined in `packages/kernel/src/roles.ts` and enforced in `apps/superadmin-api/src/shared/auth/`.

**System roles (codes):** `super_admin`, `org_admin`, `league_admin`, `team_admin`, `coach`, `captain`, `referee`, `scorekeeper`, `player`, `free_agent`, `parent`, `spectator`. Org-defined custom roles also exist (rows in `roles` with non-null `orgId`).

**Scope types (where a role applies):** `platform`, `org`, `league`, `season`, `division`, `team`, `game`. Stored on `user_role_assignments.scopeType` + `scopeId`.

**Hierarchy:** `super_admin` > `org_admin` > `league_admin` > `team_admin` > `coach` > `captain` > scorekeeper / referee > `player`/`free_agent`/`parent`/`spectator`.

**Guard contract** (from `apps/superadmin-api/src/shared/auth/`):
- `JwtAuthGuard` validates Supabase Bearer token; populates `req.principal.userId`.
- `SuperAdminGuard` requires `profiles.is_super_admin = true`.
- `AuthorizedAccessGuard` lets super-admin pass; lets any user with active assignments pass for **reads**; writes are read-only unless the handler also has `@AllowScopedWrite()`.
- `RolesGuard` + `@Roles(...)` + `@Scope(scopeType, paramName)` does the granular check.
- `loadUserScope(db, userId)` projects `user_role_assignments` -> `{ isSuperAdmin, orgIds, leagueIds, teamIds }`. List endpoints filter by these; findById endpoints **return 404 (never 403)** when out-of-scope, so existence cannot be probed.

## 1.5 Cross-cutting contracts

- **Audit.** Global `AuditInterceptor` records every successful mutation to `audit_events` with `actor_user_id`, `resource_type`, `resource_id`, `before`, `after`, `ip`, `user_agent`. Action codes: `<resource>.<verb>` (`leagues.create`, `games.finalize`, `roles.assign`).
- **Idempotency.** `notifications`, `registrations`, `roster_moves`, `game_events`, `invoices`, `import_jobs` all have explicit idempotency-key columns. Repeated POSTs with the same key are safe.
- **Append-only event logs.** `roster_moves`, `game_events`, `audit_events`, `import_job_rows` are sources of truth. `team_memberships`, `stat_lines`, `standings`, `leaderboards` are projections.
- **Soft deletes.** Most aggregate roots have `deleted_at`; queries filter `deleted_at IS NULL`.
- **Outbox / notifications.** Domain events queue rows in `notifications`; a flush job sends via console / SendGrid / Twilio (currently console-stub) and records to `notification_delivery_logs`.
- **No RLS today.** Per `doc/data-model.md`, RLS is disabled on all 53 tables. Service-role key gates everything via the API. Public registration v2 endpoints rely on email-token gating, not RLS. **Enabling RLS is a tracked next-step.**

---

# §2. Module catalog

The platform groups into **14 backend modules** under `apps/superadmin-api/src/modules/`. Each maps to one or more schema files under `packages/db/src/schema/` and surfaces to one or more web apps.

| # | Module | Schema files | Primary web surfaces |
|---|---|---|---|
| 2.1 | IAM | `iam.ts` | superadmin-web (Users, Persons, Roles), all apps' onboarding |
| 2.2 | Org Management | `iam.ts` (org tables) | superadmin-web (Orgs), org-admin-web |
| 2.3 | League Management | `league.ts` | superadmin-web, league-admin-web, org-admin-web |
| 2.4 | Roster & Membership | `roster.ts` | superadmin-web, team-admin-web, player-web (captain) |
| 2.5 | Registration v1 (compliance) | `registration.ts` | superadmin-web (Forms / Documents / Eligibility) |
| 2.6 | Registration v2 (public funnel) | `registration-v2.ts` | superadmin-web (Pricing / Templates / Review), player-web (`/register`) |
| 2.7 | Game Operations | `game.ts`, `game-officials.ts` | superadmin-web (Games / Events), team-admin-web (Schedule), player-web |
| 2.8 | Stats | `stats.ts` | superadmin-web (Stats), player-web (Stats), public game pages |
| 2.9 | Finance | `finance.ts` + `registration-v2.ts` (installments) | superadmin-web (Finance), player-web (Payments) |
| 2.10 | Communications / Notifications | `notifications.ts` | superadmin-web (Communications), player-web (Notifications) |
| 2.11 | Audit | `audit.ts` | superadmin-web (Audit), league-admin-web (Audit) |
| 2.12 | Admin (settings, flags) | `admin.ts` | superadmin-web (Admin Console) |
| 2.13 | Reports (CSV exports) | -- (read-only) | superadmin-web (Reports) |
| 2.14 | Data Migration | `admin.ts` (importJobs/Rows) | superadmin-web (Data Migration) |

Each subsection below follows the same template: **Purpose -> Tables -> API -> Web -> Features -> Gaps**.

---

## 2.1 IAM (Identity & Access)

**Purpose.** Authenticated user identity (`profiles`), the broader concept of a person (`persons`, may be a minor or coach without a login), org-scoped role definitions, and role assignments with attribute-based scope.

**Tables.** `profiles`, `persons`, `family_links`, `roles`, `user_role_assignments`, `cross_org_grants`, `identity_verifications`, `background_checks`.

**API endpoints (`/iam/*`).**

| Method | Path | Purpose | Guards |
|---|---|---|---|
| GET | `/iam/me` | Current user's profile | JwtAuthGuard |
| PATCH | `/iam/me` | Self-serve profile patch (used during onboarding) | JwtAuthGuard |
| GET | `/iam/me/scope` | Resolve `{ isSuperAdmin, orgIds, leagueIds, teamIds, roles[] }` | JwtAuthGuard |
| GET | `/iam/me/roles` | Active role assignments for current user | JwtAuthGuard |
| GET | `/iam/users` | List profiles (paginated) | SuperAdmin |
| GET | `/iam/users/:id` | Get user | SuperAdmin |
| PATCH | `/iam/users/:id` | Update user profile | SuperAdmin |
| POST | `/iam/users/:id/suspend` / `/reactivate` | Lifecycle | SuperAdmin |
| POST | `/iam/users/invite` | Invite by email + optionally pre-assign role | SuperAdmin |
| POST | `/iam/users/:id/set-password` | Force-set password | SuperAdmin |
| GET / PATCH | `/iam/users/:id/role-profile?code=...` | Read / write role-specific JSONB profile (e.g. player-side bio) | SuperAdmin |
| GET | `/iam/role-profile-form?code=...` | Resolve the FormDefinition for a given role's profile | SuperAdmin |
| GET / POST / PATCH | `/iam/persons` | Persons CRUD | SuperAdmin |
| POST | `/iam/persons/:id/link-user` | Link person -> auth user | SuperAdmin |
| GET / POST / PATCH / DELETE | `/iam/roles` | Role CRUD (system + custom) | SuperAdmin |
| GET / POST | `/iam/role-assignments` | List + assign | SuperAdmin |
| POST | `/iam/role-assignments/:id/revoke` | Revoke (soft, audited) | SuperAdmin |
| GET | `/iam/users/:id/roles` | Active assignments for one user | SuperAdmin |

**Web surfaces.**
- `superadmin-web /(admin)/users`, `/users/[id]` -- list, edit profile, manage role assignments, edit role-specific profile JSONB.
- `superadmin-web /(admin)/persons` -- non-user persons (minors, historical).
- `superadmin-web /(admin)/roles` -- role catalog (system roles + per-org custom).
- All apps' `/onboarding` page calls `PATCH /iam/me` to complete the profile after signup.

**Features.**
- Email/password auth via Supabase; magic-link supported but UI uses password.
- `is_super_admin` is a **boolean on `profiles`**, not a role row -- it's the platform escape hatch.
- Role-profile JSONB enables player bio, coach credentials, ref payroll info etc., all stored on `profiles.metadata` keyed by role code.
- Cross-org grants (`cross_org_grants`) let a user from Org A see Org B's data when explicitly granted.
- Family links connect a guardian user to a minor person (drives parental-consent flows in registration v2).
- Identity verifications (USA Hockey lookup, SafeSport) and background checks (Sterling/Checkr) are **modeled but not yet wired to live providers**.

**Gaps vs spec.**
- No MFA, no passkeys, no enterprise SSO yet (Modules.md §1 P2).
- Identity verification and background check rows can be inserted but no webhook plumbing.

---

## 2.2 Org Management

**Purpose.** Tenant root. `orgs` are governing bodies, federations, leagues operators, clubs, schools, tournament operators. `org_relations` model parent/child (recursive). `cross_org_grants` are explicit cross-tenant access.

**Tables.** `orgs`, `org_relations`, `cross_org_grants`, `governing_bodies` (separate axis -- USA Hockey, FIFA, etc., for rule-set / eligibility lookups).

**API endpoints (`/orgs/*`, `/cross-org-grants/*`).**

| Method | Path | Purpose | Guards |
|---|---|---|---|
| GET | `/orgs` | List (scope-filtered) | AuthorizedAccess |
| GET | `/orgs/:id` | Get one (scope-checked, 404 if out-of-scope) | AuthorizedAccess |
| POST | `/orgs` | Create | SuperAdmin |
| PATCH | `/orgs/:id` | Update (org_admin can edit own; super_admin always) | AuthorizedAccess |
| POST | `/orgs/:id/suspend` / `/reactivate` | Lifecycle | SuperAdmin |
| DELETE | `/orgs/:id` | Archive (soft) | SuperAdmin |
| POST / DELETE | `/orgs/relations` | Link / unlink parent->child | SuperAdmin |
| GET | `/orgs/:orgId/children` / `/parents` | Walk the tree | SuperAdmin |
| POST / DELETE | `/cross-org-grants` | Issue / revoke | SuperAdmin |
| GET | `/cross-org-grants?userId=...` / `?orgId=...` | List | SuperAdmin |

**Web surfaces.**
- `superadmin-web /(admin)/organizations`, `/organizations/[id]` -- create, brand, link parents, suspend.
- `org-admin-web` is the scoped view for org_admins of *their* org only.

**Features.**
- Branding JSONB on each org: logo, colors, theme. Used by `landing-web` and per-tenant rendering.
- `orgType` enum: `governing_body`, `federation`, `league_operator`, `club`, `association`, `school`, `tournament_operator`.
- Country/locale/currency/timezone defaults per org (drives invoice currency, schedule timezone).

**Gaps.**
- No white-label custom-domain wiring yet.
- Tenant provisioning wizard (Modules.md §16) not built; orgs are created via single POST.

---

## 2.3 League Management

**Purpose.** The competitive structure. Hierarchy after migration `0015_league_season_hierarchy_flip.sql`:

```
Org -> League -> Season -> Division -> Team (via division_team_entries)
```

(Pre-`0015`: `Org -> Season -> League -> Division`. The flip is irreversible.)

**Tables.** `leagues`, `seasons`, `divisions`, `age_groups`, `teams`, `division_team_entries`, `rule_sets`, `governing_bodies`.

**API endpoints (`/league/*`).**

| Method | Path | Purpose | Guards |
|---|---|---|---|
| GET / GET / POST / PATCH | `/league/leagues[/:id]` | League CRUD | AuthorizedAccess |
| POST | `/league/leagues/:id/status` | Status transition | AuthorizedAccess |
| GET / GET / POST / PATCH / DELETE | `/league/divisions[/:id]` | Division CRUD (soft-delete) | AuthorizedAccess |
| GET / POST / PATCH / DELETE | `/league/seasons[/:id]` | Season CRUD | AuthorizedAccess |
| POST | `/league/seasons/:id/status` | Status transition | AuthorizedAccess |
| PATCH | `/league/seasons/:id/config` | Patch season config JSONB (`requireUsaHockeyId`, `allowFreeAgent`, `requireParentalConsent`, etc.) | AuthorizedAccess |
| GET / POST / PATCH / DELETE | `/league/teams[/:id]` | Teams CRUD; PATCH allows scoped writes for team_admin on own team | AuthorizedAccess + `@AllowScopedWrite` |

**Web surfaces.**
- `superadmin-web /(admin)/leagues`, `/seasons`, `/divisions`, `/teams` -- full CRUD.
- `league-admin-web /(admin)/leagues`, `/divisions`, `/teams` -- read scoped to assigned leagues.
- `org-admin-web /(app)/leagues`, `/seasons`, `/divisions`, `/teams` -- read scoped to assigned orgs.
- `team-admin-web /(app)/dashboard` -- read for the user's team.

**Features.**
- Season config JSONB drives registration v2 (which docs to require, whether minors need parental consent, free-agent toggle).
- Division `playoffConfig` JSONB and `ruleSetOverrides` allow per-division rules.
- Age groups are tied to a governing body (e.g. USA Hockey U16) and constrain `birthYearMin`/`birthYearMax` + play-up policy.
- `division_team_entries` track application/acceptance lifecycle of a team in a division (`applied`, `accepted`, `withdrawn`, `disqualified`).

**Gaps.**
- No auto-schedule generator yet (Modules.md §5 -- Python + OR-Tools is on roadmap).
- No bracket generator, no playoff seeding logic.
- No CSV scheduler imports (Diamond Scheduler / LeagueLobster).

---

## 2.4 Roster & Membership

**Purpose.** Track who is on what team in what season. `roster_moves` is the append-only event log; `team_memberships` is the projection of current state.

**Tables.** `roster_moves`, `team_memberships`.

**API endpoints (`/roster/*`).**

| Method | Path | Purpose | Guards |
|---|---|---|---|
| GET | `/roster/memberships?teamId=...` | Current memberships for a team | AuthorizedAccess (team-scope bypass) |
| GET | `/roster/snapshot?teamId=...&at=<ISO>` | Replay roster at a point in time | AuthorizedAccess |
| GET | `/roster/moves` | Event log (paginated) | AuthorizedAccess |
| GET | `/roster/moves/:id` | One move | AuthorizedAccess |
| POST | `/roster/moves/add` / `/drop` | Add / drop player (team_admin can act on own team) | AuthorizedAccess + `@AllowScopedWrite` |
| POST | `/roster/moves/trade` / `/call-up` / `/send-down` | Cross-team moves | AuthorizedAccess |

**Web surfaces.**
- `superadmin-web /(admin)/teams/[id]` and `/memberships` -- view + manipulate any roster.
- `team-admin-web /(app)/roster` -- own team only; add/drop within scope.
- `player-web /(app)/captain/manage-roster` -- captain console for own team.

**Features.**
- Move types: `add`, `drop`, `trade_in`, `trade_out`, `call_up`, `send_down`, `release`, `reinstate`.
- Membership types: `primary`, `play_up`, `affiliate`, `call_up`.
- Jersey number unique per `(team, season)` while membership active.
- `sourceEventId` enables idempotent imports.

**Gaps.**
- No roster lock enforcement yet (the `season.rosterLockAt` column exists; no service refuses moves past it).
- No min-GP playoff-roster validator.

---

## 2.5 Registration v1 (compliance)

**Purpose.** The legacy / admin-driven registration path: forms, form versions, document signatures, eligibility records. **Coexists** with v2; new public flows use v2.

**Tables.** `registration_forms`, `registration_form_versions`, `registrations` (shared with v2), `registration_items`, `documents`, `document_versions`, `consent_signatures`, `eligibility_records`.

**API endpoints (super_admin only).**

| Method | Path | Purpose |
|---|---|---|
| GET / POST | `/registration/registrations[/:id]` | Manual registration CRUD |
| POST | `/registration/registrations/:id/submit` / `/review` / `/withdraw` | Lifecycle |
| GET / POST / PATCH | `/registration/forms[/:id]` | Form CRUD |
| GET / POST | `/registration/forms/:id/versions` | Versions |
| POST | `/registration/forms/:id/versions/:versionId/publish` | Publish (locks version, sets active) |
| GET / POST / PATCH | `/compliance/documents[/:id]` | Waiver / consent / privacy doc CRUD |
| GET / POST | `/compliance/documents/:id/versions` | Versions |
| POST | `/compliance/documents/:id/versions/publish` | Publish version (supersedes prior) |
| POST | `/compliance/documents/signatures` | Sign on-behalf-of (admin path) |
| POST | `/compliance/documents/signatures/:id/revoke` | Revoke signature |
| GET | `/compliance/documents/signatures/by-person/:personId` | Audit: all sigs for one person |
| GET / POST | `/compliance/eligibility[/:id]` | Eligibility record CRUD |
| POST | `/compliance/eligibility/:id/reevaluate` | Re-run rule engine |
| POST | `/compliance/eligibility/:id/waive` | Admin override (audited) |

**Web surfaces.**
- `superadmin-web /(admin)/forms`, `/forms/[id]` -- form builder (cascading scope: org -> league -> division -> team).
- `superadmin-web /(admin)/documents`, `/registrations`, `/eligibility`.

**Features.**
- Form versions are immutable once published (`locked = true`); a new draft must be created to edit.
- Document `kind` enum: `waiver`, `consent`, `code_of_conduct`, `privacy`, `parental`, `media_release`, `injury_policy`, `custom`.
- Consent signatures capture IP, user agent, geolocation, signature image URL.
- Eligibility evaluation is **stored**, not computed live -- the rule engine is invoked on request and writes a record.

**Gaps.**
- No conditional logic in forms (spec §3, Registration v2 form-builder); v1 forms are flat.
- Document version `effective_from`/`supersededAt` model versioning, but there's no campaign for re-signing on bump.

---

## 2.6 Registration v2 (public funnel)

**Purpose.** Spec: [doc/specs/registration-module-v2.md](specs/registration-module-v2.md) and [workflow-1-player-signup-v2.md](specs/workflow-1-player-signup-v2.md). Public-facing registration with state machine, pricing tiers, payment plans, parental consent, team invites, and a free-agent pool.

**Tables.** Adds `pricing_tiers`, `installment_schedules`, `email_templates`, `team_invites`, `free_agent_pool_entries`. Extends `registrations.status` enum to cover the v2 state machine: `pending_verification`, `pending_consent`, `pending_payment`, `pending_offline`, `pending_review`, `incomplete`, `approved`, `rejected`, `cancelled`.

**API endpoints.**

Public (no auth, email-token gated):

| Method | Path | Purpose |
|---|---|---|
| GET | `/public/registration/seasons/:id` | Season context: meta, pricing tiers, form definition |
| POST | `/public/registration/seasons/:id/submissions` | Start submission (creates auth user + registration) |
| GET | `/public/registration/submissions/:id?email=...` | Resume |
| GET | `/public/registration/seasons/:id/waivers` | Waivers/consents to sign |
| POST | `/public/registration/submissions/:id/sign-waiver` | Record signature |
| POST | `.../parental-consent/start` | Send link to guardian email (72h TTL) |
| POST | `.../parental-consent/confirm` | Confirm via token |
| POST | `.../eligibility-check` | Run automated checks (age, USA Hockey, SafeSport) |
| POST | `.../pay` | Charge (mocked Stripe) -- creates `installment_schedules` if plan |
| POST | `.../cancel` | Player-initiated cancel |
| GET | `/public/registration/invites/:token` | Resolve invite -> team + season |

Admin (super_admin):

| Method | Path | Purpose |
|---|---|---|
| GET | `/registration-v2/admin/submissions?status=...&orgId=...&search=...` | Filterable queue |
| POST | `/registration-v2/admin/submissions/:id/review` | `approve` / `reject` / `request_resubmission` / `override_flag` |
| POST | `.../bulk-approve` / `/bulk-reject` / `/bulk-email` | Bulk actions |
| GET / POST / PATCH / DELETE | `/registration-v2/pricing-tiers[/:id]` | Tier CRUD |
| GET / POST / PATCH / DELETE | `/registration-v2/email-templates[/:id]` | Template CRUD per `event_type` x `registration_type` |
| POST | `/registration-v2/seasons/:id/rollover` | Copy tiers + templates from prior season |

Team invites (scope-aware):

| Method | Path | Purpose | Guards |
|---|---|---|---|
| GET | `/registration-v2/team-invites` | List | AuthorizedAccess |
| POST | `/registration-v2/team-invites` | Create (captain / team_admin can issue for own team) | AuthorizedAccess + `@AllowScopedWrite` |
| PATCH | `/registration-v2/team-invites/:id/revoke` | Revoke | AuthorizedAccess |

**Web surfaces.**
- `player-web /register/[id]` -- the public funnel (anonymous start, account creation mid-flow).
- `superadmin-web /(admin)/registrations` -- review queue.
- `superadmin-web /(admin)/forms/[id]/setup` -- per-season tabbed config (Season Setup, Pricing, Divisions, Form Builder, Email Templates, Review & Publish) per spec.
- `player-web /(app)/captain/invites` -- captain issues team invites.
- `player-web /(app)/captain/free-agents` -- captain browses free-agent pool.

**Features.**
- State machine: 10 states with explicit transitions; automated transitions on system actions.
- Pricing tiers: standard / custom URL slugs, returning-team pricing flag, usage limits with atomic increment.
- Payment plans: `paymentPlanEnabled` -> `installment_schedules` rows with `dueDate`, `amountCents`, `attemptCount`, `lastErrorMessage`.
- Email templates: per-`event_type` (`on_payment`, `on_approved`, `on_rejected`, `installment_reminder`, `season_closing`, `parental_consent`, `custom`) x per-`registration_type_filter` (`all` / `team` / `individual`).
- Team invites: personal (email-bound) or generic (URL-only), with token, expiry, send-count throttling.
- Free agent pool: positions, availability JSONB, level + flexibility, no-show rate cache, `placed_team_id` once assigned.

**Gaps.**
- Stripe is mocked -- `installment_schedules.stripe_payment_intent_id` exists but isn't populated.
- No goalie-911 last-minute matching.
- Form builder UI not yet shipped (per spec; conditional logic columns exist in `registration_forms` but the builder hasn't been built).

---

## 2.7 Game Operations

**Purpose.** Schedule, run, and finalize games. Append-only event log; final scores derive from events.

**Tables.** `games`, `game_events`, `game_attendance`, `game_officials`, `scoresheet_signatures`, `suspensions`.

**API endpoints.**

Games (scope-filtered):

| Method | Path | Purpose |
|---|---|---|
| GET / GET / POST | `/games[/:id]` | List / get / create |
| POST | `/games/:id/start` | -> `in_play` |
| POST | `/games/:id/score` | Apply score + period (in_play only) |
| POST | `/games/:id/postpone` / `/cancel` / `/forfeit` / `/finalize` | Lifecycle |

Events (super_admin only):

| Method | Path | Purpose |
|---|---|---|
| GET | `/game-events` | Paginated |
| GET | `/game-events/for-game/:gameId` | Full ordered log |
| POST | `/game-events` | Append (idempotency-keyed) |

Officials (super_admin only):

| Method | Path | Purpose |
|---|---|---|
| GET | `/games/:gameId/officials` | List |
| GET | `/game-officials/for-person/:personId` | Per official |
| POST | `/games/:gameId/officials` | Assign |
| PATCH | `/game-officials/:id/status` | confirmed / tentative / declined |
| DELETE | `/game-officials/:id` | Soft-revoke |

Suspensions (super_admin only):

| Method | Path | Purpose |
|---|---|---|
| GET | `/suspensions` | List |
| POST | `/suspensions` | Issue (auditable) |
| POST | `/suspensions/:id/lift` / `/serve` | Lift / mark one served |

**Web surfaces.**
- `superadmin-web /(admin)/games`, `/games/[id]` -- create, transition, append events.
- `superadmin-web /(admin)/game-events` -- append-only log viewer.
- `team-admin-web /(app)/schedule` -- own team fixtures.
- `player-web /(app)/schedule` -- player's calendar (W/L/T badges, iCal export).

**Features.**
- Game status: `scheduled`, `in_play`, `completed`, `postponed`, `cancelled`, `forfeited`.
- Game events have `source` enum: `scorekeeper_app`, `ref_amend`, `video_review`, `import`, `system`. Corrections are *new* events with `correctionOfEventId`.
- Suspensions: `n_games`, `n_days`, `indefinite`, `time_bounded`, with `servedCount` counter.
- Scoresheet signatures capture IP, UA, signature blob, content hash for tamper evidence.

**Gaps.**
- No Expo scorekeeper app yet (Modules.md §6 / §18); events come in via API only.
- Discipline auto-suspension (X misconducts -> 1 game) not wired.
- No live scoreboard / public game page yet.

---

## 2.8 Stats

**Purpose.** Per-player and per-team stat lines projected from `game_events`; standings projected from completed games; leaderboards built from stat lines.

**Tables.** `stat_lines`, `standings`, `leaderboards`.

**API endpoints (`/stats/*`, scope-filtered).**

| Method | Path | Purpose |
|---|---|---|
| GET | `/stats/lines` / `/lines/for-game/:gameId` | Per (game, person) lines |
| POST | `/stats/games/:gameId/project` | Re-project from events |
| GET | `/stats/standings/:leagueId?divisionId=...` | Standings |
| POST | `/stats/standings/:leagueId/recompute` | Recompute |
| POST | `/stats/leaderboards` | Build / refresh |

**Web surfaces.**
- `superadmin-web /(admin)/stats` -- viewer + recompute trigger.
- `player-web /(app)/stats` -- selectable scope (career / season / playoffs).
- `team-admin-web /(app)/stats` -- team-level.
- `league-admin-web /(admin)/standings` -- league standings.

**Features.**
- `stat_lines.core` JSONB has canonical per-sport stats (G, A, P, PIM, +/-); `extended` JSONB has goalie / advanced metrics.
- Leaderboards stored as top-N JSONB entries with rank + value, keyed by `(scopeType, scopeId, metric, windowKind)`.
- Standings computed with sport-aware tiebreakers stored in `tiebreakers` JSONB.

**Gaps.**
- Advanced stats (xG, Corsi) not implemented.
- No materialized cache layer; all reads hit Postgres.

---

## 2.9 Finance

**Purpose.** Invoicing, payments, fee schedules. Registration v2 adds installment plans.

**Tables.** `fee_schedules`, `invoices`, `invoice_items`, `payments`, plus `installment_schedules` (v2 extension).

**API endpoints (super_admin only).**

| Method | Path | Purpose |
|---|---|---|
| GET / POST / PATCH | `/finance/fee-schedules[/:id]` | CRUD |
| GET / GET / POST | `/finance/invoices[/:id]` | List / get / create |
| POST | `/finance/invoices/:id/send` | Issue |
| POST | `/finance/invoices/:id/void` | Void |
| POST | `/finance/invoices/:id/reconcile` | Reconcile |
| GET / POST | `/finance/invoices/:id/payments` | List / record manual payment |

**Web surfaces.**
- `superadmin-web /(admin)/finance` -- AR view, manual payment entry.
- `org-admin-web /(app)/finance` -- scoped read.
- `player-web /(app)/payments` -- the player's invoice + history view.

**Features.**
- Invoice status: `draft`, `sent`, `paid`, `partial`, `overdue`, `void`.
- Payment methods: `cash`, `check`, `credit_card`, `etransfer`, `bank_transfer`, `manual`, `refund`.
- Installment schedules tie 1:1 to invoices, with deposit at index 0 and ordered installments after.

**Gaps.**
- Stripe Connect not wired (mocked in registration v2 funnel).
- No payouts, no QuickBooks sync, no captain dues-splitting UI (Modules.md §8 P2 items).
- AR aging dashboard is mocked; no late-fee auto-apply job.

---

## 2.10 Communications / Notifications

**Purpose.** Outbox-pattern notifications with templates. One fan-out service, one queue, multi-channel (email / SMS / in-app).

**Tables.** `notification_templates`, `notifications`, `notification_delivery_logs`.

**API endpoints.**

| Method | Path | Purpose | Guards |
|---|---|---|---|
| GET / POST / DELETE | `/notification-templates[/:id]` | Template CRUD | SuperAdmin |
| GET | `/notifications` | Outbox | SuperAdmin |
| GET | `/notifications/for-person/:personId` | Per person | SuperAdmin |
| POST | `/notifications/:id/retry` | Retry one | SuperAdmin |
| POST | `/notifications/flush` | Drain queue | SuperAdmin |
| GET | `/notifications/me/unread-count` | Self | JwtAuthGuard |
| GET | `/notifications/:id` | Self (recipient) or super_admin | JwtAuthGuard |
| POST | `/notifications/:id/read` | Mark read | JwtAuthGuard |
| POST | `/notifications/me/read-all` | Bulk mark read | JwtAuthGuard |

**Web surfaces.**
- `superadmin-web /(admin)/communications` -- outbox view, retry, flush.
- `player-web /(app)/notifications` -- in-app inbox.
- `team-admin-web /(app)/communications` -- team comms (placeholder).

**Features.**
- Channels: `email`, `sms`, `in_app`. Channel pluggable per template.
- Templates keyed `(orgId, code, channel, locale)`; org-scoped overrides platform defaults.
- Delivery logs capture provider message ID and full response JSONB.
- Idempotency-key-deduped (e.g. `reg-approved:{id}:email`).

**Gaps.**
- Provider plug is currently `console`; SendGrid / Twilio integrations are stubbed.
- No quiet-hours, no per-user channel preferences, no SMS opt-in/out.
- No team chat (Modules.md §9 -- distinct from notifications).

---

## 2.11 Audit

**Purpose.** Immutable record of every successful 2xx mutation. Powers compliance reviews, debugging, and the audit UI.

**Tables.** `audit_events`.

**API endpoints (`/audit/*`, scope-filtered reads).**

| Method | Path | Purpose |
|---|---|---|
| GET | `/audit` | List, scope-filtered by orgIds (newest first) |
| GET | `/audit/facets` | Distinct actions + resource types for filter UI |
| GET | `/audit/:id` | Get one (scope-checked) |

**Web surfaces.**
- `superadmin-web /(admin)/audit`, `/audit/[id]` -- all-org viewer + detail.
- `league-admin-web /(admin)/audit` -- scoped to user's leagues.

**Features.**
- Captures `actorUserId`, `onBehalfOfUserId` (delegation), `before`, `after` JSONB diffs, IP, UA, request ID.
- Retention class: `default`, `financial`, `legal_hold`. Drives future purge / export rules.
- Action codes follow `<resource>.<verb>` (e.g. `leagues.create`, `roles.revoke`, `games.finalize`).

**Gaps.**
- No archive-to-Blob / partition-by-month yet (Modules.md §13 MVP).
- DSR / right-to-erasure flows not built.

---

## 2.12 Admin (settings, flags, sports)

**Purpose.** Platform-level knobs accessible only to super_admin.

**Tables.** `system_settings`, `feature_flags`, `sports`.

**API endpoints (super_admin only).**

| Method | Path | Purpose |
|---|---|---|
| GET / POST | `/admin/settings` | List / upsert |
| GET / POST / DELETE | `/admin/flags[/:key]` | Flag CRUD |
| GET / PATCH | `/admin/sports[/:code]` | Sport metadata |
| GET | `/admin/health` | DB ping + module list |

**Web surfaces.**
- `superadmin-web /(admin)/admin` -- the admin console (settings tabs, flag toggles, sport editor, health).

**Features.**
- Settings: arbitrary JSONB values keyed by `key` (e.g. `support.email`, `branding.primary_color`); `isEditable` lets us lock specific keys.
- Feature flags: master switch + rollout percentage (stable hash on actor) + optional org allowlist + variant payload.
- Sports table seeds 14 sports (`ice_hockey`, `basketball`, etc.) with `periodModel` (`period`/`half`/`quarter`/etc.) and `scoringModel` JSONB.

**Gaps.**
- No OpenFeature / LaunchDarkly integration; flags are read directly from the DB.

---

## 2.13 Reports

**Purpose.** CSV exports of common operational lists. Acts as the "raw export from any list view" backstop (per CLAUDE.md cardinal: never let users dead-end on report customisation).

**Tables.** None; read-only over existing tables.

**API endpoints (super_admin only).**

| Method | Path | Purpose |
|---|---|---|
| GET | `/reports/standings.csv?leagueId=...&divisionId=...` | Standings as CSV |
| GET | `/reports/rosters.csv?seasonId=...|teamId=...` | Active memberships as CSV |
| GET | `/reports/registrations.csv?orgId=...&leagueId=...&status=...` | Registrations as CSV |

**Web surfaces.**
- `superadmin-web /(admin)/reports` -- one page with form + download buttons.

**Gaps.**
- No saved report builder, no scheduled-delivery (Modules.md §14 MVP).

---

## 2.14 Data Migration

**Purpose.** CSV importers for bulk loading persons, teams, registrations, rosters, games. Idempotent via `(import_source, external_id)` keying on the entity rows.

**Tables.** `import_jobs`, `import_job_rows`.

**API endpoints (super_admin only).**

| Method | Path | Purpose |
|---|---|---|
| GET | `/imports/supported` | List supported entity kinds |
| GET | `/imports` | List jobs |
| GET | `/imports/:id` | Get job |
| GET | `/imports/:id/rows?status=ok|failed|skipped` | Per-row results |
| POST | `/imports` | Run sync (limit ~1k rows) |

**Web surfaces.**
- `superadmin-web /(admin)/data-migration` -- upload CSV, map columns, preview, run, view per-row errors.

**Features.**
- Supported entity kinds: `persons`, `teams`, `registrations`, `rosters`, `games`.
- Each row stores `raw` JSONB + status + error message + `createdEntityId` on success.
- Field mapping JSONB persists user's column-to-field choices.

**Gaps.**
- No async job runner -- imports are synchronous and capped.
- No SE / Crossbar migration toolkit (Modules.md §24 P2).

---

# §3. Full schema reference

53 tables across 13 schema files in `packages/db/src/schema/`. Drizzle TypeScript is the source of truth -- the SQL in `packages/db/migrations/*.sql` is generated from it.

Common patterns:
- All ID columns are `uuid` with `gen_random_uuid()` defaults unless stated otherwise.
- All `*_at` timestamps are `timestamptz` defaulting to `now()`.
- All `metadata` columns are `jsonb` defaulting to `'{}'`.
- `name_translations` is `jsonb` keyed by locale code.

Below: every table, every column, in module order. Type column abbreviations: `tsz` = timestamptz, `int` = integer, `bool` = boolean, `text[]` = text array, `*` = NOT NULL.

## 3.1 Reference (`reference.ts`)

### `currencies`
| Column | Type | Default | Notes |
|---|---|---|---|
| code* | char(3) | -- | PK. ISO-4217 (`USD`, `CAD`). |
| name* | text | -- | Display name. |
| symbol* | text | -- | `$`, `€`. |
| decimals* | smallint | 2 | -- |

### `locales`
| Column | Type | Default | Notes |
|---|---|---|---|
| code* | text | -- | PK. BCP-47 (`en-US`). |
| name* | text | -- | Display. |
| rtl* | bool | false | Right-to-left script. |

### `countries`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| code* | char(2) | -- | -- | PK. ISO-3166-1 alpha-2. |
| name* | text | -- | -- | -- |
| defaultCurrency* | char(3) | -- | currencies.code | -- |
| defaultLocale* | text | -- | locales.code | -- |
| phonePrefix | text | NULL | -- | `+1`. |

### `sports`
| Column | Type | Default | Notes |
|---|---|---|---|
| code* | text | -- | PK (`ice_hockey`). |
| name* | text | -- | -- |
| nameTranslations* | jsonb | `'{}'` | -- |
| teamSizeDefault | smallint | NULL | -- |
| periodModel* | text | -- | enum: `period`/`half`/`quarter`/`inning`/`set`/`frame`/`none`. |
| scoringModel* | jsonb | `'{}'` | Sport-specific. |
| active* | bool | true | -- |
| createdAt*, updatedAt* | tsz | now() | -- |

## 3.2 IAM (`iam.ts`)

### `profiles`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | -- | auth.users.id (cascade) | PK 1:1 with Supabase user. |
| email | citext | NULL | -- | Unique. |
| phoneE164 | text | NULL | -- | Unique. |
| legalFirstName, legalLastName, preferredName, displayName | text | NULL | -- | -- |
| photoUrl | text | NULL | -- | -- |
| dobDate | date | NULL | -- | -- |
| genderSelfId, pronouns | text | NULL | -- | -- |
| countryCode | char(2) | NULL | countries.code | -- |
| locale* | text | `'en-US'` | locales.code | -- |
| timezone* | text | `'UTC'` | -- | -- |
| status* | text | `'active'` | -- | enum: pending/active/suspended/deleted. |
| isSuperAdmin* | bool | false | -- | Platform escape hatch. |
| nameTranslations* | jsonb | `'{}'` | -- | -- |
| metadata* | jsonb | `'{}'` | -- | Houses role-profile JSONB blocks. |
| lastLoginAt, deletedAt | tsz | NULL | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

Indexes: `(status) WHERE deleted_at IS NULL`, `(country_code)`.

### `orgs`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | PK |
| slug* | text | -- | -- | Unique URL slug. |
| legalName*, displayName* | text | -- | -- | -- |
| orgType* | text | -- | -- | enum: `governing_body`, `federation`, `league_operator`, `club`, `association`, `school`, `tournament_operator`. |
| countryCode* | char(2) | -- | countries.code | -- |
| defaultLocale* | text | -- | locales.code | -- |
| defaultCurrency* | char(3) | -- | currencies.code | -- |
| defaultTimezone* | text | `'UTC'` | -- | -- |
| status* | text | `'active'` | -- | enum: active/suspended/archived. |
| branding*, metadata* | jsonb | `'{}'` | -- | -- |
| deletedAt | tsz | NULL | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

### `org_relations`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| parentOrgId*, childOrgId* | uuid | -- | orgs.id (cascade) | Self-loop forbidden by check. |
| relation* | text | -- | -- | enum: `sanctions`, `member_of`, `owns`. |
| effectiveFrom* | tsz | now() | -- | -- |
| effectiveTo | tsz | NULL | -- | -- |
| createdAt* | tsz | now() | -- | -- |

Unique index: `(parentOrgId, childOrgId, relation)`.

### `roles`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| orgId | uuid | NULL | orgs.id (cascade) | NULL = system role. |
| code* | text | -- | -- | `super_admin`, `org_admin`, custom codes. |
| name*, description | text | -- | -- | -- |
| nameTranslations* | jsonb | `'{}'` | -- | -- |
| isSystem* | bool | false | -- | -- |
| permissions* | jsonb | `'[]'` | -- | Permission strings. |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

Unique: `(orgId, code)`.

### `user_role_assignments`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| userId* | uuid | -- | auth.users.id (cascade) | -- |
| roleId* | uuid | -- | roles.id (cascade) | -- |
| scopeType* | text | -- | -- | enum: `platform`/`org`/`league`/`season`/`division`/`team`/`game`. |
| scopeId | uuid | NULL | -- | Polymorphic by scopeType. |
| effectiveFrom* | tsz | now() | -- | -- |
| effectiveTo | tsz | NULL | -- | -- |
| grantedByUserId, revokedByUserId | uuid | NULL | auth.users.id (set null) | -- |
| revokedAt | tsz | NULL | -- | -- |
| metadata* | jsonb | `'{}'` | -- | -- |
| createdAt* | tsz | now() | -- | -- |

Indexes include `(userId) WHERE revokedAt IS NULL`.

### `cross_org_grants`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| userId* | uuid | -- | auth.users.id (cascade) | -- |
| fromOrgId*, toOrgId* | uuid | -- | orgs.id (cascade) | Self-loop forbidden. |
| permissions* | jsonb | `'[]'` | -- | -- |
| effectiveFrom* | tsz | now() | -- | -- |
| effectiveTo | tsz | NULL | -- | -- |
| grantedByUserId | uuid | NULL | auth.users.id (set null) | -- |
| createdAt* | tsz | now() | -- | -- |

### `persons`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| userId | uuid | NULL | auth.users.id (set null) | Optional link. Unique. |
| legalFirstName*, legalLastName* | text | -- | -- | -- |
| preferredName | text | NULL | -- | -- |
| dobDate | date | NULL | -- | -- |
| genderSelfId, pronouns | text | NULL | -- | -- |
| countryCode | char(2) | NULL | countries.code | -- |
| photoUrl | text | NULL | -- | -- |
| nameTranslations*, metadata*, externalIds* | jsonb | `'{}'` | -- | -- |
| deletedAt | tsz | NULL | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

### `family_links`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| guardianUserId* | uuid | -- | auth.users.id (cascade) | -- |
| minorPersonId* | uuid | -- | persons.id (cascade) | -- |
| relationship* | text | -- | -- | enum: `parent`/`guardian`/`relative`. |
| legalStatus | text | NULL | -- | e.g. `custodial_parent`. |
| verifiedAt, unlinkedAt | tsz | NULL | -- | -- |
| verifiedByUserId | uuid | NULL | auth.users.id (set null) | -- |
| createdAt* | tsz | now() | -- | -- |

Unique: `(guardianUserId, minorPersonId)`.

### `identity_verifications`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| personId* | uuid | -- | persons.id (cascade) | -- |
| governingBodyId* | uuid | -- | governing_bodies.id (restrict) | -- |
| externalId* | text | -- | -- | e.g. USA Hockey member #. |
| status* | text | `'pending'` | -- | enum: pending/verified/mismatch/expired. |
| verifiedAt, expiresAt | tsz | NULL | -- | -- |
| source* | text | `'self_attest'` | -- | enum: api/document_upload/self_attest. |
| metadata* | jsonb | `'{}'` | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

Unique: `(personId, governingBodyId, externalId)`.

### `background_checks`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| personId* | uuid | -- | persons.id (cascade) | -- |
| provider* | text | -- | -- | `sterling`, `checkr`. |
| externalRef | text | NULL | -- | -- |
| status* | text | `'requested'` | -- | enum: requested/in_progress/clear/flagged/adverse/expired. |
| requestedAt* | tsz | now() | -- | -- |
| completedAt, expiresAt | tsz | NULL | -- | -- |
| adjudication* | jsonb | `'{}'` | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

## 3.3 League (`league.ts`)

### `governing_bodies`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| code* | text | -- | -- | Unique (`usa-hockey`). |
| name* | text | -- | -- | -- |
| nameTranslations* | jsonb | `'{}'` | -- | -- |
| sportCode* | text | -- | sports.code | -- |
| countryCode | char(2) | NULL | countries.code | -- |
| scope* | text | -- | -- | enum: international/national/regional/state/local. |
| parentId | uuid | NULL | self | -- |
| rulesUrl, contactEmail | text | NULL | -- | -- |
| metadata* | jsonb | `'{}'` | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

### `age_groups`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| governingBodyId* | uuid | -- | governing_bodies.id (cascade) | -- |
| code*, label* | text | -- | -- | `u16` / "Under 16". |
| birthYearMin, birthYearMax | int | NULL | -- | -- |
| genderEligibility* | text | -- | -- | enum: male/female/mixed/open. |
| playUpPolicy* | jsonb | `'{"allowed":false}'` | -- | -- |
| effectiveFrom, effectiveTo | date | NULL | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

Unique: `(governingBodyId, code)`.

### `rule_sets`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| sportCode* | text | -- | sports.code | -- |
| governingBodyId | uuid | NULL | governing_bodies.id (set null) | -- |
| orgId | uuid | NULL | orgs.id (cascade) | -- |
| name* | text | -- | -- | -- |
| versionNumber* | int | 1 | -- | -- |
| definition* | jsonb | `'{}'` | -- | -- |
| isLocked | tsz | NULL | -- | Set when first adopted. |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

### `leagues`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| orgId* | uuid | -- | orgs.id (cascade) | -- |
| sportCode* | text | -- | sports.code | -- |
| governingBodyId | uuid | NULL | governing_bodies.id (set null) | -- |
| ruleSetId | uuid | NULL | rule_sets.id (set null) | -- |
| name* | text | -- | -- | -- |
| nameTranslations* | jsonb | `'{}'` | -- | -- |
| format* | text | `'regular'` | -- | enum: regular/tournament/pickup/friendly. |
| status* | text | `'active'` | -- | enum: draft/active/archived. |
| metadata* | jsonb | `'{}'` | -- | -- |
| deletedAt | tsz | NULL | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

### `seasons`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| leagueId* | uuid | -- | leagues.id (cascade) | -- |
| orgId* | uuid | -- | orgs.id (cascade) | Denormalized; trigger keeps in sync. |
| name* | text | -- | -- | -- |
| nameTranslations* | jsonb | `'{}'` | -- | -- |
| sportCode* | text | -- | sports.code | -- |
| startDate*, endDate* | date | -- | -- | endDate >= startDate. |
| registrationOpensAt, registrationClosesAt, rosterLockAt | tsz | NULL | -- | -- |
| timezone* | text | `'UTC'` | -- | -- |
| status* | text | `'draft'` | -- | enum: draft/registration_open/in_progress/playoffs/completed/archived. |
| config* | jsonb | `'{}'` | -- | Per-season toggles (allowFreeAgent, requireUsaHockeyId, requireParentalConsent, ...). |
| metadata* | jsonb | `'{}'` | -- | -- |
| deletedAt | tsz | NULL | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |
| createdByUserId | uuid | NULL | auth.users.id (set null) | -- |

### `divisions`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| seasonId* | uuid | -- | seasons.id (cascade) | Migrated from league in `0015`. |
| ageGroupId | uuid | NULL | age_groups.id (set null) | -- |
| name* | text | -- | -- | -- |
| tier | text | NULL | -- | `A`/`B`/`Premier`. |
| genderEligibility* | text | `'open'` | -- | enum: male/female/mixed/open. |
| ruleSetOverrides* | jsonb | `'{}'` | -- | -- |
| maxTeams | smallint | NULL | -- | -- |
| playoffConfig* | jsonb | `'{}'` | -- | -- |
| status* | text | `'active'` | -- | enum: active/archived. |
| deletedAt | tsz | NULL | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

### `teams`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| orgId* | uuid | -- | orgs.id (cascade) | -- |
| name*, shortName | text | -- | -- | -- |
| nameTranslations* | jsonb | `'{}'` | -- | -- |
| colors* | jsonb | `'{}'` | -- | -- |
| logoUrl | text | NULL | -- | -- |
| sportCode* | text | -- | sports.code | -- |
| externalIds* | jsonb | `'{}'` | -- | -- |
| status* | text | `'active'` | -- | enum: active/dissolved. |
| deletedAt | tsz | NULL | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

### `division_team_entries`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| divisionId* | uuid | -- | divisions.id (cascade) | -- |
| teamId* | uuid | -- | teams.id (cascade) | -- |
| entryStatus* | text | `'applied'` | -- | enum: applied/accepted/withdrawn/disqualified. |
| seedHint | int | NULL | -- | -- |
| joinedAt* | tsz | now() | -- | -- |
| leftAt | tsz | NULL | -- | -- |
| metadata* | jsonb | `'{}'` | -- | -- |
| createdAt* | tsz | now() | -- | -- |

Unique: `(divisionId, teamId)`.

## 3.4 Roster (`roster.ts`)

### `roster_moves`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| teamId* | uuid | -- | teams.id (cascade) | -- |
| personId* | uuid | -- | persons.id (cascade) | -- |
| seasonId* | uuid | -- | seasons.id (cascade) | -- |
| moveType* | text | -- | -- | enum: add/drop/trade_in/trade_out/call_up/send_down/release/reinstate. |
| membershipType* | text | `'primary'` | -- | enum: primary/play_up/affiliate/call_up. |
| effectiveAt* | tsz | now() | -- | -- |
| effectiveTo | tsz | NULL | -- | -- |
| jerseyNumber | smallint | NULL | -- | -- |
| positionCode | text | NULL | -- | -- |
| reason | text | NULL | -- | -- |
| sourceEventId | text | NULL | -- | Idempotency. Unique where not null. |
| createdByUserId | uuid | NULL | auth.users.id (set null) | -- |
| metadata* | jsonb | `'{}'` | -- | -- |
| createdAt* | tsz | now() | -- | -- |

### `team_memberships`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| teamId*, personId*, seasonId* | uuid | -- | teams/persons/seasons.id (cascade) | -- |
| membershipType* | text | `'primary'` | -- | enum same as roster_moves. |
| effectiveFrom* | tsz | -- | -- | -- |
| effectiveTo | tsz | NULL | -- | NULL = current. |
| jerseyNumber | smallint | NULL | -- | -- |
| positionCode | text | NULL | -- | -- |
| currentStatus* | text | `'active'` | -- | enum: active/released/suspended/ineligible. |
| lastMoveId | uuid | NULL | roster_moves.id (set null) | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

Unique: `(teamId, personId, seasonId) WHERE effectiveTo IS NULL`. Jersey unique per team/season while active.

## 3.5 Game (`game.ts`, `game-officials.ts`)

### `games`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| leagueId* | uuid | -- | leagues.id (cascade) | -- |
| divisionId | uuid | NULL | divisions.id (set null) | -- |
| homeTeamId*, awayTeamId* | uuid | -- | teams.id (cascade) | home != away. |
| sportCode* | text | -- | sports.code | -- |
| scheduledStartTsUtc* | tsz | -- | -- | -- |
| tz* | text | `'UTC'` | -- | -- |
| durationMin* | smallint | 60 | -- | -- |
| venueName, surfaceLabel | text | NULL | -- | -- |
| status* | text | `'scheduled'` | -- | enum: scheduled/in_play/completed/postponed/cancelled/forfeited. |
| homeScore*, awayScore* | smallint | 0 | -- | -- |
| period* | smallint | 0 | -- | -- |
| metadata* | jsonb | `'{}'` | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |
| finalizedAt | tsz | NULL | -- | -- |
| finalizedByUserId | uuid | NULL | auth.users.id (set null) | -- |

### `game_events`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| gameId* | uuid | -- | games.id (cascade) | -- |
| sportCode* | text | -- | sports.code | -- |
| eventType* | text | -- | -- | Sport-specific (`goal`, `penalty`, `start_period`, ...). |
| tsUtc* | tsz | now() | -- | -- |
| period | smallint | NULL | -- | -- |
| clockRemainingSec | int | NULL | -- | -- |
| teamId | uuid | NULL | teams.id (set null) | -- |
| primaryPersonId | uuid | NULL | persons.id (set null) | -- |
| secondaryPersonIds* | jsonb | `'[]'` | -- | Assists etc. |
| attributes* | jsonb | `'{}'` | -- | -- |
| source* | text | `'scorekeeper_app'` | -- | enum: scorekeeper_app/ref_amend/video_review/import/system. |
| sourceDeviceId, idempotencyKey | text | NULL | -- | idempotencyKey unique. |
| correctionOfEventId | uuid | NULL | self (set null) | -- |
| loggedByUserId | uuid | NULL | auth.users.id (set null) | -- |
| createdAt* | tsz | now() | -- | -- |

### `game_attendance`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| gameId*, personId*, teamId* | uuid | -- | games/persons/teams (cascade) | -- |
| status* | text | `'present'` | -- | enum: present/absent/late/sub/scratched. |
| jerseyNumberUsed | smallint | NULL | -- | -- |
| positionPlayed | text | NULL | -- | -- |
| minutesPlayed | int | NULL | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

Unique: `(gameId, personId)`.

### `suspensions`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| personId* | uuid | -- | persons.id (cascade) | -- |
| sourceEventId | uuid | NULL | game_events.id (set null) | -- |
| kind* | text | -- | -- | enum: n_games/n_days/indefinite/time_bounded. |
| nGames, nDays | smallint | NULL | -- | -- |
| servedCount* | smallint | 0 | -- | -- |
| status* | text | `'active'` | -- | enum: active/served/lifted/appealed. |
| reason | text | NULL | -- | -- |
| startAt* | tsz | now() | -- | -- |
| endAt | tsz | NULL | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |
| issuedByUserId | uuid | NULL | auth.users.id (set null) | -- |

### `scoresheet_signatures`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| gameId* | uuid | -- | games.id (cascade) | -- |
| signerUserId* | uuid | -- | auth.users.id (cascade) | -- |
| role* | text | -- | -- | enum: home_coach/away_coach/head_ref/linesman/scorekeeper/timekeeper. |
| signedAt* | tsz | now() | -- | -- |
| ipAddr | inet | NULL | -- | -- |
| userAgent | text | NULL | -- | -- |
| signatureBlobUrl | text | NULL | -- | -- |
| digestHash* | text | -- | -- | SHA-256 of scoresheet. |
| createdAt* | tsz | now() | -- | -- |

Unique: `(gameId, signerUserId, role)`.

### `game_officials`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| gameId*, personId* | uuid | -- | games/persons (cascade) | -- |
| role* | text | -- | -- | referee/linesman/scorekeeper/timekeeper/video_review/commissioner/other. |
| slot | text | NULL | -- | `head`/`linesman_1`. |
| status* | text | `'confirmed'` | -- | enum: confirmed/tentative/declined. |
| assignedByUserId | uuid | NULL | auth.users.id (set null) | -- |
| notes | text | NULL | -- | -- |
| revokedAt | tsz | NULL | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

Unique active: `(gameId, role, slot, personId) WHERE revokedAt IS NULL`.

## 3.6 Stats (`stats.ts`)

### `stat_lines`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| gameId*, personId*, teamId* | uuid | -- | games/persons/teams (cascade) | -- |
| sportCode* | text | -- | sports.code | -- |
| seasonId, leagueId, divisionId | uuid | NULL | seasons/leagues/divisions (set null) | Historical context. |
| gpIncrement* | smallint | 1 | -- | 0 for DNP. |
| minutesPlayed | int | NULL | -- | -- |
| core* | jsonb | `'{}'` | -- | G/A/P/PIM/+/-... |
| extended* | jsonb | `'{}'` | -- | Goalie / advanced. |
| derivedAt* | tsz | now() | -- | -- |
| createdAt* | tsz | now() | -- | -- |

Unique: `(gameId, personId)`.

### `standings`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| leagueId* | uuid | -- | leagues.id (cascade) | -- |
| divisionId | uuid | NULL | divisions.id (cascade) | -- |
| teamId* | uuid | -- | teams.id (cascade) | -- |
| gp*, w*, l*, t*, otl* | smallint | 0 | -- | -- |
| points* | smallint | 0 | -- | -- |
| gf*, ga*, gd* | smallint | 0 | -- | -- |
| rank | smallint | NULL | -- | -- |
| tiebreakers* | jsonb | `'{}'` | -- | RPI / SOS / etc. |
| derivedAt* | tsz | now() | -- | -- |

Unique: `(leagueId, divisionId, teamId)`.

### `leaderboards`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| scopeType* | text | -- | -- | `season`/`league`/`division`. |
| scopeId | uuid | NULL | -- | -- |
| metric* | text | -- | -- | `goals`/`assists`/`points`. |
| windowKind* | text | `'season'` | -- | -- |
| sportCode* | text | -- | sports.code | -- |
| entries* | jsonb | `'[]'` | -- | Top-N. |
| rankedAt* | tsz | now() | -- | -- |

Unique: `(scopeType, scopeId, metric, windowKind)`.

## 3.7 Registration v1 (`registration.ts`)

### `registration_forms`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| orgId* | uuid | -- | orgs.id (cascade) | -- |
| scope* | text | -- | -- | enum: org/league/division. |
| scopeId | uuid | NULL | -- | League/division id depending on scope. |
| name* | text | -- | -- | -- |
| nameTranslations* | jsonb | `'{}'` | -- | -- |
| description | text | NULL | -- | -- |
| purpose* | text | `'season_registration'` | -- | enum: season_registration/role_profile/team_application/custom. |
| appliesToRoles* | text[] | `'{}'` | -- | Empty = all. GIN-indexed. |
| activeVersionId | uuid | NULL | -- | -- |
| deletedAt | tsz | NULL | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

### `registration_form_versions`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| formId* | uuid | -- | registration_forms.id (cascade) | -- |
| versionNumber* | int | -- | -- | -- |
| schema* | jsonb | `'{}'` | -- | Field defs + validation. |
| publishedAt | tsz | NULL | -- | -- |
| locked* | bool | false | -- | -- |
| createdAt* | tsz | now() | -- | -- |

Unique: `(formId, versionNumber)`.

### `registrations`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| idempotencyKey* | text | -- | -- | Unique. |
| orgId* | uuid | -- | orgs.id (cascade) | -- |
| formVersionId* | uuid | -- | registration_form_versions.id (restrict) | -- |
| submittedByUserId | uuid | NULL | auth.users.id (set null) | -- |
| subjectPersonId* | uuid | -- | persons.id (cascade) | -- |
| status* | text | `'draft'` | -- | enum: draft/pending_verification/pending_consent/pending_payment/pending_offline/pending_review/incomplete/approved/rejected/cancelled/submitted/under_review/waitlisted/withdrawn (v1 + v2 union). |
| leagueId, divisionId, teamId | uuid | NULL | leagues/divisions/teams (set null) | -- |
| submittedAt, reviewedAt | tsz | NULL | -- | -- |
| reviewedByUserId | uuid | NULL | auth.users.id (set null) | -- |
| decisionReason | text | NULL | -- | -- |
| metadata* | jsonb | `'{}'` | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

### `registration_items`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| registrationId* | uuid | -- | registrations.id (cascade) | -- |
| fieldKey* | text | -- | -- | -- |
| value* | jsonb | -- | -- | Submitted value. |
| encrypted* | bool | false | -- | Sensitive flag. |
| createdAt* | tsz | now() | -- | -- |

Unique: `(registrationId, fieldKey)`.

### `documents`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| orgId | uuid | NULL | orgs.id (cascade) | NULL = platform default. |
| kind* | text | -- | -- | enum: waiver/consent/code_of_conduct/privacy/parental/media_release/injury_policy/custom. |
| name*, description | text | -- | -- | -- |
| activeVersionId | uuid | NULL | -- | -- |
| deletedAt | tsz | NULL | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

### `document_versions`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| documentId* | uuid | -- | documents.id (cascade) | -- |
| versionNumber* | int | -- | -- | -- |
| contentHtml* | text | -- | -- | -- |
| contentHash* | text | -- | -- | SHA-256. |
| languageCode* | text | `'en-US'` | -- | -- |
| jurisdictionCountryCode | char(2) | NULL | countries.code | -- |
| effectiveFrom* | tsz | now() | -- | -- |
| supersededAt | tsz | NULL | -- | -- |
| createdAt* | tsz | now() | -- | -- |

Unique: `(documentId, versionNumber)`.

### `consent_signatures`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| personId* | uuid | -- | persons.id (cascade) | -- |
| documentVersionId* | uuid | -- | document_versions.id (restrict) | -- |
| signedAt* | tsz | now() | -- | -- |
| ipAddr | inet | NULL | -- | -- |
| userAgent | text | NULL | -- | -- |
| signedByUserId | uuid | NULL | auth.users.id (set null) | -- |
| geolocation | jsonb | NULL | -- | -- |
| signatureBlobUrl | text | NULL | -- | -- |
| revokedAt | tsz | NULL | -- | -- |
| revokedReason | text | NULL | -- | -- |
| createdAt* | tsz | now() | -- | -- |

Unique: `(personId, documentVersionId)`.

### `eligibility_records`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| personId* | uuid | -- | persons.id (cascade) | -- |
| seasonId | uuid | NULL | seasons.id (cascade) | -- |
| governingBodyId | uuid | NULL | governing_bodies.id (set null) | -- |
| ruleEvaluation* | jsonb | `'{}'` | -- | -- |
| status* | text | `'pending'` | -- | enum: pending/eligible/ineligible/expired/waived. |
| waiverReason | text | NULL | -- | -- |
| effectiveFrom* | tsz | now() | -- | -- |
| effectiveTo | tsz | NULL | -- | -- |
| evaluatedAt* | tsz | now() | -- | -- |
| evaluatedByUserId | uuid | NULL | auth.users.id (set null) | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

## 3.8 Registration v2 (`registration-v2.ts`)

### `pricing_tiers`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| seasonId* | uuid | -- | seasons.id (cascade) | -- |
| name* | text | -- | -- | -- |
| code | text | NULL | -- | Unique per season. |
| description | text | NULL | -- | -- |
| divisionId | uuid | NULL | divisions.id (set null) | -- |
| currency* | text | `'USD'` | -- | -- |
| fullPriceCents* | int | -- | -- | >= 0. |
| isFree* | bool | false | -- | -- |
| paymentPlanEnabled* | bool | false | -- | -- |
| depositCents* | int | 0 | -- | 0..fullPriceCents. |
| installmentCount* | int | 0 | -- | -- |
| installmentIntervalDays* | int | 30 | -- | -- |
| lateFeeCents* | int | 0 | -- | -- |
| usageLimit | int | NULL | -- | -- |
| usageCount* | int | 0 | -- | -- |
| customUrlSlug | text | NULL | -- | Unique per season. |
| isReturningTeamPricing* | bool | false | -- | -- |
| isActive* | bool | true | -- | -- |
| metadata* | jsonb | `'{}'` | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

### `installment_schedules`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| invoiceId* | uuid | -- | invoices.id (cascade) | -- |
| installmentNumber* | int | -- | -- | 0 = deposit. |
| dueDate* | tsz | -- | -- | -- |
| amountCents* | int | -- | -- | -- |
| status* | text | `'scheduled'` | -- | enum: scheduled/charging/succeeded/failed/refunded/cancelled. |
| stripePaymentIntentId | text | NULL | -- | -- |
| lastErrorMessage | text | NULL | -- | -- |
| attemptCount* | int | 0 | -- | -- |
| chargedAt | tsz | NULL | -- | -- |
| metadata* | jsonb | `'{}'` | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

Unique: `(invoiceId, installmentNumber)`.

### `email_templates`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| seasonId* | uuid | -- | seasons.id (cascade) | -- |
| eventType* | text | -- | -- | enum: on_payment/on_approved/on_rejected/installment_reminder/season_closing/parental_consent/custom. |
| registrationTypeFilter* | text | `'all'` | -- | enum: all/team/individual. |
| subject*, bodyHtml* | text | -- | -- | -- |
| attachmentPath | text | NULL | -- | -- |
| isActive* | bool | true | -- | -- |
| metadata* | jsonb | `'{}'` | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

Unique active: `(seasonId, eventType, registrationTypeFilter) WHERE isActive`.

### `team_invites`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| teamId* | uuid | -- | teams.id (cascade) | -- |
| seasonId* | uuid | -- | seasons.id (cascade) | -- |
| issuedByUserId | uuid | NULL | auth.users.id (set null) | -- |
| inviteeEmail | text | NULL | -- | -- |
| token* | text | -- | -- | 32-byte base64url. Unique. |
| kind* | text | `'personal'` | -- | enum: personal/generic. |
| expiresAt | tsz | NULL | -- | -- |
| status* | text | `'pending'` | -- | enum: pending/accepted/declined/expired/revoked. |
| acceptedByUserId | uuid | NULL | auth.users.id (set null) | -- |
| acceptedAt, revokedAt, lastSentAt | tsz | NULL | -- | -- |
| sendCount* | int | 1 | -- | Throttle. |
| metadata* | jsonb | `'{}'` | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

### `free_agent_pool_entries`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| playerPersonId* | uuid | -- | persons.id (cascade) | -- |
| seasonId* | uuid | -- | seasons.id (cascade) | -- |
| positions* | text[] | -- | -- | Ordered by preference. |
| availability* | jsonb | `'{}'` | -- | -- |
| levelPrimary* | text | -- | -- | enum: A/B/C/D. |
| levelFlexibility | text[] | NULL | -- | -- |
| note | text | NULL | -- | Captain-visible. |
| noShowRate | text | NULL | -- | Cached. |
| status* | text | `'active'` | -- | enum: active/placed/withdrawn. |
| placedTeamId | uuid | NULL | teams.id (set null) | -- |
| placedAt | tsz | NULL | -- | -- |
| metadata* | jsonb | `'{}'` | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

Unique: `(playerPersonId, seasonId)`.

## 3.9 Finance (`finance.ts`)

### `fee_schedules`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| orgId* | uuid | -- | orgs.id (cascade) | -- |
| name*, description | text | -- | -- | -- |
| kind* | text | `'registration'` | -- | enum: registration/division/tournament/sponsorship/other. |
| code | text | NULL | -- | Unique per org. |
| currency* | text | `'USD'` | -- | -- |
| baseAmountCents* | int | 0 | -- | -- |
| dueOffsetDays* | int | 14 | -- | -- |
| lateFeeCents* | int | 0 | -- | -- |
| seasonId, leagueId, divisionId | uuid | NULL | seasons/leagues/divisions (set null) | -- |
| isActive* | bool | true | -- | -- |
| metadata* | jsonb | `'{}'` | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

### `invoices`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| orgId* | uuid | -- | orgs.id (cascade) | -- |
| invoiceNumber* | text | -- | -- | Unique per org. |
| registrationId | uuid | NULL | registrations.id (set null) | -- |
| recipientPersonId | uuid | NULL | persons.id (set null) | -- |
| recipientEmail | text | NULL | -- | -- |
| currency* | text | `'USD'` | -- | -- |
| subtotalCents*, taxCents*, discountCents*, totalCents*, paidCents* | int | 0 | -- | -- |
| status* | text | `'draft'` | -- | enum: draft/sent/paid/partial/overdue/void. |
| issuedAt, dueAt, paidAt | tsz | NULL | -- | -- |
| notes | text | NULL | -- | -- |
| idempotencyKey | text | NULL | -- | Unique. |
| metadata* | jsonb | `'{}'` | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

### `invoice_items`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| invoiceId* | uuid | -- | invoices.id (cascade) | -- |
| kind* | text | `'registration_fee'` | -- | enum: registration_fee/jersey/equipment/late_fee/discount/other. |
| description* | text | -- | -- | -- |
| quantity* | int | 1 | -- | -- |
| unitAmountCents*, amountCents* | int | -- | -- | -- |
| feeScheduleId | uuid | NULL | fee_schedules.id (set null) | -- |
| metadata* | jsonb | `'{}'` | -- | -- |
| createdAt* | tsz | now() | -- | -- |

### `payments`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| orgId* | uuid | -- | orgs.id (cascade) | -- |
| invoiceId* | uuid | -- | invoices.id (cascade) | -- |
| amountCents* | int | -- | -- | -- |
| currency* | text | `'USD'` | -- | -- |
| method* | text | `'manual'` | -- | enum: cash/check/credit_card/etransfer/bank_transfer/manual/refund. |
| status* | text | `'succeeded'` | -- | enum: pending/succeeded/failed/refunded. |
| receivedAt* | tsz | now() | -- | -- |
| externalProviderId | text | NULL | -- | Unique. Stripe charge id. |
| recordedByUserId | uuid | NULL | auth.users.id (set null) | -- |
| notes | text | NULL | -- | -- |
| metadata* | jsonb | `'{}'` | -- | -- |
| createdAt* | tsz | now() | -- | -- |

## 3.10 Notifications (`notifications.ts`)

### `notification_templates`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| orgId | uuid | NULL | orgs.id (cascade) | NULL = platform default. |
| code* | text | -- | -- | -- |
| channel* | text | -- | -- | enum: email/sms/in_app. |
| locale* | text | `'en'` | -- | -- |
| subject | text | NULL | -- | -- |
| bodyTemplate* | text | -- | -- | Variable interpolation. |
| variables* | jsonb | `'[]'` | -- | -- |
| isActive* | bool | true | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

Unique: `(orgId, code, channel, locale)`.

### `notifications`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| orgId | uuid | NULL | orgs.id (set null) | -- |
| idempotencyKey* | text | -- | -- | Unique. |
| templateCode* | text | -- | -- | -- |
| channel* | text | -- | -- | -- |
| subject | text | NULL | -- | -- |
| body* | text | -- | -- | Rendered. |
| recipientPersonId | uuid | NULL | persons.id (set null) | -- |
| recipientEmail | text | NULL | -- | -- |
| payload* | jsonb | `'{}'` | -- | Original render input. |
| status* | text | `'queued'` | -- | enum: queued/sending/sent/failed/suppressed. |
| attemptCount* | int | 0 | -- | -- |
| lastError | text | NULL | -- | -- |
| sentAt, readAt | tsz | NULL | -- | -- |
| sourceEvent | text | NULL | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

### `notification_delivery_logs`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| notificationId* | uuid | -- | notifications.id (cascade) | -- |
| provider* | text | `'console'` | -- | sendgrid/twilio/console. |
| providerMessageId | text | NULL | -- | -- |
| status* | text | -- | -- | sent/failed/bounced/suppressed. |
| statusCode | int | NULL | -- | -- |
| response* | jsonb | `'{}'` | -- | -- |
| attemptedAt* | tsz | now() | -- | -- |

## 3.11 Audit (`audit.ts`)

### `audit_events`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| tsUtc* | tsz | now() | -- | -- |
| orgId | uuid | NULL | orgs.id (set null) | -- |
| actorUserId | uuid | NULL | auth.users.id (set null) | -- |
| onBehalfOfUserId | uuid | NULL | auth.users.id (set null) | Delegation. |
| action* | text | -- | -- | `<resource>.<verb>`. |
| resourceType* | text | -- | -- | -- |
| resourceId | uuid | NULL | -- | -- |
| before, after | jsonb | NULL | -- | Diff. |
| ipAddr | inet | NULL | -- | -- |
| userAgent | text | NULL | -- | -- |
| requestId | text | NULL | -- | -- |
| retentionClass* | text | `'default'` | -- | enum: default/financial/legal_hold. |
| createdAt* | tsz | now() | -- | -- |

## 3.12 Admin (`admin.ts`)

### `system_settings`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| key* | text | -- | -- | Unique. |
| category* | text | `'general'` | -- | -- |
| value* | jsonb | -- | -- | -- |
| description | text | NULL | -- | -- |
| isEditable* | bool | true | -- | -- |
| updatedByUserId | uuid | NULL | auth.users.id (set null) | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

### `feature_flags`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| key* | text | -- | -- | Unique. |
| description | text | NULL | -- | -- |
| isEnabled* | bool | false | -- | -- |
| rolloutPct* | text | `'0'` | -- | 0..100, evaluated against actor hash. |
| orgAllowlist* | jsonb | `'[]'` | -- | Empty = all. |
| variants* | jsonb | `'[]'` | -- | -- |
| updatedByUserId | uuid | NULL | auth.users.id (set null) | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

## 3.13 Migrations (`migrations.ts`)

### `import_jobs`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| orgId | uuid | NULL | orgs.id (set null) | -- |
| entityKind* | text | -- | -- | enum: persons/teams/registrations/rosters/games. |
| sourceFilename, sourcePreview | text | NULL | -- | -- |
| fieldMapping* | jsonb | `'{}'` | -- | -- |
| status* | text | `'pending'` | -- | enum: pending/running/succeeded/failed/partial/cancelled. |
| totalRows*, processedRows*, successRows*, failedRows* | int | 0 | -- | -- |
| error | text | NULL | -- | -- |
| submittedByUserId | uuid | NULL | auth.users.id (set null) | -- |
| startedAt, finishedAt | tsz | NULL | -- | -- |
| createdAt*, updatedAt* | tsz | now() | -- | -- |

### `import_job_rows`
| Column | Type | Default | FK | Notes |
|---|---|---|---|---|
| id* | uuid | gen | -- | -- |
| jobId* | uuid | -- | import_jobs.id (cascade) | -- |
| rowNumber* | int | -- | -- | -- |
| raw* | jsonb | -- | -- | -- |
| status* | text | -- | -- | enum: ok/failed/skipped. |
| error | text | NULL | -- | -- |
| createdEntityId | uuid | NULL | -- | -- |
| createdAt* | tsz | now() | -- | -- |

---

# §4. Web app inventory

## 4.1 superadmin-web (the god app)

**Audience.** Platform staff with `profiles.is_super_admin = true`.

**Auth gating.** `(admin)/layout.tsx` runs a Supabase session fetch + a `profiles` lookup; non-super-admin sessions redirect to `/sign-in?error=not_authorized`. Public paths: `/sign-in`, `/sign-up`, `/registration/[id]` (the public funnel mounted here for parity), `/auth/callback`.

**Routes.**
- `(admin)/` -- Overview / KPI dashboard.
- `(admin)/organizations`, `/organizations/[id]` -- create, brand, link parents, suspend.
- `(admin)/users`, `/users/[id]` -- list, edit profile, manage role assignments, edit role-specific JSONB profile.
- `(admin)/persons`, `/persons/[id]` -- non-user persons.
- `(admin)/roles` -- system + custom roles.
- `(admin)/leagues`, `/seasons`, `/divisions`, `/teams`, `/memberships` -- league hierarchy CRUD.
- `(admin)/forms`, `/forms/[id]`, `/forms/[id]/setup` -- form builder + per-season tabbed registration setup (v2).
- `(admin)/documents`, `/documents/[id]` -- waiver / consent / privacy.
- `(admin)/registrations`, `/registrations/[id]` -- review queue + detail.
- `(admin)/eligibility` -- compliance records.
- `(admin)/games`, `/games/[id]`, `/game-events` -- schedule, transition, append events.
- `(admin)/stats` -- viewer + recompute.
- `(admin)/finance`, `/finance/[id]` -- AR view, manual payments.
- `(admin)/communications` -- outbox + flush.
- `(admin)/reports` -- CSV exports.
- `(admin)/data-migration` -- CSV import wizard.
- `(admin)/audit`, `/audit/[id]` -- platform-wide audit log.
- `(admin)/admin` -- settings, flags, sports, health.
- `(public)/registration/[id]` -- public funnel mount (mirrors player-web).

**Navigation** (`Sidebar.tsx`): Platform tier (Overview, Organizations, Users, Persons, Roles, Audit, Admin Console). League tier (Seasons, Leagues, Divisions, Teams, Memberships, Registrations, Forms, Documents, Eligibility, Games, Game Events, Stats, Finance, Communications, Reports, Data Migration).

## 4.2 league-admin-web

**Audience.** Users with `league_admin` role assignments scoped to one or more leagues. Super-admin bypasses.

**Auth gating.** Middleware: `requireRole(['league_admin'])`; onboarding wizard at `/onboarding` if profile incomplete.

**Routes.** `(admin)/` (dashboard), `/my-leagues`, `/divisions`, `/teams`, `/rosters`, `/games`, `/standings`, `/audit`. `(auth)/sign-in`, `/sign-up`, `/onboarding`.

**Notable features.** Read-mostly views scoped to assigned leagues; standings + audit trail.

## 4.3 org-admin-web

**Audience.** Users with `org_admin` scope on one or more orgs.

**Auth gating.** Middleware: `requireRole(['org_admin'])`; onboarding at `/onboarding`.

**Routes.** `(app)/` (dashboard), `/leagues`, `/seasons`, `/divisions`, `/teams`, `/registrations`, `/forms`, `/finance`. `(auth)/sign-in`, `/sign-up`, `/onboarding`.

**Notable features.** Org-scoped CRUD on hierarchy; revenue / cost view; org's registration submissions; org's forms.

## 4.4 team-admin-web

**Audience.** Users with `team_admin` or `coach` role on a team.

**Auth gating.** Middleware: `requireRole(['team_admin', 'coach'])`; onboarding at `/onboarding`.

**Routes.** `(app)/` (dashboard), `/roster`, `/schedule`, `/lineups`, `/stats`, `/communications`. Captain console (when `isCaptain`): `/captain/manage-team`, `/captain/manage-roster`, `/captain/invites`, `/captain/free-agents`. `(auth)/sign-in`, `/sign-up`, `/onboarding`.

**Notable features.** Add/drop within own team; pre-game lineup builder; team comms placeholder.

## 4.5 player-web

**Audience.** Players, parents, free agents. Captains see an extra console.

**Auth gating.** Middleware: `requireRole(['player', 'free_agent'])`; anonymous `/register/[id]` path is public for the registration v2 funnel. Onboarding at `/onboarding`.

**Routes.**
- `(app)/` (Home).
- My Game: `/schedule`, `/stats`, `/video`.
- My Team: `/team`.
- My Account: `/payments`, `/compliance`, `/notifications`.
- Captain Console (conditional): `/captain/manage-team`, `/manage-roster`, `/invites`, `/free-agents`.
- Discover: `/find-team`, `/profile`.
- Self-serve: `/registrations`, `/profile`, `/register`.
- `(auth)/sign-in`, `/sign-up`, `/onboarding`, `/register/[id]` (public).

**Notable features.** iCal export on schedule; selectable stat scope (career / season / playoffs); compliance doc viewer; captain console gates on `role_codes` containing `captain`.

## 4.6 landing-web

**Audience.** Public.

**Routes.** `/` -- single hero + sections page (logistics, subscription, revenue share, org features, intelligence, contact, CTA, ticker).

---

# §5. Proposing a change

When proposing a new feature, view, or schema change, structure the proposal as:

1. **What flow does this affect?** (Walk it as super_admin / new user / multi-role user / no-profile user. -- per CLAUDE.md cardinal.)
2. **Which existing primitives does it extend?** (Cite §2 modules, §3 tables, §4 routes. If you can't find one, say so explicitly so we can decide whether to introduce a new module / table / app.)
3. **Schema impact.** Reference the table(s) in §3. Stick to **additive** migrations (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN ... DEFAULT ...`); no destructive ALTERs without a migration plan.
4. **API surface.** New endpoint? Specify its module (§2.x), guards (`SuperAdmin` / `AuthorizedAccess` / `RolesGuard + @Scope`), and audit action label.
5. **Web surface.** Which app does it land in first? **Default: superadmin-web.** Other apps inherit by role gating (per CLAUDE.md cardinal: god-app first, role-filtered views second).
6. **Permissions.** Which role codes / scope types? If a new role is needed, propose its `roles.code` and where in the hierarchy it sits.
7. **Audit.** Auto-captured by the global interceptor; just confirm the action label.
8. **Notifications.** If the change emits user-facing events, list the template `code` + `channel` you intend to add.
9. **Backwards compatibility.** Note any deprecations and the bridge plan (e.g. "registration v1 forms keep working until X migration").

A change that touches schema + API + web + nav usually warrants an entry under `doc/specs/` describing it before code lands.
