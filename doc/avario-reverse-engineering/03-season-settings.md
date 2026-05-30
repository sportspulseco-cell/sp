# Avario Season Settings — every config knob

Single page, ~100 settings split into 10 sections. This is the
"what every league cares about" master config.

## 1. General

- **Season Name** (text)
- **Season Dates** (from / to with day-of-week display: "Mo" / "Fr")
- **Season Timezone** (10 NA + UTC: Alaskan, Atlantic, Canada Central,
  Central, Eastern, Mountain, Newfoundland, Pacific, Phoenix, UTC)
- **Season Budget ($)** (=0 by default)
- **Maximum Event Run** (=7) — max consecutive days a team plays
- **Hours between events on different days** (=10) — back-to-back rest
  threshold for cross-day events
- **Hours between events on same day** (=3) — same-day rest threshold

## 2. Daily Time Windows (Mon-Fri vs Sat-Sun split)

Earliest Start / Latest End times separately for Games and Non-Games,
across two day-buckets:

| | Mon-Fri | Sat-Sun |
|---|---|---|
| Games start | 5pm | 6am |
| Games end | 10pm | 10pm |
| Non-Games start | 6pm | 6pm |
| Non-Games end | 11pm | 11pm |

The split matters because youth ice time is weekday-evenings + weekends.

## 3. Notes — free-text season notes (sticky for the scheduler)

## 4. Page Links (public-facing read-only views)

Three URLs auto-generated with secret keys (anonymous access):

- **Public Schedule Page** — full HTML schedule
- **Public Available Page** — available slots for sale
- **Public Available Page (No Branding)** — same, headerless, for
  iframe embed into association websites

## 5. Integration Settings (host platforms / SRMs)

Eleven supported targets, each with its own checkbox:

| Integration | Default | Config |
|---|---|---|
| SportsEngine Sport Management | ✓ | API Site IDs (multi, csv) |
| SportsEngine Season Management | off | Organization IDs |
| Arbiter | ✓ | — |
| Crossbar | ✓ | — |
| Sprocket | off | — |
| Game Sheet | off | GameSheet Season ID |
| Google Calendar | ✓ | — |
| Horizon | ✓ | — |
| HorizonWebRef | ✓ | — |
| LeagueApps | ✓ | — |
| Publish with CSV Files | off | — |
| RecTrac | ✓ | — |
| Team Snap | ✓ | — |
| Team Snap Organization | ✓ | — |

Plus: **Organization Abbreviation** (for short labels in exports) and
**Display Event Change Notification** toggle.

## 6. Schedule Generation Settings

- Process Entire Level at a Location First (off)
- Process Standard Durations per Clean Time (✓) — "Clean Time" =
  ice resurfacing between events
- Team Must have a Location Priority (off) — when ✓, scheduler will
  refuse to assign a team to a rink they haven't ranked
- Team Stacking Used (off) — multi-team time-stacking on same rink slot

## 7. Game Settings

- Are games played during this season? (checkbox)
- **Additional Game Slots for League Scheduling** (=2) — overflow slots
- **Are back-to-back games preferred?** (✓) — generator pref
- **Away Games are assigned within the season?** — when both home/away
  teams are in this season's tenant
- **Home Games are assigned outside this season?** — when home
  assignment comes from another association
- **Teams Play in Multiple Leagues** (off)
- Assign Game Officials (off)
- Game Official Acceptance Required (off)

## 8. Available Event Settings (selling unsold slots)

- Display Available Events on Manager Page
- All Unassigned Events Available For Sale
- **Approval Required for Internal Teams** (✓) — gate internal claims
- **Charge Internal Teams for Available Events** (off)
- Default Available Page Duration (=60 min)
- Default Available Page Max Duration (=60 min)
- **Public Available Page Contact** (dropdown of league staff names)
- Allow Scrap Events
- Immediate Notification (✓)
- Notify Requestor on Approval (✓)
- Notify Requestor on Cancel (✓)

## 9. Public Schedule Display Settings (rink-lobby kiosk mode)

- **Lobby Display Type** — One Location · One Location with Ads ·
  Two Locations · Two Locations with Ads
- Lobby Display Location 1, 2 (full venue dropdown — 26 rinks)
- Lobby Display Ad Files (file upload — images that rotate between
  schedule rows on the kiosk)
- Public Schedule - Display Locked Only

This is a real feature: each rink has a TV showing today's bookings;
Avario generates a hosted display URL keyed to one or two venues.

## 10. League Settings (game-change workflow — biggest section)

Game changes require approval gates, configurable independently:

- **Game Change Fee** ($) — charge per change
- **Game Change Lead Time Required** (text)
- **Level Coordinator Approval Message** (canned message)
- 11 approval-gate checkboxes for game CHANGE:
  Home Scheduler · Away Scheduler · Manager · League · Referee ·
  Level Coordinator · Level Coordinator outside-season-dates only
- 4 notification gates: Notify League · Notify Referee · Notify
  Level Coordinator · Display Submitter/Manager Details
- Game Change - TBD Lead Time (=14 days)
- Game Change - TBD Date / Location Name (TBD1) — placeholder when
  the change is approved but final time isn't set
- Update Immediately on Final Approval (off)
- Delete Original Event After Game Change (off)
- Leave Original Event Unassigned (off)

Game ADDITION has its own approval set:
Home Scheduler · Away Scheduler · Manager · League · Level Coordinator
· Referee.

Game CANCEL: League Approval only.

Allow Games Outside League Dates (off) — gate for after-season events.

## 11. Tournament Settings

- Tournament Start Time (5pm default)
- Schedule Hosted Tournaments (✓)
- Schedule Away Tournaments (✓)
- Copy Tournaments To New Seasons (✓)
- Publish Tournaments (✓)

## 12. Billing & Invoicing

- Maintain Invoices (✓)
- Bill Teams for Usage (✓) — usage-based billing per slot
- Keep Internal & External Hourly Costs in Sync with Event Hourly Cost
  (off) — two-tier pricing toggle

## 13. Manager Page Settings (~24 toggles!)

What team managers see and can do in their portal. Every action is
opt-in. Listed in spec-order:

Display: Home Tab · Event List · Event Changes · Notes · Hourly Cost
Add: Away Game · Away Scrimmage · Tournament Game
Change: Event→Game · Event→Scrimmage · Game→Practice · Scrimmage→Practice ·
        Scrimmage Opponent · Game Opponent
Remove: Scrimmage
Other: Team Will Not Use · Team Will Not Use - GAMES · Trade Event ·
       Allow Managers to edit events
Captures: Tournaments (max=4) · Blackout Dates (max required=10,
          max optional=10, require approval) · Game Slots
Other features: Manager Importing · Submit Game Changes · Enter Game Scores

The manager experience is fundamentally a *permissions matrix on top
of every domain action*. Each toggle creates an admin-controlled scope
of what managers can do.

## 14. Other Settings

- Copy Teams to New Seasons (✓) — season rollover
- Copy Team Locations to New Seasons (✓)
- Update Home-Away on Analysis Run (✓)
- Event Participants (✓) — capture per-player rosters on events
- Event Tags (✓)
- Event Location Resources (✓)
- Event Workers (✓) — refs / scorekeepers tied to events
