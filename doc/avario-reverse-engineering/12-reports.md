# Avario Reports — analytics & operational read-outs

URL: `/Reports/Reports.aspx`. Default landing report: **Team Summary**.

The Reports tab is Avario's analytics surface — every other module
*writes* state; Reports *reads* it. 22 distinct reports grouped into
7 categories. All reports are filter-driven (Date Range, Level, Team,
Team Type at minimum) and every report has an Excel export icon.

## Left-nav structure

### Teams (10 reports)
- **Team Summary** (default) — per-team hours/touches/spend roll-up
- **Touch Summary** — per-team touch counts (a "touch" = one team's
  exposure to one event, shared events count once per participant)
- **Team Tournaments** — tournaments each team participated in
- **Team Monthly Spend** — month × team financial breakdown
- **Year-End Statement** — full-season per-team financial statement
- **Time Slot Distribution** — how each team's ice time is distributed
  across day-of-week × time-of-day buckets
- **Weekly Event Count** — team × calendar-week event counts
- **Team Location Counts** — per-team count of events per location
- **Team Facility Counts** — per-team count of events per facility
  (facility = parent of location, e.g., Bog Ice Arena facility owns
  Bog Ice Arena - Rink 1 and Rink 2 locations)
- **Team Event Type Counts** — per-team count by event type
  (Game / Practice / Clinic / etc.)

### Levels (2 reports)
- **Level Summary** — roll-up at the level (age group / division) tier
- **Level Hours & Touches** — hours and touches aggregated per level

### Events (2 reports)
- **Event Counts** — totals by event category
- **Event Tag Assignments** — events × tags they carry (tags are a
  free-form labeling system on top of the event taxonomy)

### Single Week (3 reports)
- **Location Schedule** — printable one-week view per location
- **Locker Rooms** — locker-room assignments for a single week
- **Worker Assignments** — referee/scorekeeper assignments for a
  single week

### Locations (4 reports)
- **Location Financials** — per-location revenue/cost view
- **Location Event Counts** — total events per location
- **Unassigned Counts** — count of unassigned events per location
  (operational hygiene — where do we still have un-allocated ice?)
- **Holiday Overlaps** — events that land on configured holidays
  (flags potential player-availability conflicts)

### Games (4 reports)
- **Game Schedule** — public-facing game schedule (mirrors what's
  published to SRM consumers)
- **Game Summary Report** — per-game financial / hours breakdown
- **Non-B2B Games** — games NOT back-to-back with another game at
  the same location (impacts ref pairing efficiency — refs travel
  for one game vs. two)
- **Non-B2B Games (Refs)** — refs assigned to non-B2B games (who's
  affected by the inefficiency)

### Workers (1 report)
- **Worker Report** — assignment + pay totals per worker (referees,
  scorekeepers, timekeepers)

## Filter bar (Team Summary example)

- **Date Range** — start `05/04/2026` (Mo abbreviation indicates
  week-start anchor) to end
- **Level(s)** — multi-select (mirrors Setup → Levels)
- **Team(s)** — multi-select
- **Team Type** — dropdown: Clinic · Hosted Tournament · In-House ·
  None · Other · Pre-Tryout · Travel · Tryout
- Submit (refresh) + Eraser (clear) buttons
- Excel export icon

## Team Summary grid columns

13 columns of analytics per team row:

| Column | Meaning |
|---|---|
| Team | Team name |
| Solo Count | Events the team has the rink to itself |
| Shared Count | Events shared with another team (typically games) |
| Game Count | Game-type events |
| Purchased Touches | Touches the team paid for upfront |
| Total Touches | Touches the team has actually consumed |
| Target Hours Allocated | Hours the season plan budgeted them |
| Actual Hours Assigned | Hours scheduled so far |
| Hours Assigned Variance | Actual − Target (negative = behind) |
| Team Hours (Shared as Solo) | Shared events normalised to solo equivalent |
| Team Spend | What they've spent so far |
| Team Budget | What was budgeted |
| Team Budget Variance | Spend − Budget |

## Sample data observations

From the live PPHL 2025-2026 South Shore Boston Metro season:

- `.Draft League`, `.Pick Up`, `.Skills`, `.Sublet` — leading-period
  team names are **placeholder/admin teams** (sorted to top
  alphabetically). They have 2.0 target hours, 0 actual, -2.0 variance
  — these are housekeeping rows the league uses to soak up
  unassigned ice and skills/sublet bookings.
- Active teams like `4th Period Hockey Club` show 14 games / $2,575
  spend; `Bandits` show 13 games / $2,300 spend — game cost ≈ $175 per
  game touch.
- Most teams have a **default 2.0 target hours** that hasn't been
  consumed — looks like a season-wide default that's never been
  customised on a per-team basis. Big anti-pattern in the data:
  the planning column is largely meaningless because nobody
  bothered to set it.

## Key observations

1. **22 reports** — a substantial analytics surface. SportsPulse
   currently has ~4 admin dashboards. There's a gap.
2. **Single Week reports are a distinct UX concept** — operationally
   the league prints "this week's schedule per location" / "this
   week's locker rooms" / "this week's worker assignments" as
   stand-alone PDFs. Different cadence from season-long reports.
3. **Touches** as a unit of measure (solo + shared) is core to
   billing. Touch = participation in one event; shared event splits
   touches between participants.
4. **Non-B2B Games** is a niche but real metric — back-to-back game
   scheduling at the same location optimises ref travel. Avario
   surfaces this as a first-class report.
5. **Holiday Overlaps** — proactive conflict detection between the
   schedule and configured holidays (already a setup setting, see
   `03-season-settings.md`).
6. **Touch Summary** ≠ **Team Summary** despite both being team-level
   reports — distinct enough to warrant separate destinations,
   meaning the underlying queries / use-cases differ.

## SportsPulse equivalence

Build a `/finance/reports` and `/operations/reports` surface mirroring
the 7-category nav. Implementation strategy:

- Reports module reads from existing `games`, `events`,
  `facility_payments`, `invoices`, `team_memberships` tables — no new
  source-of-truth tables required (analytics is derived).
- Build a generic `ReportRunner` service that accepts:
  - report key (enum: `team_summary` | `touch_summary` | ...)
  - filter set (date range, level ids, team ids, event types)
  - output (HTML grid | XLSX | PDF for single-week reports)
- Materialised view for hot reports (Team Summary, Touch Summary)
  refreshed via cron — these are the dashboards admins live in.
- **Don't** ship 22 reports day 1. Prioritise:
  1. Team Summary (most-used)
  2. Year-End Statement (CFO ask)
  3. Single-Week Location Schedule (rinks need these printed)
  4. Worker Report (referee payroll)
- The remaining 18 can be deferred to admin-customisable saved
  filters on a `Reports Builder` — more flexible than hand-rolling
  each one.
