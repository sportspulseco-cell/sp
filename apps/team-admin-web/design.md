# SportsPulse · Team Admin — Design System (locked)

> Hallmark deference file. Read this BEFORE making any visual decision on
> `apps/team-admin-web`. The locked authority is
> **`apps/org-admin-web/design.md`** — this file only documents the deltas.
> If a rule isn't redefined here, the org-admin file governs.

## Why a separate file

Team-admin-web is the **captain / coach console** — narrower in scope
than org-admin (one team, not a whole league) but wider than player-web
(roster management, dues collection, free-agent claims, lineup
assembly). All four web surfaces share the **same locked tokens,
typography, motion curve, and primitive vocabulary** — no separate
aesthetic, no parallel system.

What's different here:

- The console is **single-team-scoped** (no league switcher, no
  cross-org views).
- Most pages have **one or two write actions** per route (add player,
  drop player, send invite, finalize lineup).
- The wizard chain in `(app)/captain/register/setup/[entryId]` is the
  longest interactive flow in the app — its rhythm mirrors org-admin's
  `OrgSetupWizard` exactly.

## Project facts

- **Stack** — Next.js 15 (app router), Tailwind 4, Framer Motion 11, next-themes
- **Reference DNA** — `apps/landing-web` + `apps/org-admin-web` (in that
  order).
- **Themes** — `dark` (default) and `light`, both first-class. Provider:
  `<ThemeProvider storageKey="sp-team-admin-theme">` from `@sportspulse/ui`.
  Toggle: `<ThemeToggle />` from `@sportspulse/ui` in the `TopBar`.

## Tokens, typography, motion

**Defer to [`apps/org-admin-web/design.md`](../org-admin-web/design.md).**
The CSS in `app/globals.css` mirrors org-admin's values verbatim. Any
addition must land in org-admin first, then propagate here.

The same tint pairs and semantic status tokens are the ONLY way to
express colour. The Phase 2 sweep (2026-05-21, commit `ada214c`) cleared
all hardcoded Tailwind colour utilities — the rule going forward is
**zero new offenders**.

## Per-page-type macrostructure

### Dashboard (one route — `(app)/page.tsx`)

The captain dashboard switches view based on season phase. Two
canonical layouts:

**Registration-open view** (`RegistrationOpenView`)

```
PageHeader (eyebrow / title / lede / "Register team" CTA)
↓ space-y-12
01 · Action       → countdown + register CTA card
02 · Status       → roster snapshot stat tiles
03 · Communications → recent league notices
```

**Post-season view** (`PostSeasonView`)

```
PageHeader (eyebrow / title / lede)
↓ space-y-12
01 · Final standings → table-shell
02 · Team stats     → stat tile grid
03 · Communications → recent league notices
```

Both views use the same SectionRail chapter rhythm as org-admin's
dashboard. The countdown component uses `--accent` for the urgent
numeric block (NEVER a fresh hex value).

### List pages (roster / lineups / free agents / join requests / invites)

```
PageHeader (eyebrow / title / description / primary action button)
↓ space-y-8
SectionRail (index="01", label="<entity>", subtitle, meta="// N total")
↓
Table shell — rounded-xl border bg-surface-1
  - THead row uses mono `text-[10px] uppercase tracking-widest text-fg-muted`
  - Row dividers via Table primitive's built-in styling
  - Empty state via centred EmptyState component
```

When a list page has a meaningful summary number (roster size, free
agent count), prepend a single StatTile row above the table.

### Form / wizard pages

```
PageHeader (eyebrow / title / description / Cancel link in action slot)
↓ space-y-6
Field sections in rounded-xl border bg-surface-1 cards
↓
Sticky footer with Cancel (ghost) + Submit (primary)
```

The captain `RegisterWizard` (`(app)/captain/register/setup/[entryId]/register-wizard.tsx`)
is the canonical multi-step form. Its phase ordering matches the
stepper numbers exactly (Cardinal-rule #1 from CLAUDE.md — never visit
phases out of order).

### Modal forms (add player / drop player / add guest / initiate transfer)

```
Modal shell (rounded-lg border bg-surface-1)
  ├ Title row (text-fg, font-semibold)
  ├ Description (text-fg-muted, text-sm)
  ├ Field stack (space-y-4)
  └ Footer row (Cancel ghost + Submit primary, right-aligned)
```

Each modal in the roster page (add-player / drop-player / add-guest /
initiate-transfer) follows this rhythm. Destructive actions (Drop,
Transfer) use `<Button variant="danger">` — never inline red-tinted
chrome.

## Component language

Same primitives as org-admin. The deltas:

- **Countdown** (`apps/team-admin-web/src/components/dashboard/countdown.tsx`)
  — registration deadline display. Uses `--accent` for the numeric
  block, mono digits, tabular-nums.
- **RegistrationOpenView / PostSeasonView**
  (`apps/team-admin-web/src/components/dashboard/`) — the two
  dashboard variants. Both are server components composing
  `@sportspulse/ui` primitives.
- **RegistrationBanner**
  (`apps/team-admin-web/src/components/layout/registration-banner.tsx`)
  — top-of-app banner shown when the team has an incomplete
  registration. Uses `<Alert tone="warning">` from `@sportspulse/ui`.
- **Captain badge** (in `TopBar`) — tokenized amber tint pair
  (`--tint-amber-bg` / `--tint-amber-fg`). Only renders when the
  signed-in user holds the captain role for the active team.

Everything else — StatTile, SectionRail, Table, Badge, PageHeader,
EmptyState, Alert, Button — comes from `@sportspulse/ui` and is
governed by org-admin's `design.md`.

## What lives where

- `@sportspulse/ui` — primitives shared across all 5 web apps.
- `apps/team-admin-web/src/components/` — app-local primitives
  (sidebar, top-bar, page-header, dashboard variants, registration
  banner).
- `apps/team-admin-web/src/lib/api/` — server + browser SDK bindings.

No silos. If a modal pattern or table shape recurs in player-web or
org-admin-web, lift it into `@sportspulse/ui` in the same PR.

## Slop-test gates

Same five gates as org-admin. The one that matters most here:

> **No invented roster numbers.** No "+12% win rate this season", no
> "ranked top 10 in your league". Real numbers (wins, losses, dues
> outstanding) or labelled placeholders only.

## Cross-app sign-in contract

Team-admin-web has its **own sign-in landing** (separate Supabase
session per app, per repo owner directive 2026-05-09) and its own
role-gate middleware (must hold `captain` or `coach` role on at least
one team). The sign-in screen mirrors org-admin's typography and
motion exactly — diverging the auth surface is not allowed.

## Domain-term contract

Labels in the UI must use the **canonical domain term** (Cardinal-rule
#5 from CLAUDE.md). The audit field name `maxGuestPlayersPerGame`
renders as "Max guest players per game" — verbatim, never paraphrased,
never shortened to "Max guests". The roster screen, dues screen, and
lineup editor all source their copy from the kernel-level enum labels —
no inline string literals for status / role / position names.
