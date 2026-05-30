# Avario Reconcile — drift detection between Avario and external systems

URL: `/Reconcile/Reconcile.aspx`. Default landing: **Import Reconciliation**.

The Reconcile module **detects drift** between Avario's internal schedule
and the same schedule as it exists in external systems (the rink's own
booking sheet, SportsEngine, Crossbar, LeagueApps). When the league
schedules ice in Avario but the rink's POS system has a different
event in the same slot, Reconcile is the surface that flags it.

## Left-nav

### Reconcile Import
- **Import Reconciliation** (current view) — diff against an imported
  events file (typically CSV/XLSX exported from the rink's system or
  from a previous schedule)
- **Import Events** — bulk import an events file from an external source
- **Team Translation** — map external system team names to Avario teams
  (string normalisation — "PPHL U10 Bandits" in their system =
  "Bandits" in Avario)
- **Location Translation** — map external location names to Avario
  locations ("Rink 1 East" externally = "Bog Ice Arena - Rink 1"
  internally)

### Reconcile Website
- **SportsEngine (Sport)** — reconcile against SportsEngine
  Sport-Management API
- **SportsEngine (Season)** — reconcile against SportsEngine
  Season-Management API (different endpoint, different shape)
- **Crossbar** — reconcile against Crossbar
- **LeagueApps** — reconcile against LeagueApps

## Filters

- **Date Range** (start / end)
- **Location**
- **Team(s)**
- **Day of Week**
- **Notes** (free text)
- **Ignore Teams** checkbox — when checked, matches are made on
  (location + time) only, ignoring team mismatches
- **Exact StartTime Match** checkbox — when off, allows ±N-minute
  fuzz so an event starting at 7:00 in one system and 7:05 in the
  other is considered the same
- **Display Matched** checkbox — by default only mismatches are
  shown; check this to see matches too (full diff view)
- **Refresh Reconciliation** button — re-runs the diff

## Key observations

1. **Reconcile ≠ Publish.** Publish is *push*: Avario sends events
   out to external systems. Reconcile is *diff*: compare what's out
   there now to what we think it is. They're complementary —
   Publish creates the external state, Reconcile verifies it didn't
   drift.
2. **Two-step translation** (Team Translation + Location
   Translation) is required *before* reconciliation because
   external systems use different IDs / names. This is the only
   place in the entire UI where the league explicitly maintains a
   crosswalk table — important integration concept.
3. **Two SportsEngine endpoints** (Sport vs. Season) — SportsEngine
   has two distinct APIs because of how their product evolved.
   Avario handles both as distinct reconciliation targets.
4. **Fuzzy time matching** (`Exact StartTime Match` toggle) and
   **team-agnostic matching** (`Ignore Teams`) are operationally
   essential — external systems frequently have small drift that's
   noise, not real conflict. Without these toggles, reconciliation
   would surface 100s of false positives.
5. **Notes** as a filter implies notes flow through the reconcile
   diff — when the rink adds "moved to Rink 2" as a note, that's
   discoverable via the Notes filter.

## SportsPulse equivalence

We currently have **zero reconcile concept**. We push events out
(via Publish) but never verify they survived round-tripping. To
ship this:

- New table `external_event_mappings`:
  - id, sp_event_id, external_system (enum: sportsengine_sport |
    sportsengine_season | crossbar | leagueapps | file_import),
    external_event_id, last_synced_at, last_diff_status (enum:
    match | mismatch_time | mismatch_location | mismatch_team |
    missing_external | extra_external)
- New tables `external_team_map` and `external_location_map`
  (sp_id → external_id, per external system).
- `/finance/reconcile` page mirroring Avario's surface:
  - File upload + parser for CSV/XLSX
  - Per-integration "Refresh Reconciliation" button
  - Filter bar (date range, location, team, day, notes)
  - Diff grid: SP-event side / External-event side / status flag
  - Match-toggle (`Exact StartTime Match`, `Ignore Teams`,
    `Display Matched`)
- Cron job: nightly Reconcile against each connected external
  system; raise an alert when mismatch count > threshold.
- This is **distinct from `IntegrationsAdapter.publish()`** — it's
  the inverse: `IntegrationsAdapter.fetch()` + diff.

## Open questions

- How does Reconcile **resolve** a mismatch? Snapshot shows only the
  diff view — there must be per-row "accept Avario" / "accept
  external" buttons we haven't surfaced yet (the empty grid hides
  them). Worth re-visiting with non-empty data.
- Is reconciliation **bi-directional** or always Avario-as-source-of-
  truth? The Publish module suggests Avario is canonical; Reconcile
  exists to flag where reality drifted. Verify by inspecting a
  reconciliation with actual mismatches.
