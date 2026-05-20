# SportsPulse · Org Admin — Design System (locked)

> Hallmark deference file. Read this BEFORE making any visual decision
> on `apps/org-admin-web`. Subsequent picks (genre, theme, type,
> motion) defer to it. Updates to this file are deliberate edits — not
> drift from a one-off page.

## Project facts

- **Stack** — Next.js 15 (app router), Tailwind 4, Framer Motion 11, next-themes
- **Reference DNA** — `apps/landing-web` (same monorepo). The brand reads continuous between marketing and admin.
- **Themes** — `dark` (default) and `light`, both first-class. `next-themes` with `attribute="class"`, `storageKey="sp-org-admin-theme"`, `enableSystem={false}`. The user toggles via the `ThemeToggle` in the `TopBar`.

## Tokens

All colour and font choices in the codebase MUST reference these named tokens. No inline `oklch()` / hex / `rgb()`, no bare `font-family: "Inter"`. Adding a value? Add it here first, then reference it.

### Colour — light (`:root`)

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#ffffff` | Page background |
| `--bg-subtle` | `#fafafa` | Sidebar / chrome background |
| `--surface-1` | `#ffffff` | Card / panel base |
| `--surface-2` | `#f4f4f5` | Hover surface, interactive secondary |
| `--fg` | `#0a0a0a` | Primary text |
| `--fg-muted` | `#737373` | Secondary text, captions, eyebrows |
| `--fg-subtle` | `#a3a3a3` | Tertiary, dividers, separators |
| `--border` | `#ececec` | Hairline borders |
| `--border-strong` | `#d4d4d4` | Hover borders, input outlines |
| `--accent` | `#635bff` | Brand violet — primary CTA, focus rings |
| `--accent-hover` | `#5147ff` | Accent on hover |
| `--accent-fg` | `#ffffff` | Text on accent |
| `--accent-soft` | `#efeefe` | Soft accent background (badges, tints) |
| `--success` | `#00ac4f` | Positive status |
| `--warning` | `#f5a623` | Caution status |
| `--error` | `#ee0000` | Destructive status |

### Colour — dark (`.dark`)

Surfaces shift to near-black (`--bg #050505`, `--surface-1 #0a0a0a`, `--surface-2 #131313`). Foreground inverts (`--fg #ededed`, `--fg-muted #999`, `--fg-subtle #6a6a6a`). Borders darken (`--border #1c1c1c`, `--border-strong #2a2a2a`). Accent brightens (`--accent #7a72ff` for contrast on dark surfaces). Status hues stay legible: success `#46d369`, warning `#f7b955`, error `#ff5050`. Full list lives in `app/globals.css :root` and `.dark`.

### Tint pairs (badges, icon tiles, accent stubs)

Six paired backgrounds + foregrounds — both modes defined:

```
--tint-violet-bg / --tint-violet-fg
--tint-emerald-bg / --tint-emerald-fg
--tint-amber-bg / --tint-amber-fg
--tint-blue-bg / --tint-blue-fg
--tint-rose-bg / --tint-rose-fg
--tint-cyan-bg / --tint-cyan-fg
```

`IconTile`, `StatTile`, and any tone-driven Badge MUST consume these tokens, never `bg-amber-100 text-amber-700`-style Tailwind colour utilities. The single existing offender (Communications stat strip) is on the cleanup list.

### Radii + shadows + tracking

- Border-radius — `sm: 6px · DEFAULT/md: 8px · lg: 12px · xl: 16px`. Cards/tiles use `rounded-xl`. Buttons / inputs use `rounded-md`.
- Shadows — `--shadow-sm`, `--shadow-md`, `--shadow-focus` (focus ring on inputs).
- Letter-spacing — `--tracking-tight: -0.02em`, `--tracking-tighter: -0.03em`, `--tracking-wide: 0.22em` (eyebrows).

## Typography

- **Sans** — Inter via `next/font/google`, exposed as `--font-inter`.
- **Mono** — JetBrains Mono via `next/font/google`, exposed as `--font-jetbrains-mono`.

Scale:

| Element | Class / size | Notes |
|---|---|---|
| Page H1 (PageHeader) | `clamp(34px, 4.6vw, 56px)` `font-semibold leading-[0.96] tracking-tighter` | text-balance applied |
| Section H2 (rare on admin) | `clamp(28px, 3.6vw, 44px)` | text-balance applied |
| Card title | `text-[14px] font-semibold tracking-tight` | |
| Body | `text-[14px] leading-relaxed` | `text-fg` for primary, `text-fg-muted` for secondary |
| Stat number | mono `text-4xl font-medium tabular-nums tracking-tight text-fg` | `StatNumber` primitive owns this |
| Eyebrow | mono `text-[11px] uppercase tracking-[0.22em] text-fg-muted` | `Eyebrow` primitive — used everywhere on a section |
| Caption / micro | mono `text-[10px] uppercase tracking-widest text-fg-muted` | Right-aligned meta on section rails |

## Motion

