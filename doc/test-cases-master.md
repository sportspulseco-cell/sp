# SportsPulse — Master Test Plan

Every flow across every app, end-to-end. The audit doc
([`flow-audit.md`](flow-audit.md)) says what exists; this doc says how
to verify it works. Use this as the canonical regression suite for any
release that touches multiple surfaces.

> **Cardinal rule** (from CLAUDE.md): walk every flow end-to-end **signed in
> as the actual role**, then cross-surface-verify on the other apps. Never
> trust a success screen — verify at the destination.

---

## How to use this doc

- Test IDs follow `TC-<section>-<num>`, e.g. `TC-A1-03`.
- **Severity** tags on each finding: `blocker / major / minor / cosmetic`.
- **Role** column = the role you sign in as to execute the test.
- Test cases marked **NEW** were added by the 2026-05 build sweep
  (Backlog #6/#11/#13/#15/#16/#17 + a few smaller fixes).
- For UI tests use Playwright / chrome-devtools MCP and follow the
  recipe at the bottom of CLAUDE.md (snapshot after every click).
- For API tests hit the deployed `sp-api` (or `localhost:4000`) with the
  user's Supabase JWT in `Authorization: Bearer …`.

### Test personas (set up once per env)

| Persona | Role(s) held | Used by |
|---|---|---|
| **alex@sp.test** | super_admin | All of Section A; smoke for everything else |
| **org@sp.test** | org_admin on Org-A | All of Section B/C/D/F/G/H/I (org-scoped) |
| **league@sp.test** | league_admin on League-X (in Org-A) | Section C/D scoped-write checks |
| **captain@sp.test** | captain on Team-1 (in Org-A) | Section F/G captain-side |
| **coach@sp.test** | coach on Team-1 | Negative tests: captain-only actions must 403 |
| **player1@sp.test** | player on Team-1 | Player surfaces |
| **freeagent@sp.test** | free_agent | Free-agent funnel |
| **referee@sp.test** | referee | (After referee app ships) |
| **scorekeeper@sp.test** | scorekeeper | (After scorekeeper app ships) |
| **parent@sp.test** | parent (no Supabase account) | Parental-consent portal |
| **minor.dob@sp.test** | player, DOB triggers consent | Minor flow |
| **fiveroles@sp.test** | super_admin + org_admin + captain + player + coach | Multi-role unhappy-path tests |
| **noroles@sp.test** | (no active assignments) | "Empty" state tests |
| **(anonymous)** | none | Public marketing, public registration funnel, parent portal |

Seed fixtures: `Org-A` (sports: hockey), one `League-X` under it, one `Season-S` open, two divisions (`A-Div`, `B-Div`), three teams (`Team-1`, `Team-2`, `Team-3`), one `Game-G` scheduled between Team-1 and Team-2 in 24h, one published registration form, one master invoice with sub-invoices for three players.

---

# 📊 EXECUTION TRACKER

Status legend:
- ⏳ Not run
- ▶️ In progress
- ✅ Pass
- ❌ Fail (open bug)
- 🔁 Fixed — re-verify
- ✅✅ Verified post-fix
- 🚫 Blocked (dependency)
- ⏭️ Skipped (out of session scope)

Live run started **2026-05-16** with the smoke-test credentials provided by the repo owner.

| TC | Status | Last run | Notes / Bug ref |
|---|---|---|---|
| TC-A1-01 Super-admin sign-in | ✅✅ | 2026-05-16 | Pass; BUG-001 re-verified on localhost (commit 5b47e8d) |
| TC-A1-02 Wrong password | ✅ | 2026-05-16 | Pass; inline "Invalid login credentials" alert renders |
| TC-A1-03 Wrong role | ✅✅ | 2026-05-16 | Pass post-fix; BUG-002 + BUG-003 fixed + verified on localhost |
| TC-A1-04 Sign-out clears every app | ✅✅ | 2026-05-16 | Pass; /sign-in?error=signed_out + banner on click |
| TC-A1-05/06/07 magic link / callback / session expiry | ⏭️ | 2026-05-16 | Skipped this run — magic link needs real inbox; session expiry needs JWT time-skip |
| TC-A2-01 Create an organization | ❌ | 2026-05-16 | Blocked by BUG-004 + BUG-005 — entire deployed API was returning 500 (FUNCTION_INVOCATION_FAILED). Fixed locally, re-test after redeploy. |
| _all others_ | 🚫 | — | Blocked behind sp-api redeploy |

## Bug log

### BUG-001 · Super-admin sign-in button label says "Send sign-in link" instead of "Sign in" · **minor UX**
- **TC:** TC-A1-01
- **Surface:** super-admin · /sign-in
- **Repro:**
  1. Visit `https://sp-superadmin.vercel.app/sign-in`
  2. Enter email + password
  3. Look at the submit button
- **Expected:** "Sign in" (or similar) because the form calls `signInWithPassword`.
- **Actual:** Button label reads "Send sign-in link", which implies a magic-link flow but the form actually submits the password.
- **File:** `apps/superadmin-web/src/components/auth/sign-in-form.tsx` line 115 — string replaced with "Sign in" (the `signInWithPassword` call wasn't touched).
- **Status:** ✅✅ Fixed in commit `5b47e8d` — verified on localhost:4001 (button reads "Sign in"). Pending push + deploy to sp-superadmin.vercel.app.

### BUG-002 · Wrong-role sign-in to super-admin app → redirect loop / blank dashboard · **major**
- **TC:** TC-A1-03
- **Surface:** super-admin · post-sign-in
- **Repro:**
  1. Visit `https://sp-superadmin.vercel.app/sign-in`
  2. Sign in as a user who is NOT super-admin (e.g. the org-admin smoke account)
  3. Observe the URL after Supabase auth completes
- **Expected:** Bounced to `/sign-in?error=wrong_role` with a banner + a sign-out CTA so the user can switch accounts.
- **Actual:** URL ends up at `/dashboard?error=not_authorized` with an empty page. The `(admin)` layout calls `redirect("/sign-in?error=not_authorized")`, the middleware sees a signed-in user heading to `/sign-in` and redirects back to `/dashboard`, looping until Next.js bails. User is stuck — no sign-out button visible.
- **Files:**
  - `apps/superadmin-web/src/middleware.ts` — skip the `/sign-in → /dashboard` redirect when an `error` query param is present.
  - `apps/superadmin-web/src/components/auth/sign-in-form.tsx` — when the user is signed in AND `?error=wrong_role|not_authorized`, render a "Currently signed in as X" panel with a Sign-out button instead of the empty sign-in form.
- **Status:** ✅✅ Fixed locally — verified on localhost:4001 (URL = `/sign-in?error=wrong_role`, banner renders, sign-out button works, signing out drops the session and the form returns to its default state).

### BUG-003 · Super-admin wrong-role error code inconsistent with the other three role apps · **minor consistency**
- **TC:** TC-A1-03
- **Surface:** super-admin · (admin) layout
- **Repro:** Compare the redirect target on super-admin (`?error=not_authorized`) vs the other three apps which all use `?error=wrong_role` (from `requireRole` in `@sportspulse/auth/web`).
- **Expected:** All four apps use the same `?error=wrong_role` token so testers and copy stay in lockstep.
- **Files:**
  - `apps/superadmin-web/src/app/(admin)/layout.tsx` — redirect now uses `?error=wrong_role`.
  - `apps/superadmin-web/src/components/auth/sign-in-form.tsx` — `ERROR_MESSAGES` now contains both `wrong_role` (canonical) and `not_authorized` (kept as alias for any stale links).
- **Status:** ✅✅ Fixed in same commit as BUG-002. Verified on localhost — URL post-bounce is `/sign-in?error=wrong_role`.

### BUG-004 · Deployed sp-api crashes on cold start — `Cannot access 'SetDivisionBodyDto' before initialization` · **blocker**
- **TC:** TC-A2-01 (and every other authenticated API call)
- **Surface:** sp-api · every `/api/*` endpoint
- **Repro:**
  1. `curl -i https://sp-api-one.vercel.app/api/health` (or any `/api/*`)
- **Expected:** 200 with health body.
- **Actual:** Vercel returns `FUNCTION_INVOCATION_FAILED`. The whole API is down.
- **Root cause:** In `apps/superadmin-api/src/modules/registration-compliance/interface/self-registrations.controller.ts`, the `@Body() body: SetDivisionBodyDto` decorator at line 319 references a class declared AFTER the controller (line 390). Classes are not hoisted, so the decorator evaluates against the class's temporal-dead-zone slot and throws a `ReferenceError` at module-load time → Nest can't start → Vercel function never returns a response.
- **Files:** `apps/superadmin-api/src/modules/registration-compliance/interface/self-registrations.controller.ts` — moved `class SetDivisionBodyDto` above the controller class.
- **Status:** ✅ Fixed locally. Confirmed via `pnpm --filter @sportspulse/superadmin-api build` + `node dist/main.js` — Nest now boots: "Nest application successfully started". Pending push + Vercel redeploy.

### BUG-005 · FinanceModule + RegistrationComplianceModule DI graphs broken · **blocker**
- **TC:** TC-A2-01 (revealed during sp-api boot after fixing BUG-004)
- **Surface:** sp-api boot
- **Repro:** Boot the API locally (`pnpm --filter @sportspulse/superadmin-api start:dev`).
- **Expected:** Nest application successfully started.
- **Actual:**
  - `PlayerPaymentsController` injects `NotificationService` but `FinanceModule` didn't import `CommunicationsModule`.
  - `ComplianceCronController` injects `ComplianceSweepsController` but `ComplianceSweepsController` was only registered as a `controller`, not a `provider`, so Nest can't resolve it.
- **Files:**
  - `apps/superadmin-api/src/modules/finance/finance.module.ts` — added `imports: [CommunicationsModule]`.
  - `apps/superadmin-api/src/modules/registration-compliance/registration-compliance.module.ts` — added `ComplianceSweepsController` to `providers` (it's `@Injectable()` under the hood, but Nest doesn't auto-register controllers in the DI graph).
- **Status:** ✅ Fixed locally — Nest boots clean. Pending push + Vercel redeploy.

---

# TABLE OF CONTENTS

- [A. Platform & user setup](#a-platform--user-setup)
- [B. Org setup (org-admin)](#b-org-setup-org-admin)
- [C. League / season / division setup](#c-league--season--division-setup)
- [D. Registration funnel (public)](#d-registration-funnel-public)
- [E. Registration review (admin)](#e-registration-review-admin)
- [F. Team management (captain / coach)](#f-team-management-captain--coach)
- [G. Game day — lineups, scoring, results](#g-game-day--lineups-scoring-results)
- [H. Finance — invoices, payments, refunds](#h-finance--invoices-payments-refunds)
- [I. Communications — notifications, templates, push](#i-communications--notifications-templates-push)
- [J. Public surfaces — landing, sign-in, parent portal](#j-public-surfaces--landing-sign-in-parent-portal)
- [K. Compliance & eligibility](#k-compliance--eligibility)
- [L. Statistics & standings](#l-statistics--standings)
- [M. Team store](#m-team-store)
- [N. Cron + background jobs](#n-cron--background-jobs)
- [O. i18n](#o-i18n)
- [P. Cross-cutting non-functional](#p-cross-cutting-non-functional)
- [Q. Cross-app verification matrix](#q-cross-app-verification-matrix)

---

# A. Platform & user setup

> Owner: super_admin. Surface: `apps/superadmin-web`.

### TC-A1-01 · Super-admin sign-in (happy path)
- **Role:** super_admin
- **Steps:** Visit `https://sp-superadmin.vercel.app/sign-in` → enter `alex@sp.test` + password → submit.
- **Expected:** Redirect to `/`, sees Federation dashboard, KPIs render, no console errors.

### TC-A1-02 · Sign-in failure (wrong password)
- **Role:** super_admin
- **Steps:** Same as above with wrong password.
- **Expected:** Inline error "Invalid login credentials". No redirect.

### TC-A1-03 · Sign-in failure (wrong role)
- **Role:** org_admin (no super_admin grant)
- **Steps:** Sign in at `sp-superadmin.vercel.app/sign-in` as `org@sp.test`.
- **Expected:** Bounced to `/sign-in?error=wrong_role` with the matching banner. **Cross-surface:** signing in at `sp-org-admin.vercel.app/sign-in` with the same account works.

### TC-A1-04 · Sign-out clears every app
- **Steps:** Signed in to super-admin and org-admin in same browser → click sign-out on super-admin.
- **Expected:** super-admin redirects to `/sign-in?error=signed_out`. Visiting org-admin must NOT silently re-auth — per the 2026-05-09 directive each app has its own session.

### TC-A1-05 · Magic-link sign-in
- **Steps:** On `/sign-in`, enter email only → "Send sign-in link" → check inbox → click link.
- **Expected:** Lands signed in. JWT carries the role app_metadata.

### TC-A1-06 · `/auth/callback` exchange
- **Steps:** Open the link from TC-A1-05 in a new private window (no existing session).
- **Expected:** `/auth/callback?code=…` exchanges, sets cookies, redirects to `/`. **All four web apps** (superadmin, org-admin, team-admin, player) must have an `/auth/callback` route.

### TC-A1-07 · Session expiry mid-flow
- **Steps:** Sign in → wait for JWT to expire (or force-expire in dev) → navigate to any page.
- **Expected:** API returns 401 → app intercepts → redirect to `/sign-in?error=session_expired&next=…`. No crashed UI, no infinite redirect loop.

### TC-A2-01 · Create an organization
- **Role:** super_admin
- **Steps:** `/organizations` → "New org" → fill display name, legal name, country → submit.
- **Expected:** Row appears in list. Audit row written: `orgs.create` with the new id.
- **Cross-surface:** sign in to org-admin as a user granted org_admin on this new org — switcher shows the new org.

### TC-A2-02 · Org legal name uniqueness
- **Steps:** Create org with legal name X. Try to create another with the same legal name.
- **Expected:** 409 with helpful message. Form re-enabled.

### TC-A3-01 · Invite a user by email (auto-confirm OFF)
- **Pre-conditions:** `SUPABASE_REQUIRE_EMAIL_CONFIRM=true` on `sp-api`.
- **Steps:** `/users` → "Invite user" → enter email → submit.
- **Expected:** Resend delivers a confirmation email. User row created in `auth.users` with email_confirmed_at = NULL. Inviter sees a copy/paste fallback if Resend isn't wired.
- **Cross-surface:** Invited user opens the email link, sets a password, lands signed in on the matching role app.

### TC-A3-02 · Invite a user by email (auto-confirm ON, dev)
- **Pre-conditions:** `SUPABASE_REQUIRE_EMAIL_CONFIRM=false`.
- **Steps:** Same as above.
- **Expected:** User created, `email_confirmed_at` populated immediately. No verification email is required to sign in.

### TC-A3-03 · Invite with profile setup (single flow)
- **Steps:** "Invite user" → fill name + role profile in the SAME dialog → submit.
- **Expected:** User created, profile populated, role assignment made — all in one transaction. No "find user → click roles → edit profile" multi-step.
- **Why:** Cardinal-rule fix (CLAUDE.md "connected actions belong in connected dialogs").

### TC-A4-01 · Assign a role
- **Steps:** `/users/[id]` → Roles section → "Add role" → pick `org_admin`, scope=Org-A → submit.
- **Expected:** Assignment row inserted. User's `app_metadata.role_codes` refreshed via Supabase admin. **Cross-surface:** they can now sign in to org-admin and see Org-A in the switcher.

### TC-A4-02 · Revoke a role
- **Steps:** Same row → Revoke.
- **Expected:** `revoked_at` populated. Role disappears from listed assignments. User's app_metadata re-synced. Their sign-in to org-admin now bounces with `wrong_role`.

### TC-A4-03 · Dropdown defaults reflect context
- **Steps:** On a super_admin user, open "Change user type" dropdown.
- **Expected:** Defaults to **super_admin**, not coach (alphabetic-first). Same rule for "Edit role profile" — opens the matching role's form, not the player default.
- **Why:** Cardinal-rule fix from 2026-05-09. See CLAUDE.md.

### TC-A5-01 · Cross-org grant
- **Role:** super_admin
- **Steps:** `/organizations/[id]` → cross-org grants → grant a user from Org-B view-only on Org-A.
- **Expected:** That user, signed in to org-admin and switching to Org-A, sees read-only pages (every write CTA absent or disabled).

### TC-A6-01 · Suspend / reactivate user
- **Steps:** `/users/[id]` → Suspend → choose reason.
- **Expected:** User can no longer sign in (`AccessDenied`). All their queued notifications still in outbox but not new ones fire. Reactivate restores sign-in.

### TC-A7-01 · Audit log records every mutation
- **Steps:** Perform any 2xx-returning POST/PATCH/DELETE from any app.
- **Expected:** A row in `audit_events` with `actor_id=user.id`, `action=<resource>.<verb>`, `resource_id`, the before/after diff.
- **Cross-surface:** Visit `/audit` on superadmin-web → the row shows up. On org-admin-web `/audit` → only rows scoped to the active org appear.

### TC-A7-02 · Audit log filter
- **Steps:** `/audit` → filter by actor + action.
- **Expected:** Results narrow; pagination cursor works.

### TC-A7-03 · Audit detail view
- **Steps:** Click any audit row.
- **Expected:** Detail page shows before/after JSON. `resourceId` null-guarded — never crashes when no resource id is recorded.

---

# B. Org setup (org-admin)

> Owner: org_admin. Surface: `apps/org-admin-web`.

### TC-B1-01 · Org-admin sign-in
- **Role:** org_admin
- **Steps:** Sign in at `sp-org-admin.vercel.app/sign-in`.
- **Expected:** Lands on `/` — overview page. Input fields carry accessible names (verify via Playwright snapshot — `textbox "Email"` not bare `textbox`). Fix from commit `20c07fe`.

### TC-B1-02 · Org-admin without org grant
- **Role:** noroles
- **Steps:** Sign in as a user with no active assignments.
- **Expected:** Bounced to `/onboarding` or the empty-state shell ("No organization yet").

### TC-B2-01 · Active-org switcher (multi-org user)
- **Pre-conditions:** User holds org_admin on both Org-A and Org-B.
- **Steps:** Sign in → switcher visible in top-bar → flip to Org-B.
- **Expected:** Cookie `active_org_id` set. Page refreshes. Overview KPIs now reflect Org-B. Every sub-page (leagues / seasons / divisions / teams / registrations / finance / disputes / communications / audit) reads from Org-B.

### TC-B2-02 · Switcher hidden when scope ≤ 1 org
- **Steps:** Sign in as a single-org user.
- **Expected:** Switcher not rendered. `getActiveOrgId(scope)` falls back to `scope.orgIds[0]`.

### TC-B2-03 · Switcher persists across reloads + new tabs
- **Steps:** Switch to Org-B → reload → open a new tab.
- **Expected:** Both tabs show Org-B.

### TC-B3-01 · Create league (org-scoped)
- **Role:** org_admin · **NEW** (Backlog #6)
- **Steps:** `/leagues` → "New league" → name + sport code (e.g. `hockey`) + format → Create.
- **Expected:** API `POST /org-admin/leagues` accepts. Row appears in `/leagues`. Audit row written. **Cross-surface:** super-admin `/leagues` also lists it.

### TC-B3-02 · Create league outside scope
- **Steps:** Tamper with the request body's `orgId` to point at Org-B (which the caller has no grant on).
- **Expected:** 403 with `org_admin required` message. No row created.

### TC-B3-03 · Empty-state CTA on the dashboard
- **Pre-conditions:** Org with zero leagues.
- **Steps:** Sign in.
- **Expected:** Overview's Leagues section shows EmptyState + a "Create league" button linking to `/leagues/new`.

### TC-B4-01 · Create season (under a league)
- **Role:** org_admin · **NEW**
- **Steps:** `/seasons` → "New season" → pick league → name + start/end date + optional registration window + roster lock → Create.
- **Expected:** Season created with denormalised `orgId` matching the league's parent. Form validates `endDate >= startDate`. Roster-lock-at saved if provided.
- **Edge:** Pick a league not in scope → 404 (not 403, per the no-leak rule).

### TC-B4-02 · Empty-state when no leagues
- **Steps:** Go to `/seasons/new` before creating any league.
- **Expected:** EmptyState "No leagues yet — create one first" + link to `/leagues/new`.

### TC-B5-01 · Create division
- **Role:** org_admin · **NEW**
- **Steps:** `/divisions/new` → pick season → name (e.g. `A-Div`) → tier (e.g. `A`) → gender (open / male / female / mixed) → max teams cap → Create.
- **Expected:** Division created under that season. `playoffConfig` defaults `{}`.
- **Edge:** `maxTeams < 2` → form blocks with "Max teams must be 2 or more".

### TC-B5-02 · Empty-state when no seasons
- **Steps:** Go to `/divisions/new` before creating any season.
- **Expected:** EmptyState + link to `/seasons/new`.

### TC-B6-01 · Create team
- **Role:** org_admin · **NEW**
- **Steps:** `/teams/new` → name + sport + optional short name + optional logo URL → Create.
- **Expected:** Team created with `orgId=activeOrg`. Form lands on `/teams/[teamId]` so user can immediately assign a captain.
- **Cross-surface:** superadmin `/teams/[id]` shows the new team.

### TC-B7-01 · Assign a captain to a team
- **Role:** org_admin · **NEW** (Backlog #17a)
- **Steps:** `/teams/[teamId]` → "Assign captain" → paste user UUID → submit.
- **Expected:** `user_role_assignments` row inserted with `scope_type=team / scope_id=teamId / role.code=captain`. `teams.captain_user_id` synced. Captain appears in the captains list with their display name + email.
- **Cross-surface:** that user signs in to team-admin → sees the captain console with Team-1 selected.

### TC-B7-02 · Revoke a captain
- **Steps:** Same page → click "Revoke" on a captain row → confirm.
- **Expected:** `revoked_at` populated. `teams.captain_user_id` cleared if it pointed at the revoked user. The user signs in to team-admin → no longer in captain mode.

### TC-B7-03 · Assign captain — invalid UUID
- **Steps:** Paste `not-a-uuid`.
- **Expected:** Client-side validation rejects before POSTing.

### TC-B7-04 · Assign captain — non-existent user
- **Steps:** Paste a real-looking UUID that isn't in `profiles`.
- **Expected:** 400 "Target user not found".

### TC-B7-05 · Assign captain — out of scope
- **Steps:** Tamper with `:teamId` to a team in Org-B.
- **Expected:** 404 (not 403).

---

# C. League / season / division setup

> Already covered in B for org-admin. This section is the super-admin
> god-app path, which is the reference implementation.

### TC-C1-01 · Org-setup wizard (god app)
- **Role:** super_admin
- **Steps:** `/org-setup` → pick org → pick sport → pick governing body → name the league → season dates → divisions (with tier + gender + cap) → review → submit.
- **Expected:** Single transaction creates league + season + N divisions. Wizard step numbers and runtime calls match exactly (catches bug #1 from CLAUDE.md — stepper visited 1→2→4→5→3→6).

### TC-C1-02 · Wizard returning user
- **Steps:** Start wizard for an org that already has leagues/seasons — pre-fill should not propose duplicates.
- **Expected:** Defaults reflect existing state; user can pick "extend existing season" rather than create a parallel one.

### TC-C2-01 · Edit league
- **Steps:** `/leagues/[id]` → change name → save.
- **Expected:** Optimistic update on the list. Audit row.

### TC-C2-02 · Change league status
- **Steps:** `/leagues/[id]` → status menu → archive.
- **Expected:** Confirmation prompt. Archived leagues hide from default `/leagues` filter (but visible with toggle).

### TC-C3-01 · Season config patch
- **Steps:** `/seasons/[id]` → registration window editor → set opens/closes.
- **Expected:** PATCH `/league/seasons/:id/config` persists. Public funnel respects the dates.

### TC-C3-02 · Season config — roster lock
- **Steps:** Set `rosterLockAt` to now+5 min → wait → try to add a player as captain.
- **Expected:** Captain UI hides the action bar; API returns 409 with `Roster locked` if you bypass UI.

### TC-C4-01 · Division rule overrides
- **Steps:** `/divisions/[id]` → edit `ruleSetOverrides` (e.g. `maxRosterSize: 18`, `maxGuestPlayersPerGame: 2`).
- **Expected:** Captain's add-player flow respects the override (caught the original "guest cap" CLAUDE.md bug).

### TC-C4-02 · Division applications queue
- **Role:** super_admin
- **Steps:** `/division-applications` → pick season → review pending entries.
- **Expected:** Each row shows team + captain + collected/threshold. Approve and Reject CTAs work.

---

# D. Registration funnel (public)

> Surface: `apps/superadmin-web/registration/[id]/...` (the public funnel page lives outside the `(admin)` group) and `apps/player-web/register`. Anonymous.

### TC-D1-01 · Funnel renders for an open registration
- **Pre-conditions:** Season-S has open registration; one form published.
- **Steps:** Open `/registration/<form-id>` as an anonymous user.
- **Expected:** Welcome screen renders. Stepper shows steps in display order.

### TC-D1-02 · Stepper visits in display order (regression for bug #1)
- **Steps:** Walk the funnel start to finish, watching the stepper.
- **Expected:** Highlight transitions follow `1 → 2 → 3 → 4 → 5 → 6` — never `1 → 2 → 4 → 5 → 3 → 6`.
- **Why:** This bug shipped once; per CLAUDE.md it must never recur.

### TC-D1-03 · Spec fields → form fields parity
- **Steps:** Compare every step's input list to the form spec.
- **Expected:** Every spec field present. Labels match domain terms verbatim (no `maxGuestPlayersPerGame` → "Max post-game players" drift).

### TC-D1-04 · Enum field renders as dropdown
- **Steps:** Find any enum field (overtime length, status, role, tier, gender).
- **Expected:** `<select>` with the canonical values — never a bare `<input type="number">`.
- **Why:** CLAUDE.md rule #7.

### TC-D1-05 · Pre-existing entity → dropdown
- **Steps:** Wherever the form needs a season / league / division — verify it's a dropdown pre-populated from the database, never free-text.
- **Why:** CLAUDE.md rule #4.

### TC-D2-01 · Anonymous → submitted
- **Role:** public
- **Steps:** Open funnel → fill every required field → submit.
- **Expected:** Success screen ("admin will review") with reference id. Row in `registrations` with `status=submitted` or `pending_review`.
- **Cross-surface:** super-admin `/registrations` → row appears in the correct status filter. **Important regression:** review queue must default to a filter that includes the new row (catches the "pending_offline rows invisible" CLAUDE.md bug).

### TC-D2-02 · Returning user (account exists)
- **Steps:** Submit funnel with an email already registered.
- **Expected:** Funnel detects and offers "sign in to attach this submission to your account" without losing form state.

### TC-D2-03 · Minor registrant → parental consent
- **Pre-conditions:** Org has parental-consent enabled in season config.
- **Steps:** Submit funnel with DOB making subject < 18.
- **Expected:** Submission marked `pending_consent`. Parent receives email with `/parental-consent/[token]` link.
- **Cross-surface:** open the parent link in a new browser → see consent page (see TC-J3-01).

### TC-D2-04 · Free-agent path
- **Pre-conditions:** Season allows free agents.
- **Steps:** In funnel, pick "I don't have a team" → fill availability + positions.
- **Expected:** `free_agent_pool_entries` row created. Captains can browse it.

### TC-D2-05 · Funnel with payment (mock Stripe)
- **Pre-conditions:** Season requires payment.
- **Steps:** Reach payment step → submit mock card.
- **Expected:** Sub-invoice created against the team master invoice. `paidCents` advances. Status flips to `pending_review` or `approved` per workflow.

### TC-D2-06 · Funnel with offline payment toggle
- **Steps:** Pick "Pay offline" instead of card.
- **Expected:** Submission lands `pending_offline`. Admin gets notified. Review queue's default filter MUST include `pending_offline` (CLAUDE.md bug #2).

### TC-D2-07 · Invite-token funnel (captain invited)
- **Pre-conditions:** Captain sent an invite via TC-F1-04.
- **Steps:** Anonymous user opens `/register?token=<inviteToken>` (or the public route the email links to).
- **Expected:** Funnel pre-fills team + season + division from the token. Submitting attaches the player to that team's roster on approval.

### TC-D3-01 · Player discovers published forms
- **Role:** player (signed-in, no team)
- **Steps:** Sign in to player-web → land on overview.
- **Expected:** A surface lists open forms / open registrations they can submit. **Important regression:** CLAUDE.md bug #3 ("Player can log in but no discoverable path to any published form") — this surface MUST exist.

---

# E. Registration review (admin)

### TC-E1-01 · Super-admin review queue
- **Role:** super_admin
- **Steps:** `/registrations` → default filter → see all submitted + pending rows.
- **Expected:** Submissions from public funnel appear without changing the filter. Bulk actions visible.

### TC-E1-02 · Approve single registration
- **Steps:** Click a row → "Approve" → optional reason.
- **Expected:** State transitions `submitted → approved`. Recipient notified via `registration.approved` template. Audit row written.

### TC-E1-03 · Reject single
- **Steps:** "Reject" → enter reason.
- **Expected:** `submitted → rejected`. `registration.rejected` email fired with reason in the body.

### TC-E1-04 · Bulk approve
- **Steps:** Tick N rows → "Approve N" → confirm.
- **Expected:** All transition. One notification per row. Audit row per row.

### TC-E1-05 · Override compliance flag
- **Steps:** Click an `incomplete` registration with a flag → "Override flag" → justify.
- **Expected:** Flag override written into `registrations.metadata.flagOverrides[<flag>]` with `{overriddenBy, overriddenAt, justification}`. Submission re-evaluated.

### TC-E2-01 · Org-admin review (approve)
- **Role:** org_admin · **NEW** (Backlog #6 — commit `e81ab67`)
- **Steps:** `/registrations` → pending row → "Approve".
- **Expected:** API `POST /org-admin/registrations/:id/review { action: approve }` succeeds. State `submitted → approved`. `registration.approved` notification queued via the catalog template.
- **Cross-surface:** the registrant's player-web → registration card flips to Approved.

### TC-E2-02 · Org-admin review (reject with reason)
- **Steps:** Click "Reject" → reason appears inline → confirm.
- **Expected:** State `submitted → rejected`. `decisionReason` saved. Rejection email fired.

### TC-E2-03 · Org-admin review — out of scope
- **Steps:** Tamper with `:id` to a registration whose `orgId` is Org-B.
- **Expected:** 404 (not 403).

### TC-E2-04 · Org-admin review — invalid state
- **Steps:** Try to approve an already-approved row.
- **Expected:** State machine rejects. 403/422. No double-notification.

### TC-E2-05 · Org-admin cannot override flags
- **Steps:** Inspect the row UI for an `incomplete` submission.
- **Expected:** No "Override flag" action surfaced. API call directly to `/org-admin/registrations/:id/review { action: override_flag }` is rejected — that action stays super-admin-only by design.

### TC-E3-01 · Captain rollover wizard (D2)
- **Role:** captain · existing team with last season's roster
- **Steps:** `/captain/register` → walk wizard → import prior season's roster → submit.
- **Expected:** 8-write atomic submission. Master invoice + sub-invoices + invites created. `division_team_entries.entry_status = applied`.
- **Cross-surface:** super-admin `/division-applications` shows the new entry. Org-admin `/teams/[teamId]` shows the same. Each invited player receives `TEAM_INVITE_NEW`.

---

# F. Team management (captain / coach)

> Owner: captain (or super_admin bypass). Surface: `apps/team-admin-web`.

### TC-F1-01 · Captain dashboard mode
- **Role:** captain
- **Steps:** Sign in → land on `/`.
- **Expected:** Top banner pulses if registration mode is `registration_open`. Sidebar "Register the team" entry pulses in sync. **Both render together** (CLAUDE.md cardinal: connected actions).

### TC-F1-02 · Roster list
- **Steps:** `/captain/roster`.
- **Expected:** Active memberships listed. Each row shows name, jersey, position. Lock state visible if past `rosterLockAt`.

### TC-F1-03 · Add player to roster
- **Steps:** Click add → pick person from registered players list → optional jersey/position → save.
- **Expected:** `roster_moves` add + `team_memberships` insert in one transaction. Roster count increments.
- **Edge:** at cap → 409 "Roster is full".

### TC-F1-04 · Invite a player by email
- **Steps:** Invite panel → enter email → optional split amount → Send.
- **Expected:** `team_invites` row with token. Email queued via `TEAM_INVITE_NEW`. Expiry = season close OR default TTL (whichever earlier).

### TC-F1-05 · Resend invite reminder
- **Steps:** Same invite → "Remind".
- **Expected:** Cooldown ≥ 24h. Extension count <= MAX_INVITE_EXTENSIONS. Expiry pushed to +7d. `INVITE_REMINDER_2` queued.

### TC-F1-06 · Drop a player
- **Steps:** Active membership → Drop → enter reason ≥ 20 chars.
- **Expected:** Status flips to `released`. `roster_moves` drop row. If sub-invoice paid → `refund_assessments` pending row created.
- **Cross-surface:** org-admin `/disputes` queue shows the new pending assessment.

### TC-F1-07 · Add a guest player to a single game
- **Pre-conditions:** Game G between Team-1 (your team) and Team-2.
- **Steps:** `/captain/roster/[teamId]/guest` flow → pick game + person.
- **Expected:** `game_attendance` row with `isGuest=true`. Cap checks honoured (max per game + max per season per player). Walk-in shell person created when no `personId` given.

### TC-F1-08 · Transfer initiation (Workflow 7B Case 6)
- **Steps:** Roster row menu → Transfer to another team → submit.
- **Expected:** `transfer_requests` row → notifies receiving captain. Admin approval required.

### TC-F2-01 · Captain console role-gate
- **Role:** coach (NOT captain) on Team-1
- **Steps:** Open captain-only pages.
- **Expected:** Permitted reads succeed. Mutations (add / drop / invite) return 403. Sidebar hides captain-only entries.

### TC-F2-02 · Super_admin bypass
- **Role:** super_admin
- **Steps:** Visit captain pages of any team.
- **Expected:** All captain actions usable (per CLAUDE.md "captains can be assigned without super-admin… but super-admin still passes through").

### TC-F3-01 · Captain dues view
- **Role:** captain
- **Steps:** `/captain/dues`.
- **Expected:** Master invoice + per-player breakdown. "Remind all unpaid" + "Cover outstanding" CTAs.

### TC-F3-02 · Remind all unpaid
- **Steps:** Click "Remind all unpaid".
- **Expected:** `notifications` queued for each delinquent player with `SUB_INVOICE_REMINDER`. Toast confirms count.

### TC-F3-03 · Cover outstanding (mock Stripe)
- **Steps:** Click "Cover outstanding" → mock-pay full balance.
- **Expected:** Single payment recorded against master. Sub-invoice paidCents advanced for every covered player. `DUES_COVERED_BY_CAPTAIN` queued per covered player.

---

# G. Game day — lineups, scoring, results

### TC-G1-01 · Game schedule (player-web)
- **Role:** player
- **Steps:** `/schedule`.
- **Expected:** Upcoming games for the player's team listed with date/time/opponent/venue.

### TC-G1-02 · Game schedule (team-admin)
- **Role:** captain
- **Steps:** `/schedule`.
- **Expected:** Same data, captain-style table.

### TC-G2-01 · Lineup editor (captain)
- **Role:** captain
- **Steps:** `/lineups` → click an upcoming game → editor.
- **Expected:** Active roster only (released/suspended hidden). Radio buckets for starter / bench / scratch. Jersey + position inputs editable.
- **Edge:** No active roster → EmptyState "No active roster" with icon (Users). Catches the previously-broken missing-`icon`-prop case.

### TC-G2-02 · Lineup save
- **Steps:** Set 6 starters + 12 bench + 1 scratch → Save.
- **Expected:** `game_lineups` upsert on `(game_id, team_id)`. Lock state still `null`.

### TC-G2-03 · Lineup locks on game start
- **Steps:** Move game to `in_play` (super_admin via `/games/[id]` action).
- **Expected:** Auto-lock fires (StartPlayHandler). `game_lineups.locked_at` populated. Captain editor disables every input + shows lock badge.

### TC-G2-04 · Lineup edit after lock
- **Steps:** Try to PUT lineup post-lock.
- **Expected:** API returns 409 `Lineup locked`. UI blocks.

### TC-G3-01 · Game start / finalize (super_admin)
- **Steps:** `/games/[id]` → Start → enter scores period by period → Finalize.
- **Expected:** Game status transitions `scheduled → in_play → completed`. Standings recomputed (TC-L1-01).

### TC-G3-02 · Game cancel
- **Steps:** From any pre-game state → Cancel.
- **Expected:** Status `cancelled`. Lineup not locked (no `started`).

### TC-G3-03 · Game postpone
- **Steps:** Pre-game → Postpone → pick new date.
- **Expected:** New game row OR same row with `status=postponed` + future scheduled time. `game.postponed` notification fans out.

### TC-G3-04 · Game forfeit
- **Steps:** During scoring → Forfeit → pick winning team + reason.
- **Expected:** Status `forfeited`. Standings reflect the forfeit per league rules.

---

# H. Finance — invoices, payments, refunds

### TC-H1-01 · Invoice list (org-admin)
- **Role:** org_admin
- **Steps:** `/finance`.
- **Expected:** KPIs (outstanding, totals, overdue). Invoice list below. Currency formatted via Intl.

### TC-H1-02 · Invoice detail (super_admin)
- **Steps:** `/finance/[id]`.
- **Expected:** Full detail. Items, payments, refunds, escalations.

### TC-H2-01 · Record offline payment (org-admin)
- **Role:** org_admin · **NEW** (Backlog #6 — commit `a8da7e2`)
- **Steps:** `/finance` → click an open invoice → inline "Record payment" → enter amount, method (cash / check / etransfer / etc.), date, notes → submit.
- **Expected:** `POST /org-admin/finance/invoices/:id/payments` succeeds. `payments` row inserted with `recordedByUserId=user.id`. `invoices.paidCents` advanced. Status flips to `paid` if remaining reaches 0; else `partially_paid`. Captain's `/captain/dues` reflects the new balance.

### TC-H2-02 · Record payment exceeds remaining
- **Steps:** Try to record amount > remaining.
- **Expected:** Client-side block. Server-side 422 if bypassed.

### TC-H2-03 · Record payment on void invoice
- **Steps:** Pick a void invoice.
- **Expected:** "Record payment" CTA hidden. API call rejected.

### TC-H2-04 · Record payment out of scope
- **Steps:** Tamper with `:invoiceId` to an Org-B invoice.
- **Expected:** 404.

### TC-H3-01 · Issue refund (super_admin only)
- **Steps:** `/finance/refunds` → New → invoice + amount + type + reason → submit.
- **Expected:** `refunds` row with `status=pending`. Worker (or mock) flips to `succeeded`. Audit row.

### TC-H3-02 · Wallet credit (refund_type=wallet_credit)
- **Steps:** Same flow → pick `wallet_credit`.
- **Expected:** No external gateway. `wallet_accounts` credited atomically. `WALLET_CREDITED` notification.

### TC-H4-01 · QuickBooks sync log
- **Steps:** `/finance/[id]` → look for QB section.
- **Expected:** Per-event sync status. Failed events have a "Retry" button → POST `/finance/qb/retry/:id`.

### TC-H5-01 · Captain dues (TC-F3-02 cross-link)
- **See TC-F3-01 to TC-F3-03.**

---

# I. Communications — notifications, templates, push

### TC-I1-01 · Outbox visible to org-admin
- **Role:** org_admin
- **Steps:** `/communications`.
- **Expected:** Scope-filtered list of notifications for the active org. KPI tiles for each status.

### TC-I1-02 · Outbox visible to super_admin
- **Role:** super_admin
- **Steps:** `/communications`.
- **Expected:** Every org's notifications. Filters for status + channel + template.

### TC-I2-01 · Per-template preferences
- **Role:** any signed-in user
- **Steps:** `/notifications/me/preferences` or the matching UI page.
- **Expected:** Lists every TEMPLATE_CODE × channel pair with toggle. Save flips `notification_preferences`. Opt-out makes future dispatch mark `suppressed` (not `failed`).

### TC-I2-02 · Per-template preference — push channel
- **Steps:** Same page → "push" toggle for any template.
- **Expected:** Persists. Push dispatcher honours the opt-out exactly like email.
- **NEW** (Backlog #16 — channel allowed by migration 0039).

### TC-I3-01 · Compose broadcast (org-admin)
- **Role:** org_admin · **NEW** (Backlog #6 — commit `841e4c4`)
- **Steps:** `/communications/compose` → tick `captains` + `team_admins` → subject + body → channel `email` → Send.
- **Expected:** API `POST /org-admin/broadcast` returns `queued: N, audiencesResolved: M`. `notifications` rows inserted with `templateCode=org.broadcast` (1 per resolved recipient). Idempotency key `broadcast-<id>-<personId>`.

### TC-I3-02 · Compose broadcast — multi-audience union
- **Steps:** Tick all four audiences.
- **Expected:** Same recipient covered by multiple audiences gets exactly **one** row (de-duped via `personId` Set in resolver).

### TC-I3-03 · Compose broadcast — opt-out honoured
- **Pre-conditions:** Player has opted-out of `org.broadcast` email.
- **Steps:** Send broadcast targeting that player.
- **Expected:** Notification queued but immediately marked `suppressed` (per `isOptedOut` check in NotificationService).

### TC-I3-04 · Compose broadcast — in-app channel
- **Steps:** Same form → channel = `in_app`.
- **Expected:** Notifications appear in the recipient's player-web `/notifications` page on next refresh. `unread_count` increments.

### TC-I3-05 · Compose broadcast — empty audience
- **Steps:** Untick all audiences → submit.
- **Expected:** Client block + server 400 "Pick at least one audience".

### TC-I3-06 · Compose broadcast — out of scope
- **Steps:** Tamper with `orgId` to Org-B.
- **Expected:** 403.

### TC-I4-01 · Email template override per (season, eventType)
- **Steps:** `/communications/templates` → create override for `on_approved` scoped to Season-S → set subject + bodyHtml.
- **Expected:** Saved row in `email_templates`. Next approval on Season-S uses the override (verify in the queued notification body); approvals on Season-T still use the catalog default.

### TC-I5-01 · Push subscription register (browser)
- **Role:** player or captain · **NEW** (Backlog #16)
- **Steps:** From any app, request notification permission → service worker subscribes via web-push → POST `/communications/push/subscribe` with endpoint + p256dh + auth.
- **Expected:** Row in `push_subscriptions`. Re-POST refreshes `last_seen_at` (endpoint is the unique key).

### TC-I5-02 · Push subscription list
- **Steps:** GET `/communications/push`.
- **Expected:** Only the caller's subscriptions returned.

### TC-I5-03 · Push subscription delete
- **Steps:** DELETE `/communications/push/:id`.
- **Expected:** Row gone. Returns `{ deleted: true }`.

### TC-I5-04 · Push dispatch (log-only — VAPID unset)
- **Pre-conditions:** `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` unset.
- **Steps:** Queue a notification with `channel=push` to a user with active subs.
- **Expected:** PushDispatcherService logs `[push:…] log-only (VAPID keys unset)`. Notification stays `failed` (so the retry-failed cron picks it up later). No crash.

### TC-I5-05 · Push dispatch (real provider)
- **Pre-conditions:** VAPID keys configured + `web-push` lib bundled.
- **Steps:** Same as above.
- **Expected:** Real push sent to each active subscription. 410-gone responses soft-disable the offending endpoint via `deactivateEndpoint`.

### TC-I6-01 · Notifications retry-failed cron (pg_cron)
- **Pre-conditions:** Failed notification rows present.
- **Steps:** Wait for the next pg_cron tick OR `SELECT cron.schedule('once-now', '1 minute', $$…$$)`.
- **Expected:** pg_net POSTs `/communications/cron/retry-failed` with `X-Cron-Secret`. CronSecretGuard accepts. Rows re-dispatched. Same backoff strategy across email + push.

---

# J. Public surfaces — landing, sign-in, parent portal

### TC-J1-01 · Landing page renders
- **Role:** public
- **Steps:** Visit `https://sp-landing-seven.vercel.app/`.
- **Expected:** Hero + every section + footer ticker renders. No console errors. Framer-motion animations don't jank.

### TC-J1-02 · Landing — pricing, contact, leadership, resources
- **Steps:** Visit each route.
- **Expected:** Each renders. Nav highlights the active path.

### TC-J1-03 · Landing — sign-in dropdown
- **Steps:** Click "Sign in" in the nav.
- **Expected:** Dropdown shows the four targets (super-admin / org-admin / team-admin / player) with separate `/sign-in` and `/sign-up` links to each Vercel project.

### TC-J2-01 · Each app's sign-in page is keyboard-accessible
- **Role:** public
- **Steps:** Tab through `/sign-in` on all four apps.
- **Expected:** Focus order: email → password → submit. Email + password labels read by screen-readers (regression for the `Field` a11y bug fixed in commit `20c07fe`).

### TC-J2-02 · Sign-up page on each role app
- **Steps:** Visit `/sign-up` on each.
- **Expected:** Creates account scoped to the matching role (or hands off to invite flow if open sign-up is disabled).

### TC-J3-01 · Parent portal — valid token
- **Role:** public · parent
- **Pre-conditions:** A minor's registration triggered a consent email; parent has the URL.
- **Steps:** Open `https://sp-player-red.vercel.app/parental-consent/[token]`.
- **Expected:** Middleware whitelists the path (no sign-in redirect). API `GET /public/registration/parental-consent/:token` returns context. Page renders child name + season + org + decision buttons.

### TC-J3-02 · Parent portal — confirm
- **Steps:** Click "Confirm consent".
- **Expected:** POST `…/redeem { action: confirm }` succeeds. Submission moves out of `pending_consent`. Confirmation screen. Original submitter's player-web reflects approval next time they log in.

### TC-J3-03 · Parent portal — decline
- **Steps:** Click "Decline".
- **Expected:** Submission moves to `cancelled` (or `rejected` per workflow). Email confirms decision to parent.

### TC-J3-04 · Parent portal — expired token (24h TTL)
- **Steps:** Wait 24h + 1m → reopen URL.
- **Expected:** "Link expired" screen with instruction to ask the registrant to resend.

### TC-J3-05 · Parent portal — invalid token
- **Steps:** Garbled token in URL.
- **Expected:** "Invalid link" screen. No information leak about whether a submission exists.

### TC-J4-01 · Anonymous `/register` route on player-web
- **Steps:** Open `/register` while signed out.
- **Expected:** Middleware whitelists the path. Funnel renders (links into the funnel pages on superadmin-web `/registration/[id]` if that's where forms live).

---

# K. Compliance & eligibility

### TC-K1-01 · Eligibility verification (USA Hockey)
- **Steps:** Submit registration with a USA Hockey number → workflow runs verification.
- **Expected:** `eligibility_records` row with `verified=true` if number matches. UI shows verified badge.

### TC-K1-02 · Eligibility flag on mismatch
- **Steps:** Same with a bogus number.
- **Expected:** `flagged` state. Registration moves to `incomplete` or `under_review` per config. Admin sees the flag.

### TC-K2-01 · USA Hockey expiring sweep
- **Steps:** Wait for sweep cron OR run manually with the date forced.
- **Expected:** `USA_HOCKEY_EXPIRING_SOON` queued 30d out, `USA_HOCKEY_EXPIRED` on the day, `USA_HOCKEY_EXPIRED_CAPTAIN` to the team captain.

### TC-K3-01 · Compliance lock-sweep cron
- **Pre-conditions:** Season-S with `rosterLockAt < now()` and `last_lock_sweep_at` either null or older.
- **Steps:** Hourly pg_cron tick fires.
- **Expected:** Per-team check; teams with non-compliant rosters get `COMPLIANCE_SWEEP_COMPLETE` once (idempotent via `last_lock_sweep_at` advance — catches the spammy-notification bug).

### TC-K4-01 · Playoff eligibility gate
- **Pre-conditions:** Player below `minGamesForPlayoffs`.
- **Steps:** Captain tries to add them as a guest on a playoff game.
- **Expected:** 409 `playoff_ineligible` with the reason payload.

---

# L. Statistics & standings

### TC-L1-01 · Standings recompute after finalize
- **Steps:** Finalize a game (TC-G3-01) → wait for projection.
- **Expected:** Standings updated for both teams. Points formula respects league config (ppw/ppl/ppt/ppotl).

### TC-L1-02 · Standings manual recompute
- **Steps:** Super_admin `/stats/standings/<leagueId>/recompute` POST.
- **Expected:** Idempotent. Same result regardless of how many times called.

### TC-L2-01 · Leaderboard build
- **Steps:** Build leaderboard scoped to league / division / season.
- **Expected:** Rows ordered by configured stat. Player-web `/stats` shows the leaderboard.

### TC-L3-01 · Game events ingestion (super_admin)
- **Steps:** `/game-events` → record a goal/assist/penalty → save.
- **Expected:** `game_events` row inserted. `project()` rolls into `stat_lines`.

### TC-L3-02 · Stat lines snapshotted
- **Steps:** `/stats` filtered to a player.
- **Expected:** Per-game stat lines aggregate to the season totals.

---

# M. Team store

> **NEW** (Backlog #11). Captain CRUD + player browse. Purchase flow
> deferred until real Stripe (P4-1).

### TC-M1-01 · Captain — empty store
- **Role:** captain on Team-1
- **Steps:** team-admin-web `/captain/store`.
- **Expected:** Empty-state "No products yet" + "Add product" CTA.

### TC-M1-02 · Captain — create product
- **Steps:** "Add product" → name + description + image URL + price + currency + variant + stock + visible toggle → Create.
- **Expected:** Row appears. Currency validates `^[A-Z]{3}$`. Price >= 0.

### TC-M1-03 · Captain — edit product inline
- **Steps:** Click "Edit" on a row → change price → Save.
- **Expected:** Updated, visible immediately.

### TC-M1-04 · Captain — hide product (toggle)
- **Steps:** Click "Hide".
- **Expected:** `is_active=false`. Player view (TC-M2-01) no longer lists it.

### TC-M1-05 · Captain — delete product
- **Steps:** Click delete → confirm.
- **Expected:** Hard delete (no purchase history yet). Row gone.

### TC-M1-06 · Captain — out-of-scope
- **Steps:** Coach on Team-1 (not captain) tries to GET `/captain/store/<team1>/products`.
- **Expected:** 403 "Not the captain of this team".

### TC-M2-01 · Player browse
- **Role:** player on Team-1
- **Steps:** player-web `/store`.
- **Expected:** Active products grid. Each card shows image, name, price (Intl formatted), variant, description. Out-of-stock badge when `stockQty <= 0`. "Checkout soon" pill (no purchase yet).

### TC-M2-02 · Player on no roster
- **Role:** noroles
- **Steps:** Visit `/store`.
- **Expected:** Empty-state "Not on a roster yet".

### TC-M2-03 · Player — access another team's store
- **Steps:** Player on Team-1 calls `GET /team-store/<team2>/products`.
- **Expected:** 403 "Not a member of this team" (or 404 to avoid leak).

### TC-M2-04 · Super-admin browse any store
- **Role:** super_admin
- **Steps:** Same as M2-03.
- **Expected:** 200. Super-admin bypass works for the captain-or-member gate.

---

# N. Cron + background jobs

### TC-N1-01 · pg_cron schedule visible
- **Steps:** SQL: `SELECT jobname, schedule, command FROM cron.job ORDER BY jobid;`.
- **Expected:** Sees the migration-0034 jobs (retry-failed, MV refresh) + migration-0036 compliance-lock-sweep.

### TC-N2-01 · Notifications retry-failed
- **See TC-I6-01.**

### TC-N3-01 · MV refresh — `v_active_season_membership`
- **Steps:** Trigger refresh (cron tick or manual `REFRESH MATERIALIZED VIEW CONCURRENTLY`).
- **Expected:** No `prevented other concurrent operations` errors. Stale-read scenarios bounded by tick interval.

### TC-N4-01 · CronSecretGuard rejects missing header
- **Steps:** POST `/communications/cron/retry-failed` without `X-Cron-Secret`.
- **Expected:** 401. Same for materialised-view refresh + compliance sweep.

### TC-N4-02 · CronSecretGuard accepts correct secret
- **Steps:** POST same with `X-Cron-Secret: <CRON_SECRET>`.
- **Expected:** 200.

---

# O. i18n

> **NEW** (Backlog #13 — landing-web only for now).

### TC-O1-01 · Default locale = English
- **Steps:** Open landing in a new private window (no cookie).
- **Expected:** Hero renders English from `messages/en.json`. `<html lang="en">`.

### TC-O1-02 · Locale switcher present
- **Steps:** Inspect nav.
- **Expected:** `<LocaleSwitcher>` shows current + the other locales (currently `English`, `Español`).

### TC-O1-03 · Switching locale persists
- **Steps:** Pick Español → page reloads.
- **Expected:** `NEXT_LOCALE` cookie set (1 year). Hero copy now in Spanish. Reload again → still Spanish. New private window → back to default.

### TC-O1-04 · Missing key fallback
- **Pre-conditions:** Drop a key from `es.json`.
- **Steps:** Switch to Spanish.
- **Expected:** Next-intl falls back gracefully (logs warning, renders key as fallback). No crash.

### TC-O2-01 · Add a third locale (decision pending — EN-AR-HI)
- **Steps:** Drop `messages/ar.json` + `messages/hi.json` mirroring en.json. Add codes to `LOCALES` in `src/i18n/config.ts`.
- **Expected:** Switcher auto-includes them. Arabic also flips `<html dir="rtl">` (must add to RootLayout).

### TC-O2-02 · RTL audit when Arabic ships
- **Steps:** With `ar` locale active, walk every landing page.
- **Expected:** Sections mirror correctly. No clipping. Icons that imply direction (arrows) flip.

---

# P. Cross-cutting non-functional

### TC-P1-01 · Scope leak — 404 on out-of-scope
- **Steps:** For every `GET /:resource/:id` and `POST /:resource/:id/...`, request a resource the caller has no scope on.
- **Expected:** 404, never 403, never 200. (CLAUDE.md no-leak rule.) Applies to: orgs, leagues, seasons, divisions, teams, invoices, registrations, refund-assessments, push-subscriptions, etc.

### TC-P2-01 · Audit interceptor records everything
- **Steps:** Perform any 2xx POST/PATCH/DELETE.
- **Expected:** Exactly one audit row, even when the handler emits other side-effects. Action label follows `<resource>.<verb>` convention.

### TC-P3-01 · Idempotency — notifications.queue
- **Steps:** Queue the same notification twice with the same idempotency key (e.g. retry).
- **Expected:** Second call returns the same row, doesn't insert a duplicate.

### TC-P3-02 · Idempotency — broadcast
- **Steps:** Send the same broadcast body twice in a row (same broadcastId not changed by tooling).
- **Expected:** Per-recipient row insert is unique. Re-runs are safe.

### TC-P4-01 · Concurrency — roster cap-1 race
- **Pre-conditions:** Roster at cap-1.
- **Steps:** Two captains (or super-admin sessions) POST add at the same time.
- **Expected:** Exactly one 200, one 409. `SELECT … FOR UPDATE` serialises. No 13th player snuck in.

### TC-P4-02 · Concurrency — guest cap per game
- **Same pattern for the per-game guest cap.**

### TC-P5-01 · Auth — JWT verification rejects garbage
- **Steps:** Hit any guarded endpoint with `Authorization: Bearer garbage`.
- **Expected:** 401.

### TC-P5-02 · Auth — JWT verification rejects expired
- **Steps:** Same with an expired JWT.
- **Expected:** 401.

### TC-P5-03 · Auth — service-role bypass NOT exposed
- **Steps:** Try to coerce a frontend to send the service-role key as a bearer.
- **Expected:** Backend never accepts it as a user JWT. Service-role usage stays server-side only (`apps/superadmin-api`).

### TC-P6-01 · Audit log idempotent under retry
- **Steps:** Force a retry on a transient failure (e.g. provider 503 during email send).
- **Expected:** Audit doesn't double-write. Notification status flips `failed → sent` on success without a second `<resource>.<verb>` row.

### TC-P7-01 · Drizzle types match runtime
- **Steps:** After any schema change, `pnpm --filter @sportspulse/db build` must succeed.
- **Expected:** No `tier: number` vs `tier: string` style drift between TS types and SQL columns.

### TC-P8-01 · Next.js stale type cache
- **Steps:** After deleting / renaming an app route, do a fresh dev server start.
- **Expected:** No "validator.ts references deleted route" errors. (Fix: `rm -rf .next/types`.)

---

# Q. Cross-app verification matrix

> Use this when you only have time for a smoke pass. Each row is a
> single happy-path that touches multiple apps. Failing any row is a
> blocker.

| # | Setup (who does what) | Verify (where + as whom) |
|---|---|---|
| **Q-01** | super-admin creates org + first league + season | org-admin signs in → sees the new org in switcher, leagues list, season list |
| **Q-02** | org-admin creates league (NEW) | super-admin `/leagues` lists it; audit log row |
| **Q-03** | org-admin creates season + division + team (NEW) | each list page on org-admin reflects; super-admin sees them too |
| **Q-04** | org-admin assigns captain to a team (NEW) | that user signs in to team-admin and lands on captain mode |
| **Q-05** | captain registers team for a season | super-admin `/division-applications` shows pending entry; org-admin sees it under `/registrations` (if surfaced) |
| **Q-06** | captain invites a player by email | invited user receives email; clicks token URL; lands on funnel pre-filled with team |
| **Q-07** | anonymous player submits public funnel | super-admin AND org-admin review queues both show the new row in the right filter |
| **Q-08** | org-admin approves a registration (NEW) | player-web shows the registration card flipped to Approved |
| **Q-09** | minor user submits → parent consents | original player-web shows progress past `pending_consent` |
| **Q-10** | captain drops a paid player | org-admin `/disputes` shows new pending refund_assessment |
| **Q-11** | org-admin adjudicates refund (refund decision) (NEW) | refund_assessments row status flips; super-admin `/finance/refunds` shows the actual disbursement once issued |
| **Q-12** | org-admin records offline payment (NEW) | captain `/captain/dues` reflects the new balance |
| **Q-13** | org-admin sends broadcast to captains (NEW) | captain's `/notifications` shows the in-app row (or email arrives) |
| **Q-14** | captain creates merch product (NEW) | player-web `/store` lists it |
| **Q-15** | captain edits lineup → game starts | lineup locks; player-web `/schedule` shows correct game state |
| **Q-16** | super-admin finalizes a game | standings update on player-web `/team`; stat lines aggregate on `/stats` |
| **Q-17** | captain registers a push subscription (NEW) | API `GET /communications/push` lists it; opt-out toggle from preferences works |

---

## Appendix — bug log format (per finding)

```
[BUG-N] <feature> · <severity: blocker | major | minor | cosmetic>
  TC: <test case id>
  Surface: <admin / captain / player / public>
  Repro:
    1. ...
    2. ...
  Expected: ...
  Actual: ...
  File: <path:line where the fix likely lands>
```

Past walks live alongside this doc:
- [`doc/tester-walk-2026-05-16.md`](tester-walk-2026-05-16.md) — public-surface walk + a11y finding fixed in commit `20c07fe`.

## Appendix — when this doc is wrong

If a test case here contradicts current behaviour, the **code** is the
truth. Update this doc in the same commit that changes the behaviour,
or open a follow-up referencing the failing TC-id.
