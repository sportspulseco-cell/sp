# SportsPulse E2E Suite

Playwright-driven end-to-end tests covering **all five apps at once**.
Runs against the deployed Vercel aliases by default; flip
`E2E_TARGET=local` to run against `pnpm dev` ports instead.

## Layout

Three layers, each catching a different class of regression:

```
tests/e2e/
├── fixtures.ts              # SMOKE_USERS, ROUTES catalogs, signIn() helper
├── smoke/                   # Layer 1 — every route loads + renders its anchor
│   ├── landing.spec.ts      # public marketing site
│   ├── sign-up.spec.ts      # multi-step funnel reaches step 2 on every app
│   ├── superadmin.spec.ts   # all 15 super-admin routes
│   ├── league-admin.spec.ts # all 8 league-admin routes
│   ├── org-admin.spec.ts    # all 8 org-admin routes
│   ├── team-admin.spec.ts   # all 6 team-admin routes
│   └── player.spec.ts       # all 10 player routes + 4 captain console routes
├── auth/                    # Layer 2 — role/scope boundaries
│   ├── sign-in-redirect.spec.ts # anon hits a protected route → /sign-in
│   └── role-gates.spec.ts   # wrong-role users can't reach the dashboard
└── workflows/               # Layer 3 — cross-app journeys
    ├── form-builder-cascading.spec.ts   # scope=division surfaces the pickers
    ├── notification-mark-read.spec.ts   # click decrements unread strip
    ├── captain-dual-role.spec.ts        # captain pill + console gating
    ├── schedule-ical-export.spec.ts     # .ics download + VCALENDAR shape
    └── registration-state-banner.spec.ts # S1/S2/S3 banner rendering
```

The split exists so you know **what kind of bug each layer catches**:

| Layer | Catches | Speed | Mutates state |
|---|---|---|---|
| `smoke/` | "the page broke entirely" | Fast | Never |
| `auth/` | role/scope authorization regressions | Fast | Never |
| `workflows/` | integration bugs that smoke + auth miss | Slower | Never (read-only / closes dialogs without submitting) |

When a test would need to actually *create* data, tag it `[mutating]`
in the name and put it in `tests/e2e/mutations/` (not yet started — see
"Roadmap" below). Mutation specs must own their own cleanup.

## Running

```bash
# Install once
pnpm install
pnpm test:e2e:install      # downloads chromium

# Run everything against prod
pnpm test:e2e

# Just one layer
pnpm test:e2e tests/e2e/smoke
pnpm test:e2e tests/e2e/auth
pnpm test:e2e tests/e2e/workflows

# Just one app's smoke
pnpm test:e2e tests/e2e/smoke/player.spec.ts

# Watch + debug (opens the Playwright UI)
pnpm test:e2e:ui

# Run against local dev ports instead of prod
E2E_TARGET=local pnpm test:e2e
```

CI runs the full suite on every PR + push to main via
`.github/workflows/e2e.yml`. Push events sleep 90s first to let
Vercel finish redeploying.

## Smoke users

The suite signs in as five smoke users that live in production. They
were created by `.playwright-mcp/create-smoke-users.py` and look like:

| User | Email | Roles | Scope |
|---|---|---|---|
| Super Admin | `sportspulse.smoketest+sa@gmail.com` | `super_admin` | platform |
| League Admin | `sportspulse.smoketest+la@gmail.com` | `league_admin` | PPHL U16 League |
| Org Admin | `sportspulse.smoketest+oa@gmail.com` | `org_admin` | PPHL |
| Team Admin | `sportspulse.smoketest+ta@gmail.com` | `team_admin + coach` | Boston Gold Kings |
| Player + Captain | `sportspulse.smoketest+pl@gmail.com` | `player + captain` | Boston Gold Kings |

Password (all five): `SmokeTest!2026` — hardcoded in `fixtures.ts`. If
you re-run `create-smoke-users.py` (e.g. for password rotation),
update the constant.

## Adding a test

### Adding a new page (smoke layer)

1. Add the route to `ROUTES.<app>` in `fixtures.ts` with an anchor that
   appears nowhere else (avoid sidebar labels — those are global).
2. The per-app smoke spec auto-iterates the catalog; no spec edit
   needed for the basic "renders" check.
3. If the page has unique behaviour (KPI tiles, filters, modals), add
   a focused test alongside the catalog loop.

### Adding a workflow (workflows layer)

1. Pick the user role best suited to the journey.
2. Sign in via the `signIn(page, appUrl, email)` helper.
3. Drive the UI like a user would.
4. **No mutations** without cleanup. If you must create a row, undo it
   in `afterEach` or skip the test outside CI.

### Anti-patterns

- Asserting on specific data ("Boston Gold Kings has 3 players") —
  couples to seed state. Use shape assertions instead ("at least one
  roster row OR an empty-state").
- Using CSS selectors that match the chrome (sidebar labels appear on
  every page). Anchor on something page-specific.
- Sleeping. Use `waitFor*` — flake comes from sleeps.

## Roadmap

- `mutations/` layer — creates + verifies + cleans up. Needs a
  per-test cleanup pattern (set up an `afterEach` that deletes by
  smoke-test idempotency key).
- Visual regression on the home pages of each app.
- Performance budgets via Lighthouse on the player home (next-game
  hero is the LCP candidate).
- Negative captain-console test — currently we don't have a "player
  without captain" smoke user, so the negative path is untested.
- Preview-deployment URLs in CI instead of the production alias —
  tighter feedback per PR; needs the Vercel deployment_status webhook
  wired into the GitHub Action.
