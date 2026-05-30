# Avario vs SportsPulse — feature/UX gap analysis

> **Read [`00-pphl-painpoints.md`](./00-pphl-painpoints.md) first.**
> That doc captures the 9 operational complaints PPHL explicitly
> raised — the actual competitive brief. This file is the broader
> module-by-module map; the pain-points doc dictates priority
> within it.

This is the synthesis doc. Each Avario module (`01–15`) is captured
on its own; this file pulls them together and maps each capability
to: (a) does SportsPulse already have it, (b) is it partial, (c) is
it missing. Outcome: a build backlog ordered so PPHL can move off
Avario without regression.

## Avario at a glance

- **14 top-nav modules**: Home · Setup · Purchase · Schedule ·
  Tournament · Analyze · Review · Publish · Payment · Invoicing ·
  Reports · Reconcile · Available · Process
- Single-tenant-feeling but actually multi-season: one org (PPHL)
  scopes to ~30 seasons across regions × years
- ASP.NET WebForms, server-side rendered, no SPA
- Postback-driven left-nav (each click is a full reload)
- Filter-first paradigm everywhere — every grid has the same
  filter-bar pattern (Date Range + entity multi-selects + Submit)
- **Strength**: depth of integration (11 SRM platforms in Publish
  + 4 in Reconcile + QuickBooks + Google Calendar) and depth of
  reports (22 distinct reports)
- **Weakness**: dated UI, postback latency, no mobile, no real
  team-self-service beyond Available, no role-segmented surface
  (the operator sees everything)

## Module-by-module gap

### 1. Setup (`02-setup-data-model.md`)
**Avario**: 30+ sub-pages across 8 groups — User Setup, Season
Setup, Levels, Teams, Team Integration, Locations, Other Settings,
Import.

**SportsPulse today**: `org-setup-wizard` covers Org → Season →
Division → Team in ~5 steps. Locations + Facilities exist.

**Gap**:
- ~100 season-config knobs from `03-season-settings.md` are not
  exposed in our wizard (game change approval matrix, daily time
  windows, manager-page toggle set, integration credentials,
  tournament-config, billing+invoicing config, etc.)
- Team Integration sub-page (per-team mapping to SE/Crossbar/etc)
- Levels (age group) as a separate tier we currently don't model
  cleanly
- Bulk Import sub-page

**Build priority**: HIGH. Without these knobs PPHL can't migrate.

---

### 2. Purchase (`05-purchase.md`)
**Avario**: Demand-forecasting and ice-time procurement planner
**upstream** of scheduling. League knows "we need 2,202 hours
across the season" before it places any team.

**SportsPulse today**: Nothing. We start at the scheduling tier.

**Gap**: Full module. Tables: `purchase_orders`, `facility_quotes`,
`hours_targets_by_level`. Surface: `/scheduling/purchase`.

**Build priority**: MEDIUM. League can work around by manually
adding events, but Avario users will miss this.

---

### 3. Schedule (`04-schedule-assignment.md`)
**Avario**: 506-event grid with 16 filter dimensions. Bulk actions
(Move, Assign, Tag, Delete, Mark Paid). Drag-and-drop assignment.

**SportsPulse today**: `superadmin-web/scheduling` shows games per
season but lacks the filter density and bulk-action affordances.

