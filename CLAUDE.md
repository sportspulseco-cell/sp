# SportsPulse — agent rules

This file is loaded by Claude Code (and any agent that reads it) before
acting in this repo. Read it once per session; the rules apply to every
change.

## Cardinal rule — design thinking before code

> "You are not at all thinking things through. Plan out things and create
> a proper claude rule, so that you don't do these wrong choices."
> — repo owner, 2026-05-09

**Before writing UI code, walk the flow end-to-end as the user.** State
the entry point, every choice, every default value, every exit. If you
can't narrate this in plain English, you don't understand the feature yet
and your code will ship the misunderstanding.

The bugs that triggered this rule:
- "Edit role profile" on a super_admin user opened the player form
  (because the dialog defaulted to `"player"` when no scoped role was
  found — but super_admin status lives on `profile.isSuperAdmin`, not
  in role assignments).
- "Change user type" dropdown defaulted to **coach** for a super_admin
  (alphabetic sort, no awareness of the user's actual current role).
- "Invite user" had no path to set up the user's profile in the same
  flow — admin had to invite, find the user, click Roles, click
  Edit profile. Five clicks where one should do.

### Concrete checklist before merging any new dialog / form / dropdown

1. **Walk the flow.** Open the feature in your head. As a super_admin.
   As a brand-new user with zero roles. As someone holding five roles.
   If any of those experiences is broken, fix it before shipping.
2. **Defaults must reflect context.** A dropdown shown on a super_admin
   row defaults to super_admin. An "Edit profile" dialog opened from a
   coach row defaults to the coach profile. Never alphabetic-first,
   never `array[0]`.
3. **Connected actions belong in connected dialogs.** Inviting a user
   often means setting up their profile. Creating a team often means
   assigning a captain. Build one flow, not two visits.
4. **Empty states beat wrong defaults.** If the right default is
   unclear, render an empty state with a clear next step. Never guess
   and pick the alphabetically-first option.
5. **Test the unhappy-path users.** super_admin with no scoped roles.
   user with no profile. user holding 5 roles. user with revoked
   roles. If any of these crashes or shows nonsense, you missed step 1.

### When the spec gives you a field list, ship the whole list

If a spec doc enumerates required fields, the kernel/schema MUST
mirror that field set on first pass. A "thin sketch" that the spec
author has to call out twice is wasted work.

## Cardinal rule — reuse over silos

> "If you start building things in silos, then there will be huge issues."
> — repo owner, 2026-05-04

**Before writing anything new, find the existing equivalent and extend it.**
The codebase is a monorepo of 4 deployable apps + 5 shared packages. Parallel
re-implementations have already caused friction (multiple `<Skeleton>` sets,
permissions UX divergence, etc). The default answer to "should I add a new
component / endpoint / table?" is **"check what's already there first."**

## Superadmin is the god app

> "The functionality, the logic is reusable. Our goal is to make superadmin
> app the god app, then it's just a matter of roles, which will have certain
> permissions." — repo owner, 2026-05-04

**`apps/superadmin-web` ships every feature.** Other web surfaces
(`league-admin-web`, future `team-admin-web`, future `player-portal`,
referee app, scorekeeper app, parent portal, etc.) are **role-filtered
views of the same underlying functionality** — never parallel
implementations. **Every app is just filtered-by-role** (repo owner,
2026-05-04).

- New features land in superadmin-web first. Other consoles inherit them by
  role gating, not by reimplementation.
- Logic shared across apps (form validation, state machines, formatters)
  belongs in `packages/kernel` or a shared UI package, not duplicated per app.
- A 90%-identical `<LeagueAdminSidebar>` sitting next to `<Sidebar>` is the
  silo problem in disguise. Factor it shared in the same PR.
- Long-term direction: `league-admin-web` may collapse into `superadmin-web`
  with a `mode=league_admin` flag. Design every new component so that
  collapse stays easy.

### Concrete reuse map (where the existing primitives live)

| Concern | Where it lives |
|---|---|
| UI components used in *both* web apps (Skeleton, Eyebrow, Section, Logo, NavProvider, IconTile, EmptyState, Badge, Button, Input, Table) | Each app has a copy under `apps/<app>/src/components/ui/` and `…/components/layout/`. **When you add or edit a primitive, update both apps in the same PR**, or factor into a shared `packages/ui` if scope justifies it. |
| Animation primitives (framer-motion wrappers, `<Reveal>`, ticker, etc.) | `apps/landing-web/src/components/ui/` |
| Auth primitives (JWT verifier, Supabase SSR/client wiring) | `packages/auth` |
| DB schema, types, repositories | `packages/db` (Drizzle source of truth) |
| Domain entities, value objects, kernel types (Result, Page, ID) | `packages/kernel` |
| Permission catalogue, role codes, scope types, audit action labels | **Must be sourced from a canonical file in `packages/kernel`** (e.g. `permissions.ts`, `roles.ts`) so API and UI never drift. |
| API SDK consumed by web apps | `apps/superadmin-web/src/lib/api/sdk.ts` (factory) + `server-api.ts` and `browser-api.ts` (bindings). League-admin app has its own thinner mirror at `apps/league-admin-web/src/lib/api/sdk.ts`. |
| API guards, decorators, scope helpers | `apps/superadmin-api/src/shared/auth/` (`AuthorizedAccessGuard`, `SuperAdminGuard`, `RolesGuard`, `@CurrentUser`, `@UserScope`, `loadUserScope`) |
| Audit interceptor (records every successful mutation) | `apps/superadmin-api/src/modules/audit/interface/audit.interceptor.ts` — global, do not reimplement |

### Anti-patterns to avoid

- **Don't** copy a component into `apps/<app>/src/components/_local/` because the existing one "is in the wrong app." Move it once, import everywhere.
- **Don't** add a permission string to a controller without adding it to the canonical catalogue.
- **Don't** introduce a second source of truth for role codes, scope types, registration submission states, audit action labels, etc.
- **Don't** add new validation / formatting helpers. Look in `packages/kernel/src/` first.

### Workflow when introducing something new

1. `Grep` the apps and packages for the closest existing thing. Treat 0 matches as suspicious.
2. If a primitive needs to live in both web apps, write it once in the canonical location and import. If both apps already have one, **converge them in the same PR** rather than diverging further.
3. Add new shared types/enums to `packages/kernel` or `packages/db`, never inline in app code.
4. When in doubt, **ask the user which existing primitive to extend** before introducing a new one.

## Repo map

```
apps/
  superadmin-api          NestJS · DDD · Drizzle · service-role bypass · audit interceptor
  superadmin-web          Next.js 15 · platform admin console
  league-admin-web        Next.js 15 · scoped read-only console (one or more leagues)
  landing-web             Next.js 15 · public marketing site, framer-motion
packages/
  auth                    Supabase JWT verifier, SSR helpers, web client factory
  db                      Drizzle schema (source of truth for the Postgres model)
  kernel                  Domain primitives: Result, Page, ID, value-object base, errors
doc/
  specs/                  Workflow + module specs (treat as the canonical contract)
  data-model.md           Live ER diagram + module map + RLS plan
```

## Deploy targets

| App | Vercel project | URL |
|---|---|---|
| API | `sp-api` | https://sp-api-one.vercel.app |
| Super-admin | `sp-superadmin` | https://sp-superadmin.vercel.app |
| League-admin | `sp-league-admin` | https://sp-league-admin.vercel.app |
| Org-admin | `sp-org-admin` | https://sp-org-admin.vercel.app |
| Player | `sp-player` | https://sp-player-red.vercel.app (sp-player.vercel.app was taken externally) |
| Team-admin | `sp-team-admin` | https://sp-team-admin.vercel.app |
| Landing | `sp-landing` | https://sp-landing-seven.vercel.app |

All Vercel projects live under team `sportspulseco-cells-projects`.

The three role-targeted apps (`org-admin-web`, `player-web`,
`team-admin-web`) each have **their own sign-in landing** (separate
Supabase session per app, per repo owner directive 2026-05-09) and
**their own role-gate middleware**. UI primitives come from
`@sportspulse/ui` — no per-app silos.

All four are linked to GitHub `main`. Pushes auto-deploy. Do not edit env
vars directly via the dashboard for changes a teammate also needs — adjust
`.env.example` and `vercel.json` so the contract stays in the repo.

## Database changes

- Drizzle is the source of truth. Add or edit tables in `packages/db/src/schema/*.ts`, then `pnpm --filter @sportspulse/db generate` to produce a migration in `packages/db/migrations/`.
- **Do not auto-apply migrations to production.** Either commit the SQL and let the user apply, or use `mcp__supabase__apply_migration` only after explicit confirmation.
- Migrations must be **additive and idempotent**: `CREATE TABLE IF NOT EXISTS`, `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$;` for FKs, etc. Never `DROP` or `ALTER ... NOT NULL` on a column with existing data without an explicit migration plan.

## Auth + scope contract

- Every request to `apps/superadmin-api` flows through `JwtAuthGuard` and one of: `SuperAdminGuard`, `AuthorizedAccessGuard`, or `RolesGuard + @Scope`. Pick the right one for new endpoints.
- `loadUserScope(db, userId)` projects role assignments → `{ leagueIds, orgIds }`. Use the `@UserScope()` param decorator in handlers and pass scope filters into repository queries — do not re-derive in every controller.
- For list endpoints, `null` from `loadUserScope` means **unrestricted**; non-null array means strict whitelist; empty array means deny.
- For findById / get-one endpoints, return **404** (not 403) when the resource is outside scope — never leak existence.

## Audit

- The global `AuditInterceptor` records every successful 2xx mutation. **Do not** add per-handler audit emits unless you need richer before/after diffs.
- Action labels follow `<resource>.<verb>` (`leagues.create`, `games.finalize`, etc.). Keep this convention.

## Cardinal rule — test like the testers test

> The repo owner records audio transcripts where they walk a real
> user flow end-to-end, on the deployed apps, signed in as the role
> being tested. Half-baked tests miss every bug they've reported.

Past bugs the testers caught that scripted unit tests + visual
QA missed:
- Registration funnel visited phases 1 → 2 → 4 → 5 → 3 → 6 because the
  inner `stepOrder` placed `questions` after `tier`; the **stepper
  rendered the numbers correctly** but the runtime order was wrong.
- Player completes the public registration funnel, sees the "admin
  will review" success screen, but the admin's ReviewQueue defaults
  to `pending_review` only — `pending_offline` rows were invisible.
- Player can log into the player dashboard but there's **no
  discoverable path** to any published form. Forms got published; no
  surface listed them for the player.
- Registration setup wizard step 1 forced the admin to **type the
  season name as free text** instead of picking from the seasons
  already created in org-setup. Downstream steps depend on the
  season; the typo silos them.
- A field renamed in code from `maxGuestPlayersPerGame` to **"max
  post-game players"** — domain term drift that the form-builder
  audience caught in seconds.
- Number fields shipped where the spec called for a **dropdown of
  enumerated options** (e.g. overtime length: sudden death | shootout
  | 5 min | 10 min) — bare `<input type="number">` is wrong.

### The 9 testing rules (each ties back to a real reported bug)

1. **Walk every flow end-to-end, signed in as the actual role.** Not
   as super_admin shortcut. The captain dashboard bugs only show when
   you're logged in as the captain. The player discovery bug only
   shows when logged in as the player.
2. **Cross-surface verification is mandatory.** When admin A creates
   a thing, navigate to player B's app and verify it surfaces there.
   When player C submits, navigate to admin D's queue and verify the
   row appears. **Never trust the success screen** — verify at the
   destination.
3. **Numbered stepper UIs must visit phases in the same order they
   display.** If the stepper shows `1 → 2 → 3 → 4 → 5 → 6`, the
   runtime must call setStep in that exact order. Test by opening
   devtools and watching the stepper highlight transitions.
4. **Pre-existing entities are dropdowns, never free-text inputs.**
   Seasons are created in org-setup → every season picker downstream
   is a dropdown of those rows, never a `<input type="text">`.
   Auto-populate dependent fields the moment the user picks.
5. **Labels must match the canonical domain term.** If the schema
   field is `maxGuestPlayersPerGame`, the UI label says "Max guest
   players per game" — verbatim. Don't paraphrase. Don't shorten.
   Drift here is silent-but-wrong.
6. **Spec field lists are contracts.** If a spec enumerates 7 fields,
   the form ships all 7 on first pass. A "thin sketch" missing 2 of
   them is wasted work — the tester will catch it immediately.
7. **Enum fields render as dropdowns of the enum, not free input.**
   Overtime length is "sudden death | shootout | 5 min | 10 min" —
   not a bare `type="number"`. Status, role, tier, gender, channel —
   all the same.
8. **Cross-step linkage:** if step N depends on step N-1, the picker
   in step N-1 must drive the data in step N. Don't make the user
   re-type. Don't make the user re-search.
9. **Test the unhappy paths every tester finds first.** Returning
   user who already has an account. Minor whose DOB triggers
   parental consent. Captain with no team. Player with no
   registration. Form that has no waivers configured. These are not
   edge cases — they are the first thing a tester hits.

### Playwright smoke-test recipe (when an MCP browser is available)

For every feature with a visible user-facing flow:

1. Navigate to the entry point as an unauthenticated visitor first
   (catches missing public surfaces — bug #3 above).
2. Sign in as the role being tested. Take a snapshot at the dashboard
   home — verify the entries the role should see exist.
3. Walk the happy path click-by-click. After each click, take a
   snapshot and assert the visible state matches the next expected
   step (catches stepper out-of-order — bug #1 above).
4. After the terminal action (submit, save, publish, approve), sign
   out and sign back in as the role on the **receiving side**.
   Navigate to that role's queue page. Assert the row appeared
   (catches invisible submissions — bug #2 above).
5. Run the same flow with a returning user and a minor user.
6. Diff every label and dropdown option against the canonical spec
   list (catches bugs #4, #5, #6, #7 above).

When real Playwright isn't available, use `chrome-devtools` MCP the
same way: `navigate_page` → `take_snapshot` → `click` → repeat.

### Bug log format

For every smoke test, write a bug log entry per finding:

```
[BUG-N] <feature> · <severity: blocker | major | minor>
  Surface: <admin / captain / player / public>
  Repro:
    1. ...
    2. ...
  Expected: ...
  Actual: ...
  File: <path:line where the fix likely lands>
```

Resolve each entry in the same commit or open a follow-up referencing
the bug id.
