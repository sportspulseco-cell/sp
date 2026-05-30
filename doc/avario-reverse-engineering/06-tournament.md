# Avario Tournament module

URL: `/Tournament/Tournament.aspx`. Page title: "Tournaments".

Tournaments in Avario are treated as a **separate first-class entity**
from regular events, with their own lifecycle, filters, and import path.

## Left-nav

### Tournaments
- **Tournaments** — list of all tournament participations this season

### Reports
- **Team Tournaments** — per-team tournament summary

### Import
- **Import Tournaments** — bulk import
- **Import Errors**

## Filter bar

- **Date Range** (from / to with day-of-week)
- **Location** — single-select from the 26-rink dropdown PLUS a
  special `No Ice` entry (for tournaments at non-Avario venues, e.g.
  away tournaments hosted elsewhere)
- **Level(s)** — multi-select
- **Team(s)** — multi-select
- **Status** — dropdown with 11 lifecycle states (see below)
- **Excel export**

## Tournament lifecycle (Status dropdown values)

Eleven states tracked per-tournament:

1. **Last Season Copy** — auto-copied from previous season's data
2. **Not Started** — placeholder, no action yet
3. **Contacted** — outreach to opponent / host done
4. **Waitlist** — team pending confirmation
5. **Confirmed** — team is in
6. **Ready for Payment** — entry-fee invoice ready
7. **Paid** — entry fee processed
8. **Refund Requested** — team withdrawing
9. **Cancelled**
10. **Unknown**
11. **Manager Entered** — submitted by team manager via portal

This is a **mini-CRM** for the tournament-entry process. Each team's
tournament participation is tracked end-to-end through these states.

## Why this matters for scheduling

Tournaments are how teams disappear for a weekend. The scheduler
needs to know:
- Which teams are at which tournament on which dates
- Are they "Confirmed" enough to schedule around them?
- Is the slot they would have used now available for someone else?

The Status dropdown effectively gates schedule consequences: a team
"Confirmed" or "Paid" blocks scheduling on those dates; a team
"Contacted" or "Waitlist" is soft (scheduler can still book).

## SportsPulse gap

SportsPulse currently has no Tournament entity. We need:

- `tournaments` table with: name, start, end, host_team_id (NULL if away),
  location_id (NULL if non-Avario), entry_fee_cents, status, created_by, ...
- `team_tournament_participations` table linking teams to tournaments
  with their own status (the 11 values above)
- Tournament-aware scheduler: when generating, exclude teams whose
  tournament status is "Confirmed" or stronger for dates that overlap
- Tournament entry-fee invoices (separate from registration fees)
- Manager-submission flow (team managers add tournament participations
  via their portal; admin approves)