- Library — Framer Motion 11.
- Ease — `[0.22, 1, 0.36, 1]` (Hallmark's "smooth-snappy" curve). Used by `Reveal`.
- Duration — entrance reveals 0.55–0.7s, scroll-in chart draws 1.2–1.6s, spring interactions 0.3–0.4s (`stiffness: 220–240, damping: 18–22`).
- Stagger — `Reveal delay={i * 0.04}` for rapid lists, `0.06–0.08` for KPI tiles, `0.1+` for hero rows.
- `prefers-reduced-motion` honoured via `Reveal` and `Heartbeat`.

Shared motion primitives (consume from `@sportspulse/ui`, do not reimplement):
- `Reveal` — fade-up entrance with stagger.
- `Heartbeat` — bottom-of-viewport scroll-reactive waveform. Mounted once in root layout.
- `RouteProgress` — top-of-viewport progress bar. Mounted once in root layout.

## Per-page-type macrostructure

Each admin page picks one of these. The redesign respects the existing route's data and information architecture — only the visual rhythm changes.

### Dashboard (one route — `(app)/page.tsx`)

```
PageHeader (eyebrow / display title / lede / 2 secondary CTAs)
↓ space-y-14
01 · Pulse        → SectionRail + 4-up StatTile grid (Reveal stagger 0.04 → 0.16)
02 · Leagues      → SectionRail + table-shell (rounded-xl border bg-surface-1)
03 · Activity     → SectionRail + table-shell (recent registrations, top 10)
```

`SectionRail` uses a two-digit chapter index (`01`, `02`, `03`) matching landing-web's `// 01 · Autonomous Logistics` pattern. Subtitle on every rail. Meta in the right slot (`// N total`, "as of YYYY-MM-DD").

### List pages (leagues / seasons / divisions / teams / registrations / audit / forms / communications)

```
PageHeader (eyebrow / title / description / primary action button)
↓ space-y-8
SectionRail (index="01", label="<entity>", subtitle, meta="// N total")
↓
Table shell — rounded-xl border bg-surface-1
- THead row uses lowercase `font-mono text-[10px] uppercase tracking-widest text-fg-muted`
- Row dividers via Table primitive's built-in styling
- Empty state in centred EmptyState component (icon + title + description)
```

When a list page has a meaningful summary number, prepend a single `StatTile` row above the table (e.g. Finance gets 3 tiles before the invoices table). Otherwise jump straight to the table.

### Detail pages (`/<entity>/[id]`)

```
Back-link breadcrumb ("← All leagues")
PageHeader (eyebrow / title / description / status badge action)
↓
01 · Overview     → key facts grid (label + value pairs)
02 · <sub-entity> → list / table of children
03 · Activity     → audit log slice (when available)
```

Detail pages delegate most rendering to `@sportspulse/admin-pages` (`LeagueDetail`, `SeasonDetail`, etc.) — those components are shared with sa-web and already token-based.

### Form / wizard pages

```
PageHeader (eyebrow / title / description / Cancel link in action slot)
↓ space-y-6
Field sections in rounded-xl border bg-surface-1 cards
↓
Sticky footer with Cancel (ghost) + Submit (primary)
```

The shared `OrgSetupWizard` (in `@sportspulse/admin-pages`) is the canonical form layout — every new wizard should mirror its rhythm.

### Empty / loading / error states

Every list and dashboard slice has three rendered states:

- **Empty** — `EmptyState` primitive (icon + title + description + optional action). Centred inside the table shell, not above it.
- **Loading** — Next.js streaming `loading.tsx` or `<Skeleton>` placeholders. Same dimensions as the loaded state; no layout shift.
- **Error** — `.catch(() => emptyShape)` on every server-side SDK call so a page never crashes. Visible-but-empty state, not a blank screen.

## Component language

- **StatTile** (`@sportspulse/ui`) — KPI cards. Always: eyebrow label, optional IconTile, mono display number, optional hint line. Tone defaults to violet; switch to `emerald` for positive, `amber` for caution, `rose` for problems.
- **SectionRail** (`@sportspulse/ui`) — every section break. `// 01 · Label` with subtitle + meta. Reveal-wrapped.
- **Table** (`@sportspulse/ui`) — every tabular surface. Wrap in `rounded-xl border border-border bg-surface-1 overflow-hidden`.
- **Badge** (`@sportspulse/ui`) — status pills. `mono` for codes (sport, league status). `tone` matches the meaning (success / warning / danger / info / neutral).
- **PageHeader** (`apps/org-admin-web/src/components/layout/page-header.tsx`) — every page. Eyebrow always starts with `// `.
- **EmptyState** (`@sportspulse/ui`) — exactly one icon, exactly one title, one description, optional one action.

## Slop-test gates (re-checked on every redesign)

1. Pre-emit critique stamp at the top of every redesigned file (`/* Hallmark · ... · pre-emit critique: P5 H4 E5 S4 R5 V4 */`).
2. No fake browser chrome, phone frames, or IDE blocks.
3. No invented metrics (no "+47% conversion", no "trusted by 50,000+ teams"). Real numbers or a labelled placeholder.
4. Mobile verified at 320 / 375 / 414 / 768 px. No horizontal scroll. Buttons stay single-line. Image grids use `minmax(0, 1fr)`.
5. Every interactive component covers all 8 states (default / hover / focus-visible / active / disabled / loading / error / success). The `ThemeToggle` and any new buttons are scored on this.

## What lives where

- `@sportspulse/ui` — primitives shared across landing-web, sa-web, org-admin-web, team-admin-web, player-web.
- `@sportspulse/admin-pages` — composite detail-page components shared between sa-web and org-admin-web.
- `apps/org-admin-web/src/components/` — app-local primitives (sidebar, top-bar, page-header, theme provider/toggle, org-switcher).

Anything that ends up duplicated across two web apps lives in `@sportspulse/ui` or `@sportspulse/admin-pages`. No silos.

## Diversification rule (inverted for this project)

This project is `design.md`-managed. The Hallmark diversification rule (different pages should feel different) is **inverted**: every page MUST share the same system. Variety lives in section rhythm and content density, not in tokens / fonts / motion. Don't introduce a new accent on the registrations page just because it's a different page; if you need one, lift it into `design.md` first.
