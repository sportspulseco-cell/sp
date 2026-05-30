# Avario Setup tab — data model surface

The Setup tab is a left-nav of 30+ sub-pages organised into 8 groups.
Capturing every link so SportsPulse can mirror the surface area where
it makes sense.

## Setup left-nav, group by group

### User Setup
- **User Details** — profile / account settings

### Season Setup
- **Season Settings** — see `03-season-settings.md` (~100 knobs)
- **Contacts** — people associated with the season (league staff,
  coordinators, schedulers — different from team managers/coaches)

### Levels (≈ SportsPulse "divisions")
- **Levels** — list of competitive divisions. Per-level fields:
  `Name · Teams · Hours · Season Start · Season End · Game Start ·
  Game End · Game Count · Solo Count · Shared Count`
- **Event Type Settings** — per-level config for game / practice / etc
- **Weekly Planner** — consistent recurring start times per slot
- **Level Pairings** — which levels can play against which (cross-division)
- **League Team Setup** — bulk team config per level
- **Calculators** — utilities (hour budgets, etc)

### Teams
- **Teams** — team roster
- **Blackout Dates** — team-level "we can't play these days"
- **Tournaments** — tournament participation (when teams are away playing)
- **Participants** — players on teams
- **Team Tags** — tag system for grouping/filtering
- **Team Locations** — where each team is based (their home rink)
- **Travel Restrictions** — distance / region constraints
- **Shared Coaches** — coaches who manage multiple teams (their
  schedules must not collide)
- **Team Types** — categorisation (A team, B team, etc.)

### Team Integration (per host platform)
- SportsEngine (Sport) — sport-level publish target
- SportsEngine (Season) — season-level publish target
- Crossbar Teams
- LeagueApps Teams

### Locations
- **Locations** — physical venues (rinks)
- **Schedule Categories** — slot categorisation (peak / non-peak)
- **Resources** — sub-resources per venue (Rink 1 / Rink 2 /
  West sheet / East sheet)
- **SportsEngine Venues** — venue mapping for SE integration
- **Crossbar Locations**
- **LeagueApps Locations**

### Other Settings
- **Event Types** — game · practice · scrimmage · etc.
- **Other Costs** — extra fees beyond ice time
- **Holidays** — holiday blocks
- **Tags** — global tag system
- **Worker Roles** — referee · scorekeeper · timekeeper · etc.

### Import
- **Import Teams** — bulk team CSV/XLSX import
- **Import Tournaments**
- **Import Errors** — error log

## Sample Levels listing (South Shore Boston Metro 2025-2026)

Captured row count: **15 divisions** in a single regional season.
Per-row fields: Name · Teams · Hours · Season Start · Season End ·
Game Start · Game End · Game Count · Solo Count · Shared Count.

Examples:
- Admin · 102 teams · 2 hr · Nov–Dec · 4 games
- Boston Metro League A Division · — · 13 hr · Sep–Apr · 26 games
- Boston Metro League B1 · 12 teams · 6.5 hr · May–Aug · 13 games
- South Shore League 50+ · 4 teams · 12.5 hr · Sep–Apr · 25 games
- Womens League Norwood · 6 teams · 6.2 hr · May–Aug · 15 games

Per-division knobs: each division has its own season window (separate
from the parent season window!), hours-per-team target, game-count
target, solo/shared event counts.

## Sample Locations listing (from Lobby Display dropdown enumeration)

26 active rinks in the South Shore region alone:
Bog Ice Arena (Rink 1 + Rink 2), Boston Sports Institute Wellesley Rink,
Bridgewater Ice Arena, Canton Ice House (Blue + Red), Canton SportsPlex
(A + B), Founders Memorial Rink, Hobomock Arena (Rink 1 + Rink 2),
Joseph J Zapustas Ice Arena, Lovell Ice Arena (Rink 1 + 2 + 3),
Mark Bavis Arena, Metropolis Skating Rink, Pilgrim Skating Arena
(Rink A + B + C), Rockland Ice Rink, Shea Memorial Rink, Skating Club
of Boston, Thayer Sports Center, Thayer Sports Center - Mini Rink,
Walter Brown Arena.

Location has a sub-resource (specific rink/sheet), not just a name.
Crucial for ice hockey because most rinks are multi-sheet.
