# Avario Purchase — ice-time purchasing planner

URL: `/Purchase/Summary.aspx`. Page title: "Purchase Summary".

This module helps the league **plan its ice-time buy** before the
scheduler runs. The output is "how many hours of ice do we need to
purchase, on which days, at which rinks, to satisfy every team's
contracted hours."

## Left-nav

### Top action
- **Analyze Purchases** (button) — recompute the purchase summary
  from current team/level contracts.

### Purchases
- **Purchase Summary** — current view
- **Date Overrides** — manual overrides for specific dates (holidays,
  facility closures, special events)

### Importing
- **Import Events** — feed historical events into the planner
- **Import Errors** (badge with count)

### Reporting
- **Team Hours Allocation** — per-team hour budget vs allocation
- **Event Counts** — game counts per division / team
- **Location Counts** — how many events per location
- **Holiday Overlaps** — which events fall on holidays

## Main view: Purchase Summary filters

- **Date Range** (from / to)
- **Min Purchase Gap** — minimum gap between events at the same
  location (purchase enough buffer between bookings)
- **Max Purchase Gap** — maximum gap (don't over-buy idle time)
- **Day of Week** — single-select dropdown
- **Summarize Weekdays** (✓) — collapse Mon-Fri into a single bucket
- **Excel export** (icon)

Empty-state on a fresh view: *"No Purchase Details. Please Run the
Analysis"* — i.e., user must click **Analyze Purchases** to populate.

## Reads / takeaway

Purchase is essentially a **demand-forecasting screen** that runs
*before* scheduling. The flow:

```
1. Set up teams + divisions + their per-season hour budgets
2. Run "Analyze Purchases" → see how many hours per day/location
   you need to acquire
3. Use the breakdown to negotiate ice contracts with rinks
4. Import the contracted slots back as Events
5. Generate the actual schedule (Schedule tab)
```

SportsPulse has **no equivalent today**. This is a real moat:
schedulers don't think in events — they think in *ice acquisition*,
and Avario gives them the math.

## SportsPulse equivalence ideas

- A "Capacity Planner" module in `apps/superadmin-web` or
  `apps/org-admin-web` that takes (team list, division hour
  contracts, holiday calendar, location preferences) and outputs:
  - Hours needed per week per location
  - Min/max purchase gaps respected
  - Holiday-overlap warnings
  - Export to Excel for vendor negotiation
- This sits *upstream* of the existing schedule/games schema —
  it's a planning artifact, not a live event.
