# Avario Publish — SRM / external integration heart

URL: `/Publish/Publish.aspx`. Page title: "Master Schedule Export".

This is where the schedule **leaves Avario** to land in the host
platforms (SportsEngine, Crossbar, etc.) and to land in inboxes.
Publishing is the moneymaker — Avario is the *upstream* tool that
fans schedules out to wherever the league's audience actually is.

## Left-nav

### Master Schedule
- **Master Schedule** (current view) — single-file export

### Integrations (11 targets — every push or pull)

| Link | Direction | Target |
|---|---|---|
| **SportsEngine (Import)** | ← | Pull events from SportsEngine into Avario |
| **SportsEngine (Sport)** | → | Push to sport-level SE site |
| **SportsEngine Tourney Placeholders** | → | Tournament holds in SE |
| **SportsEngine (Season)** | → | Push to season-level SE site |
| **Arbiter** | → | Referee assignment platform |
| **Crossbar** | → | Crossbar |
| **Google Calendar** | → | iCal / Google Calendar feeds |
| **Horizon** | → | Horizon Ice Management |
| **Horizon Web Ref** | → | Horizon's ref module |
| **LeagueApps** | → | LeagueApps |
| **LeagueApps Club Import** | ← | Club roster import from LeagueApps |
| **LeagueApps League Games Import** | ← | League games import |
| **LeagueApps League Events Import** | ← | Other events import |
| **RecTrac** | → | Vermont Systems facility management |
| **Team Snap** | → | TeamSnap team management |
| **Team Snap Organization** | → | TeamSnap org-level |

That's **9 outbound pushes + 5 inbound pulls = 14 integration paths**
across 8 distinct partner systems. Avario is genuinely a *hub*.

### Emails (manual broadcast paths)

- **Teams** — email teams (contacts list, free-form)
- **Team Schedules** — send each team their own schedule
- **Worker Schedules** — send each worker their own
  (referees, scorekeepers, timekeepers)
- **Facility Schedules** — send each rink/venue their slot list
- **SportsEngine File** — attach a SE-formatted file to a team email
  (for orgs that don't have SE integration enabled)

## Main view (Master Schedule)

Just two controls + one button:

- **Download Schedule** button — generates the file
- **Single Line Display** (✓) — one row per event vs. multi-line
- **Optional File Description** (text) — appended to filename and
  email subject for traceability ("v3 final after manager review")

That's it. The page itself is simple; everything that matters is in
the left-nav per-integration screens.

## SportsPulse equivalence

This is the **must-build** competitive surface. Currently SportsPulse
has zero outbound integrations. To match Avario, SportsPulse needs:

### Integration framework

- `integrations` table with: id, org_id, kind (`sportsengine` /
  `crossbar` / `gamesheet` / `teamsnap` / etc.), direction
  (`push` | `pull`), enabled, credentials (encrypted), config_jsonb,
  last_sync_at, last_sync_status, last_error.
- Per-integration adapter modules in `packages/integrations/<kind>/`
  exposing `pushSchedule(seasonId, opts)` / `pullEvents(seasonId, opts)`.
- A retryable job queue (pg_cron + jobs table) for async pushes;
  schedulers click "Publish" and get a job-id back rather than waiting.

### Priority targets

For PPHL specifically, these are the must-haves (✓ in Avario's
Season Settings = currently in use):
1. **SportsEngine Sport Management** — primary publish target
2. **Crossbar**
3. **Arbiter** — referees
4. **Google Calendar / iCal** — for fans/parents to subscribe
5. **TeamSnap** — for player-level mobile notifications
6. **HorizonWebRef** — ref-assignment workflow
7. **RecTrac** — facility/billing reconciliation
8. **LeagueApps** — registration platform

### Emails

Beyond external SRMs, four scheduled email blasts:
- Per-team weekly schedule
- Per-worker (ref / scorekeeper) schedule
- Per-facility (rink) schedule
- Custom team broadcast

SportsPulse already has the email dispatcher (used for registration
notifications). Reuse it for schedule blasts.

### "Master Schedule Export"

Even before any integration ships, a one-button schedule export
(CSV / Excel / iCal) with the "Optional File Description" pattern
would unblock leagues immediately.
