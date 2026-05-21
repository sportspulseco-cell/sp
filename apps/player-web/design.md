# SportsPulse · Player — Design System (locked)

> Hallmark deference file. Read this BEFORE making any visual decision on
> `apps/player-web`. The locked authority is **`apps/org-admin-web/design.md`** —
> this file only documents the deltas. If a rule isn't redefined here,
> the org-admin file governs.

## Why a separate file

Player-web is one of three role-targeted consoles in the SportsPulse
monorepo (player, team-admin, org-admin) plus the god app (superadmin).
All four share the **same locked tokens, typography, motion curve, and
primitive vocabulary** — no separate aesthetic, no parallel system.

What's different here is the **audience**: end-users registering and
checking in on their team, not admins managing leagues. So:

- The console is narrower in scope (no audit logs, no wizard chains, no
  cross-org switcher).
- Pages are mostly read-mode with one or two write actions per route
  (claim, sign waiver, pay dues, RSVP).
- Status surfaces (compliance, payments, parental consent) carry more
  visual weight than admin lists — they are the primary signal the
  player came to check.

## Project facts

- **Stack** — Next.js 15 (app router), Tailwind 4, Framer Motion 11, next-themes
- **Reference DNA** — `apps/landing-web` + `apps/org-admin-web` (in that
  order). Brand reads continuous from marketing → admin → player.
- **Themes** — `dark` (default) and `light`, both first-class. Provider:
  `<ThemeProvider storageKey="sp-player-theme">` from `@sportspulse/ui`.
  Toggle: `<ThemeToggle />` from `@sportspulse/ui` in the `TopBar`.

## Tokens, typography, motion

**Defer to [`apps/org-admin-web/design.md`](../org-admin-web/design.md).**
The CSS in `app/globals.css` mirrors org-admin's values verbatim. Any
addition must land in org-admin first, then propagate here — never the
other way round.

The same tint pairs (`--tint-{violet,emerald,amber,blue,rose,cyan}-{bg,fg}`)
plus semantic status tokens (`--success`, `--warning`, `--error`) are the
ONLY way to express colour. No `bg-amber-100 text-amber-700`-style
Tailwind utilities anywhere in player-web — the Phase 2 sweep
(2026-05-21, commit `ada214c`) cleared all 100+ existing offenders.

## Per-page-type macrostructure

Each player page picks one of these. The redesign respects the existing
route's data and information architecture — only the visual rhythm changes.

### Dashboard (one route — `(app)/page.tsx`)

```
NextGameHero (full-bleed accent surface — next scheduled game)
↓ space-y-12
01 · Status        → SectionRail + 3-up StatTile grid (compliance · payments · roster slot)
02 · Schedule      → SectionRail + table-shell (upcoming games)
03 · Notifications → SectionRail + recent feed (top 5)
```

The hero is the one full-bleed surface in the app — uses `--accent` /
`--accent-fg` tokens (NOT new hex values). Everything below the hero
follows the same chapter-rail rhythm as org-admin's dashboard.

### Status pages (compliance / payments / registrations / notifications)

```
PageHeader (eyebrow / title / description / no primary action — status is read-mode)
↓ space-y-8
SectionRail (index="01", label="<status>", subtitle, meta="// updated <date>")
↓
List or alert-strip — rounded-xl border bg-surface-1
  - Use the <Alert> primitive from @sportspulse/ui for state callouts
    (warning / error / success / info). Never inline-roll a destructive
    overlay.
  - Tone resolves to `--tint-*-bg` / `--tint-*-fg` (see Phase 2 sweep).
```

### Form pages (free-agent registration, profile edit, parental consent)

```
PageHeader (eyebrow / title / description / Cancel link in action slot)
↓ space-y-6
Field sections in rounded-xl border bg-surface-1 cards
↓
Sticky footer with Cancel (ghost) + Submit (primary)
```

Same wizard rhythm as org-admin. The captain console (which lives in
`team-admin-web`, not here) carries the wizard chains — player-web only
hosts terminal-step forms (one screen, submit, done).

## Component language

Same primitives as org-admin. The deltas:

- **NextGameHero** (`apps/player-web/src/components/dashboard/next-game-hero.tsx`)
  — player-specific. Full-bleed `--accent` surface with date, opponent,
  rink, RSVP button. The only full-bleed surface in the app.
- **CaptainConsoleBanner** (`apps/player-web/src/components/captain-console-banner.tsx`)
  — shown only when the player also holds a captain role on any team.
  Cross-links to `sp-team-admin.vercel.app` (never to sp-superadmin).
- **RegistrationStateBanner** (`apps/player-web/src/app/(app)/registration-state-banner.tsx`)
  — top-of-app banner when the player's registration is in a transitional
  state (pending review, pending offline payment, etc.). Uses
  `<Alert tone="info">` from `@sportspulse/ui`.

Everything else — StatTile, SectionRail, Table, Badge, PageHeader,
EmptyState, Alert — comes from `@sportspulse/ui` and is governed by
org-admin's `design.md`.

## What lives where

- `@sportspulse/ui` — primitives shared across all 5 web apps.
- `apps/player-web/src/components/` — app-local primitives (sidebar,
  top-bar, page-header, next-game-hero, captain-console-banner,
  registration-state-banner).
- `apps/player-web/src/lib/api/` — server + browser SDK bindings.

No silos. If something turns out to be useful for team-admin-web or
org-admin-web too, lift it into `@sportspulse/ui` in the same PR.

## Slop-test gates

Same five gates as org-admin. The one that matters most here:

> **No invented metrics on the player dashboard.** No "+47% improvement
> this week", no "trusted by 50,000+ players". Real numbers
> (games played, dues paid) or labelled placeholders only.

## Cross-app sign-in contract

Player-web has its **own sign-in landing** (separate Supabase session per
app, per repo owner directive 2026-05-09) and its own role-gate
middleware. The sign-in screen mirrors org-admin's typography and motion
exactly — same Inter / JetBrains Mono, same Framer Motion entrance
curve, same form rhythm. Diverging the auth surface is not allowed.
