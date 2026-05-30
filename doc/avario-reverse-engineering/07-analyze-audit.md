# Avario Analyze (Audit) — schedule constraint engine

URL: `/Audit/Audit.aspx`. The "Analyze" link in top-nav goes here.

This is one of Avario's most differentiated screens: a **constraint
violation engine** that scores the current schedule against every
rule the scheduler has configured, with one-click ignore / recommend
flows for each.

## Top action
- **Analyze Schedule** button — re-runs the audit (idempotent).

## Audit category buckets

Live counts from PPHL's 2025-2026 South Shore season:

| Category | Open issues |
|---|---:|
| Errors | 265 |
| Required Days | 2,449 |
| UnassignedEvents | 119 |
| Game Balancing | 334 |
| In-House Game Balancing | 3,539 |
| Gap Balancing | 626 |
| Hours Allocated | 97 |
| Other Balancing | 87 |
| Reporting | 597 |

So in one season Avario surfaces ~**8,000 individual issues** the
scheduler can drill into. This is operational telemetry on
schedule quality.

## "Errors" measures (sample of category)

Each measure is itself counted:

| Measure | Count | Description |
|---|---:|---|
| Event Starts Too Late - Weekday | 13 | Start time after Level-page setting |
| Events Before Season Start Date | 13 | Slot exists before official start |
| Team-Event Tag Mismatch | 234 | Tag on event doesn't match team's tag |
| Hours Allocated Do Not Exceed Violation | 5 | Team over their hour cap |

Each measure has a written description below the dropdown (e.g.,
"This issue indicates that the Start Time for a Weekday event is
after the settings on the Setup tab, Level page for this team").

## Per-issue action row

Each violation has its own row in the grid with:

| Col | Example |
|---|---|
| Concern | `Review` (severity) |
| Team | `.Skills` |
| Event Time | `06/01/2026 09:20 PM (Mon)` |
| Location Name | `Mark Bavis Arena` |
| Event Type | `Other` |
| Actions | `Recommend` · `Ignore` · `Events` |

- **Recommend** — Avario suggests an auto-fix
- **Ignore** — mark this issue as accepted; won't surface again
- **Events** — jump to the Schedule view filtered to this event
- **Auto Ignore Displayed Issue** — checkbox at top to bulk-ignore
  every issue in the current filter

## Filters (Audit-specific)

In addition to the standard date/location/level/team/time/tag filters,
the Audit grid adds:

- **Concern** — All · **Needs Attention** · Yes · Review · No · Info
  (severity levels)
- **Actual Value** (from / to) — numeric threshold filter
- **Target Value** (from / to) — what the rule wanted
- **Ignored** — checkbox to include previously-ignored items

## SportsPulse equivalence

This is the killer screen we don't have. SportsPulse needs:

- **Constraint registry** in `packages/kernel`: every rule
  (`event_starts_too_late_weekday`, `team_event_tag_mismatch`, etc.)
  declared with: id, category, severity (Error / Review / Info),
  measure description, target-value computation, ignore-allowed flag.
- **`schedule_audit_findings` table**: row per (rule_id, event_id,
  team_id, season_id, status='open'|'ignored', actual_value,
  target_value, recommended_action_json, created_at).
- **`POST /schedule/audit/run`** endpoint that walks all events in a
  season, evaluates every rule, upserts findings, expires resolved
  ones.
- **UI**: a copy of the page above — category dropdown → measure
  dropdown → filtered grid of violations → per-row Ignore /
  Recommend / Events.
- **Auto-Recommend**: each rule can register a recommendation
  function (e.g., "move this Friday-night-weekday event earlier",
  "swap with team X for tag match").

This is a hard differentiator. Avario's constraint engine is what
turns "we have a schedule" into "we have a *defensible* schedule"
— the scheduler can show the league that every rule was either
satisfied or explicitly waived.
