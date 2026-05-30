# Avario Review — printable schedule view for stakeholders

URL: `/Review/Review.aspx`. Page title: "Schedule Review".

This is the **internal sign-off view**. After Audit clears, schedulers
generate a printable / shareable layout to circulate to managers
before publishing. No edits here — pure visualisation + comments.

## Top action
- **Print Displayed Records** — print-formatted output

## View dropdown (5 layouts)

| View | Layout |
|---|---|
| **Teams Weekly** (default) | Team rows × day-of-week columns |
| **All Events** | Flat event list (paginated) |
| **Location Weekly** | Location rows × day-of-week columns |
| **Locations Daily** | Locations × hour-of-day for one day |
| **Scheduling Meeting** | Meeting-friendly summary |

The whole module is "the same data, multiple printable layouts."

## Filters

Same as Schedule + Audit (Date / Location / Level / Team / Event Type /
Time / Duration / Team Type / Tag) — plus:

- **Week Start** with `<<` / `>>` arrows to flip weeks one-by-one
- **Display Unassigned** (checkbox) — include or exclude unassigned
  slots in the printed output

## Teams-Weekly grid (default view)

Captured row example from PPHL 2025-2026 South Shore:

| Team | Mon 05-25 | Tue 05-26 | Wed 05-27 | Thu 05-28 | Fri 05-29 | Sat 05-30 | Sun 05-31 | Comment |
|---|---|---|---|---|---|---|---|---|
| `.Draft League` | empty | empty | empty | empty | empty | empty | empty | [Add Comment] |
| `.DROP` | empty | … | … | … | … | … | … | [Add Comment] |
| `.Pick Up` | … | … | … | … | … | … | … | [Add Comment] |
| `.Skills` | … | … | … | … | … | … | … | [Add Comment] |
| `.Sublet` | … | … | … | … | … | … | … | [Add Comment] |

178 records (= teams in this season) paginated 50/page.

Each row has its own "Add Comment" link so the scheduler can leave a
note that travels with the team's printed schedule
(*"Goalie on vacation Aug 10–17, no practice that week"*).

Teams prefixed with `.` (dot) are placeholder / admin teams
(`.Draft League`, `.DROP`, `.Pick Up`, `.Skills`, `.Sublet`).
PPHL uses these for events that aren't tied to a real team —
draft-night sessions, sublets, skill clinics, pick-up. The dot
ensures they sort first alphabetically.

## SportsPulse equivalence

- A `/schedule/review` page that mirrors this 5-view dropdown:
  - Team-weekly grid (rows × days)
  - Location-weekly grid
  - Locations-daily timeline
  - All events flat list
  - Print-ready summary
- Per-team `comments` table for travelling notes that print alongside
- Toggle for "include unassigned" — for circulation to ice vendors
  vs. distribution to managers
- A `/print` route mode that uses a static stylesheet for clean
  black-and-white prints

The "placeholder teams" pattern (`.Draft League`, etc.) is a
convention PPHL evolved — worth documenting but not enforcing.
SportsPulse could let admins create non-rostered teams for the
same purpose.