**Gap**:
- Multi-dimensional filter bar (16 dims — currently ~4)
- Bulk multi-select with batch actions
- Drag-and-drop reassignment between teams / time slots
- "Locked" events concept (manually-pinned slots that schedule
  generation can't touch)

**Build priority**: HIGH. This is the daily-driver page for
scheduling staff.

---

### 4. Tournament (`06-tournament.md`)
**Avario**: 11-state lifecycle (Last Season Copy → Confirmed →
Paid → Cancelled · etc). Hosted vs. attending. Per-tournament
ice purchases.

**SportsPulse today**: Tournaments table exists but no lifecycle,
no hosted-vs-attending distinction, no per-tournament purchases.

**Gap**: State machine + hosted/attending toggle + tournament-
specific event subtype.

**Build priority**: MEDIUM. PPHL has tournaments but they're
seasonal, not weekly.

---

### 5. Analyze / Audit (`07-analyze-audit.md`)
**Avario**: Constraint violation engine with 9 categories,
~8000 individual issues across a 506-event schedule. Errors,
required-day adherence, unassigned events, game balancing,
in-house game balancing, gap balancing, hours allocated, other
balancing, reporting.

**SportsPulse today**: Nothing. Schedule has no health-check
surface.

**Gap**: Entire violation engine. Each category is a separate
SQL query / rule. Surface: `/scheduling/analyze`.

**Build priority**: HIGH. Without this, the scheduler is flying
blind — there's no way to assess schedule quality after
generation.

---

### 6. Review (`08-review.md`)
**Avario**: 5 printable schedule layouts (Teams Weekly, All
Events, Location Weekly, Locations Daily, Scheduling Meeting).
Filter-driven PDF export.

**SportsPulse today**: Game list views exist; PDF / printable
formats do not.

**Gap**: PDF rendering + the 5 specific layouts.

**Build priority**: MEDIUM. Rinks request printed schedules
weekly; this is real-world workflow.

---

### 7. Publish (`09-publish.md`)
**Avario**: 11 integrations (9 outbound — SE, Crossbar,
GameSheet, Sprocket, Arbiter, RecTrac, TeamSnap, LeagueApps,
Horizon, Google Calendar, QuickBooks; 5 inbound paths). 5 email
broadcast types.

**SportsPulse today**: Zero external integrations.

**Gap**: All 11 integrations + broadcast emails. Each integration
has its own adapter; broadcast is a templated email service.

**Build priority**: VERY HIGH. PPHL's referees use Arbiter, their
public website is SportsEngine. Without these, PPHL can't migrate.
Prioritize: **SportsEngine (Season) > Arbiter > Google Calendar
> QuickBooks > GameSheet > Crossbar > rest**.

---

### 8. Payment (`10-payment.md`)
**Avario**: Vendor-side AP ledger. Per-event hourly cost, mark-
paid, Pay-Displayed-Events bulk action, $222K filtered example.

**SportsPulse today**: No AP concept. We have `invoices` (AR) but
not facility_payments (AP).

**Gap**: `facility_payments` table + UI.

**Build priority**: HIGH. Adult-rec league pays $200K+/season to
rinks — this can't be tracked in spreadsheets at scale.

---

### 9. Invoicing (`11-invoicing.md`)
**Avario**: Team-side AR. QuickBooks push, email PDF, manual
entry. Open/Paid/Voided. Sent-to-Contact + Sent-to-Finance
flags.

**SportsPulse today**: `invoices` exists for registration billing
only.

**Gap**:
- Add `invoice_type` enum: `registration` (existing) /
  `season_usage` (new)
- Hours-based billing line items
- QuickBooks adapter (overlaps with Publish work)
- Email PDF rendering
- Sent-to-Contact / Sent-to-Finance dual tracking

**Build priority**: HIGH. This is how league bills teams; it's
revenue.

---

### 10. Reports (`12-reports.md`)
**Avario**: 22 reports across 7 categories — Teams (10), Levels
(2), Events (2), Single Week (3), Locations (4), Games (4),
Workers (1).

**SportsPulse today**: ~4 admin dashboards, no scheduled reports.

**Gap**: Substantial. Prioritize the 4 most-used:
1. **Team Summary** (per-team hours/touches/spend)
2. **Year-End Statement** (CFO-facing)
3. **Single-Week Location Schedule** (rink-facing)
4. **Worker Report** (referee payroll)

Defer the remaining 18 to a customisable Reports Builder.

**Build priority**: HIGH (top 4) / LOW (the rest).

---

### 11. Reconcile (`13-reconcile.md`)
**Avario**: Drift detection between Avario and external systems.
File-import diff + per-integration website-diff (SE Sport, SE
Season, Crossbar, LeagueApps). Team Translation + Location
Translation crosswalks.

**SportsPulse today**: Nothing. We don't even Publish yet, so
Reconcile is N/A until Publish ships.

**Gap**: Full module. Tables: `external_event_mappings`,
`external_team_map`, `external_location_map`.

**Build priority**: LOW initially; rises to HIGH once Publish is
live (publishing without reconcile = silent drift).

---

### 12. Available (`14-available.md`)
**Avario**: Team-self-service ice request flow. Browse weekly
unassigned events, request a basket, submit for league approval.

**SportsPulse today**: Nothing. Schedules are admin-driven only.

**Gap**: Full module. Tables: `ice_requests`. UI in team-admin-web
+ approval inbox in superadmin-web.

**Build priority**: MEDIUM. Adult-rec leagues love self-service;
PPHL captains will adopt fast. Distinguishing feature vs Avario:
ours can be mobile-first.

---

### 13. Process (`15-process.md`)
**Avario**: Async job inbox. Read-only surface for tracking
long-running operations.

**SportsPulse today**: One cron job (season auto-transition), no
operator surface.

**Gap**: `background_jobs` table + `/operations/jobs` page.

**Build priority**: MEDIUM. Required as soon as we add a second
async job (which happens with the first Publish adapter).

---

## Cross-cutting themes

### A. Multi-tenant + multi-season
Avario's data model is **org → seasons → divisions → teams** with
seasons as the dominant pivot. Every filter, every report, every
page is season-scoped. PPHL has 30+ seasons across years and
regions in the same org.

**SportsPulse** matches this shape — our `seasons` table is
first-class. Good news: no migration needed on this.

### B. Filter-first UX
Every Avario page is a filter bar over a grid. Same pattern,
same component, season-aware.

**SportsPulse opportunity**: Build a shared `<FilterBar>`
primitive in `packages/ui` that every admin page can consume.
Avoids the silo problem (CLAUDE.md cardinal rule) and gives us
Avario-tier consistency for free.

### C. Bulk actions everywhere
Schedule, Payment, Invoicing, Available — all have multi-select
with bulk operations. This is a workflow truth: scheduling work
happens in batches.

**SportsPulse**: We have multi-select in zero places. Adding it
to the shared table primitive is a force multiplier.

### D. Per-event cost, per-event everything
Avario denormalises a lot — every event row carries its own
hourly cost, paid status, returned flag, notes. This is
deliberate: real-world ice slots have peak/off-peak pricing, ad-hoc
discounts, last-minute notes. A normalised "look up rate from
facility" model can't represent this.

**SportsPulse**: Our `games` row needs `hourly_cost`,
`total_cost`, `paid_at`, `returned` columns. Migration required.

### E. Integration density
11 outbound + 4 reconcile + QuickBooks + Google Calendar = 17
adapters in Avario. SportsPulse has 0.

This is **the** competitive moat to crack. Without SE / Arbiter /
QuickBooks at minimum, PPHL stays on Avario.

### F. Operator vs team surface
Avario has one operator surface (the 14 tabs) and one
team-self-service tab (Available). League admin and team captain
log into the same app.

**SportsPulse advantage**: We've already split team-admin-web,
player-web, org-admin-web. We can show captains a focused
team-only view by default, not the firehose. This is a UX
*upgrade* over Avario, not a parity feature.

## Migration-blocking checklist

In order to give PPHL a credible "switch from Avario" offer, the
**minimum viable** feature set is:

1. Setup parity for season config (the ~100 knobs)
2. Schedule with multi-dimensional filters + bulk actions
3. Analyze (constraint violation engine — at least Errors +
   Unassigned + Hours Allocated)
4. Publish — SportsEngine (Season) + Arbiter at minimum
5. Reconcile — file-import diff at minimum
6. Payment + Invoicing
7. Reports — Team Summary + Year-End Statement + Single-Week
   Location Schedule + Worker Report
8. Process job inbox

Tournament, Purchase, Available, full Reports suite, Review PDFs,
and the rest of the integrations are **post-migration polish**.

## Strategic advantages we should keep

1. **Modern stack** — Next.js 15 + Tailwind + Supabase. Faster,
   responsive, mobile-friendly. Avario can't catch up here
   without a full rewrite.
2. **Role-segmented apps** — captains/players have their own
   focused surface. Avario forces everyone into the firehose.
3. **Public registration funnel** — Avario has team-side
   registration but no player free-agent flow. We do.
4. **Audit interceptor** — every mutation logged. Avario shows no
   evidence of this (no audit log surface anywhere in the 14
   tabs).
5. **Hallmark design system** — vastly more modern than Avario's
   2013-era WebForms.

## Recommended next steps

**The 9 pain points from [`00-pphl-painpoints.md`](./00-pphl-painpoints.md)
take priority over the module-driven ordering.** That order is:

1. One-source-of-truth Publish (Pain #1)
2. Inline conflict resolver (Pain #9)
3. Locked-fixture import + generator (Pain #7)
4. Time-slot balancing constraint (Pain #8)
5. Parity window engine (Pain #6)
6. Playoff blocks + bracket + auto-advancement (Pain #3)
7. Tiebreaker engine with N-way handling (Pain #5)
8. Direct rink notifications, no vendor relay (Pain #2)
9. Dynamic tournament tier reassignment (Pain #4)

Once those 9 are closed, return to the module-driven backlog:

10. **Audit-engine expansion** — extend the conflict surface from
    #2 above into the full 9-category Analyze module (see
    `07-analyze-audit.md`)
11. **Schedule filter+bulk overhaul** — drop the silos, build the
    shared FilterBar+BulkActions primitive
12. **SportsEngine (Season) Publish adapter** — second integration
    after rink-direct notifications
13. **Payment + Invoicing tables + UI** — unblocks finance ops
14. **Top-4 reports** — Team Summary first
15. **Available team-self-service** — UX differentiator
16. **Process job inbox** — required by Publish/Reconcile
17. **Reconcile** — pairs with Publish

Everything else is incremental from there.
