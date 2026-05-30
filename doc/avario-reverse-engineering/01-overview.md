# Avario Scheduler — reverse-engineering notes

Source: read-only walkthrough of the `avarioscheduler.com` app at PPHL's tenant
(user `dweare`, session 2026-05-26). PPHL is a Power Play Hockey League
multi-region adult/youth ice hockey league running on Avario today.
No CRUD operations performed.

## Stack signals

- ASP.NET WebForms (`.aspx` URLs, `__doPostBack` JS handlers, `ctl00$MainContent$...` server-side ID prefixes). Legacy stack — full page reloads on most interactions.
- Multi-tenant via single org → many seasons. PPHL has **36 seasons** loaded in the dropdown (2023 → 2026-27), partitioned by region + season-half (spring/summer + year-pair).
- Support is offloaded to Atlassian Confluence (`autoice.atlassian.net/wiki`) and Outlook Bookings for training. In-app empty/help states are sparse.

## Top-level navigation (14 sections)

```
Home → Setup → Purchase → Schedule → Tournament → Analyze → Review → Publish
                                                                          ↓
        Available ← Process ← Reconcile ← Reports ← Invoicing ← Payment ←
```

The order is *workflow order*. A scheduler walks through these stages in
sequence over a season cycle. The full pipeline (not just "scheduling"):

| Stage | Purpose |
|---|---|
| **Setup** | Configure season, levels (divisions), teams, locations, integrations |
| **Purchase** | Buy facility/ice time blocks ahead of scheduling |
| **Schedule** | Assignment screen — assign teams to time slots |
| **Tournament** | Tournament-specific scheduling |
| **Analyze** | Schedule audit + conflict detection |
| **Review** | Review with managers before publishing |
| **Publish** | Push to SportsEngine / Crossbar / GameSheet / etc. |
| **Payment** | Per-team payment processing |
| **Invoicing** | Invoice generation |
| **Reports** | Standard reports |
| **Reconcile** | Reconcile actuals vs plan |
| **Available** | Sell unassigned slots to internal teams / public |
| **Process** | TBD — likely batch operations |

## Dashboard metrics (one season)

Live numbers from "2025-2026 South Shore Boston Metro PPHL":

| Metric | Actual | Budget | Variance |
|---|---:|---:|---:|
| Hours Needed (Main) | 2,202 | 720 | (1,482) |
| Season Budget ($) | 787,463 | 0 | (787,463) |
| Unassigned Hours (Main) | 542 | 0 | (542) |
| Published Events | 1,637 | 3,006 | 1,369 |
| Payments Processed | 0 | 787,463 | 787,463 |
| Events to be Returned | 18 | 0 | (18) |

Reads: PPHL is running a $787K, 2200-hour, 1600-event season on this
single tenant. **This is a mission-critical operational tool**, not a
hobby app.

## Season selector (cross-cutting context)

Single dropdown lists every season the user has access to. Switching
seasons re-keys the entire app. The 36 seasons reveal PPHL's structure:

- Regions: Metro West · Northeast · South Shore Boston Metro · Southern NH ·
  Wellesley · New York · Washington · Central Time Zone · Senior A · Expansion/Draft & Skills · Specialty
- Season halves: spring · summer · winter (Sep–Apr).
- Long-running: 2023 onward, immutable history retained.

This is one-org-many-seasons — different from SportsPulse's
many-orgs-each-with-seasons. Avario's multi-tenancy is at the org
boundary; PPHL is a single org with regional segmentation.
