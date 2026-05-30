# Avario Payment — facility payment tracker

URL: `/Payment/Payment.aspx`. Page title: "Payment".

This is the **vendor-side payment** ledger: who do we (the league)
owe for what ice time, and has each event been paid for. Distinct
from Invoicing (which is *us* billing *teams*).

## Top actions

- **Add Events** — manually add an event line for payment tracking
- **Pay Displayed Events** — bulk-mark every filtered row as paid
  (tooltip: "This button will mark all of the events displayed as Paid.")

## Filters

Standard event filters (Date, Location, Event Type, Time, Duration,
Day of Week, Notes) plus payment-status-specific:

- **Unassigned** — Yes / No / Only
- **Returned** — Yes / No (default No)
- **Paid** — Yes / No

Excel export icon.

## Summary

- **Total Filtered Cost** — `$222,365.00` displayed above the grid.
  Updates live with filters.
- **Total events filtered to defaults**: 617 records (50/page = 13
  pages).

## Grid columns

| Column | Example |
|---|---|
| `Paid` action link | one-click mark-paid |
| `Edit` action link | edit cost / notes |
| Location | `Bog Ice Arena - Rink 1` |
| Date | `05/04/2026 08:50 PM [60]` (duration in brackets) |
| Team(s) | `Snapping Carrots at Prestige Worldwide` |
| EventType | `In-House Game` |
| Paid | flag |
| Returned | flag |
| HourlyCost | `$350.00` |
| TotalCost | `$350.00` |
| Notes | free text |

## Key observations

1. **Per-event cost, not per-rink rate.** Two events at the same
   location can have different hourly costs (e.g., $350 vs $370 at the
   same rink — peak/off-peak). The cost is set per-event.
2. **Total Filtered Cost** above the grid means a scheduler can drag
   filters around and immediately see "how much do I owe Lovell for
   May?" — no separate report needed.
3. **One-click Paid action** per row + bulk "Pay Displayed Events"
   for batch reconciliation.
4. **Returned events** can be filtered separately — returned slots
   may or may not have a payment liability depending on the contract.

## SportsPulse equivalence

- `facility_payments` table: id, event_id, facility_id, hourly_cost,
  total_cost, paid_at, paid_by_user_id, payment_ref, notes
- Per-event hourlyCost on the `games`/`events` row (denormalised
  from facility rate at insert time, then editable)
- `/finance/facility-payments` page mirroring this layout:
  filter bar with totalCost summary on top, paginated grid, per-row
  Paid + Edit, bulk Pay Displayed action
- Distinct from existing `invoices` (which are team-side billing).
  This is the **other side** of the ledger: the league's own AP.
