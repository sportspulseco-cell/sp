# Avario Schedule (Assignment) — core scheduler UI

URL: `/Assignment/Assignment.aspx`. Page title: "Schedule".

This is where the actual *scheduling* happens — the operational heart
of Avario. The left-nav splits scheduler actions into three groups.

## Left-nav: scheduler actions

### Events
- **Schedule** — view the event grid (default view of this page)
- **Add Events** — bulk-add a set of events to the schedule
- **Create Events** — single-event create
- **Copy Events from LY** — clone last year's schedule as the starting
  point for this season
- **Undo Changes** — undo most-recent batch
- **Bulk Updates** — multi-row edit
- **Home-Away Teams** — set / flip home-away on multiple events
- **Event Changes** — manager-submitted change requests review queue
- **Reschedule Events** — move events to new dates/times

### Generation (the AUTOMATED scheduler)
- **Generate Schedule** — run the optimiser to fill empty slots with
  team events
- **Recurring Assignments** — fixed weekly assignments (Team X always
  plays Rink Y on Tuesdays)
- **Assign Game Pairings** — pair home/away teams for league games
- **Assign Tourney Brackets** — fill tournament brackets
- **Confirm Assignments** — commit pending assignments
- **Combine Events** — merge two slots into one (e.g. shared-ice)
- **Reset Events** — clear all assignments and start over

### Importing
- **Import Events** — bulk import schedule from external source
- **Import Errors** — log of failed imports (badge with count, e.g. `(0)`)

### Other
- **Tag Events** — bulk-tag selected events
- **Assign Participants** — bulk roster assignment to events
- **Assign Workers** — bulk assign referees / scorekeepers
- **Assign Resources** — bulk assign sub-resources (rink sheet, etc)

## Filter bar (everything is filterable)

16 filter dimensions stacked on the main view, each with autocomplete
or dropdown:

- **Date Range** (from / to, with day-of-week display)
- **Location(s)** — multi-select text autocomplete
- **Level(s)** — multi-select
- **Team(s)** — multi-select
- **Event Type(s)** — multi-select
- **Time Range** (from / to)
- **Duration Range** (from / to)
- **Team Type** — Clinic · Hosted Tournament · In-House · None · Other ·
  Pre-Tryout · Travel · Tryout
- **Day of Week**
- **Tag** — BMA · BMB1 · BMB2 · BMC1 · BMC2 · BMD1 · BMD2 ·
  Norwood Womens · Skills · SS50+ · SSB · SSC1 · SSC2 · SSD1 · SSD2 ·
  SSD3 · No Tag (these are the divisions abbreviated as tags)
- **League** — dropdown
- **Notes** (text search)
- **Locked** — Yes · No
- **Unassigned** — Yes · No · **Only** (filter to only-unassigned)
- **Published** — Yes · No
- **Returned** — Yes · No (returned = released back to inventory)
- **Has Opponent** — Yes · No

## Bulk action bar

- **Edit Mode** — checkbox to enable inline editing
- **Swap Assignments** — pick two events, swap teams
- **Lock Displayed** — lock everything currently filtered
- **Unlock Displayed** — bulk unlock filtered set
- **Sort Location-Time** — re-order grid
- **Excel export** (icon button — exports filtered set)

## Event grid

**Total events in this season filtered to defaults: 506** (50/page,
11 pages, "Records 1 to 50 of 506").

Columns:

| Column | Example |
|---|---|
| Select / Lock / Return (action links) | "Select" · "Unlock" · "Return" |
| Act (selection checkbox) | ☐ |
| Start Date-Time | `05/26/26 08:00 PM (Tue)` |
| Duration | `60` (minutes) |
| Location | `Canton Ice House - Blue` |
| Locked | `X` if locked |
| Team 1 | `Hammocks` |
| Team 2 | `The Marlboro Reds` |
| Event Type | `In-House Game` |
| Hourly Cost | `$370.00` |
| End Time | computed |
| Notes | free-text |
| Returned | flag |
| Team Published | per-team publish status |

## Observations / SportsPulse gaps

1. **The scheduler is filter-first.** Avario doesn't show a calendar
   grid — it shows a *filterable list* of events. Schedulers operate
   by query ("show me everything unassigned next week at Lovell")
   rather than by month-view. Important: SportsPulse's current
   Schedule view should match this paradigm AND offer a calendar view.

2. **Lock primitive is core.** Every row has its own lock state.
   Generation respects locks. Bulk lock/unlock is one click.
   SportsPulse has nothing equivalent — events are just rows.

3. **Return primitive.** A row can be "Returned" — the slot
   goes back to the inventory of available time. Distinct from
   "Cancel" because the time itself is still on the books, just
   not consumed by this assignment.

4. **Per-event hourly cost.** Every event has its own cost (not just
   a per-division rate). Schedulers can override. This is the financial
   spine of the league.

5. **Tags double as division-shorthands.** PPHL uses tags
   `BMA, BMB1, ..., SSD3` which mirror divisions. This is a
   denormalisation Avario tolerates but SportsPulse can skip if our
   division filter is fast enough.

6. **Undo Changes** as a first-class button. Most schedulers run a
   generator → look at results → undo → tweak → re-run. Avario gives
   one-button undo of the last batch.

7. **"Copy Events from LY"** (last year) is *the* season setup
   shortcut. Schedulers don't start from blank — they start from last
   season and edit. SportsPulse needs a season-rollover that mirrors
   this.

8. **Manager-submitted Event Changes** route through a queue that
   the scheduler reviews here (Events → Event Changes). Per the
   League Settings (`03-season-settings.md`), every change can require
   up to 6 approvers and 5 notifications.

