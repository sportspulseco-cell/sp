"""Generate doc/traceability-matrix.xlsx in the format defined by
doc/Tracibility Matrix (1).xlsx, populated with the SportsPulse PPHL
functional requirements (FR-3.x.y) and the matching use-case anchors
(UC-01..UC-33) from:

  - doc/Copy of  Sports Pulse Platform Requirements (PPHL) (1).md
  - doc/Use cases SportsPulse- PPHL (1) (1).md

Run from the repo root:

    python doc/build-traceability-xlsx.py

The script loads the template workbook to inherit its styling (fonts,
column widths, header layout), clears the sample rows, fills in the
SportsPulse data, and writes the result to doc/traceability-matrix.xlsx.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

DOC_DIR = Path(__file__).resolve().parent
TEMPLATE = DOC_DIR / "Tracibility Matrix (1).xlsx"
OUT = DOC_DIR / "traceability-matrix.xlsx"

# ---------------------------------------------------------------------------
# Project metadata (rows 2-5 in the template)
# ---------------------------------------------------------------------------
PROJECT_META = {
    "Project Name:": "SportsPulse — PPHL build",
    "National Center:": "Sports Pulse Co.",
    "Project Manager Name:": "Sports Pulse PMO",
    "Project Description:": (
        "Cloud-hosted league & club management platform for PPHL — "
        "registration, rostering, scheduling, payments, stats, video, "
        "communications, merchandising, compliance. Roles: Guest, Player, "
        "Parent/Guardian, Captain/Coach, Scorekeeper/Ref, League Admin, "
        "Org Admin, Content Moderator, Customer Support."
    ),
}

# ---------------------------------------------------------------------------
# Status palette (fill colour of the Status cell only — header bar style
# matches the template's bold black headers already).
# ---------------------------------------------------------------------------
STATUS_FILLS = {
    "Completed":    PatternFill("solid", fgColor="D1FAE5"),  # green
    "Partial":      PatternFill("solid", fgColor="FEF3C7"),  # amber
    "In Progress":  PatternFill("solid", fgColor="DBEAFE"),  # blue
    "Not Started":  PatternFill("solid", fgColor="FEE2E2"),  # red
}

VERIFICATION_FROM_STATUS = {
    "Completed":   "Complete",
    "Partial":     "Partial",
    "In Progress": "In Progress",
    "Not Started": "Pending",
}


# ---------------------------------------------------------------------------
# The requirements catalogue.
#
# Each tuple = (
#     urd,            # URD<section>.<index>   — section 1..21 = PPHL §3.1..3.21
#     module,         # Technical Assumption(s) and/or Customer Need(s)
#     fr_id,          # FR-3.x.y label (source-of-truth reference)
#     fr_text,        # Functional requirement (from PPHL doc)
#     status,         # Completed | Partial | In Progress | Not Started
#     uc_refs,        # Technical Specification — supporting UC-xx (use-cases doc)
#     impl_in,        # Implemented In — "R1" once shipped, "—" if not started
#     comments,       # Additional Comments — file pointers, commits, gaps
# )
#
# Status is derived from doc/traceability-matrix.md (live = Completed,
# partial = Partial, scaffolded = In Progress, not_started = Not Started).
# ---------------------------------------------------------------------------
REQ_ROWS = [
    # -----------------------------------------------------------------------
    # 1. Financial Tracking & AR Management (PPHL §3.1)
    # -----------------------------------------------------------------------
    ("URD1.1", "Financial Tracking & AR Management",
     "FR-3.1.1",
     "Display real-time AR dashboard with team and player balances.",
     "Completed", "UC-15, UC-17",
     "R1",
     "ar-dashboard-client.tsx on /finance (4 KPI tiles, filters, table). Commit 0eef2d1, 8ef1656."),
    ("URD1.2", "Financial Tracking & AR Management",
     "FR-3.1.2",
     "Track unpaid balances, payment plans, and overdue amounts.",
     "Completed", "UC-15, UC-18",
     "R1",
     "finance/interface invoice + captain-dues controllers; overdue cron live. Commit ae7f15b."),
    ("URD1.3", "Financial Tracking & AR Management",
     "FR-3.1.3",
     "Send automated reminders for overdue payments (email/SMS).",
     "Partial", "UC-18",
     "R1",
     "Overdue cron emits notifications; real email/SMS providers pending (see URD10.x)."),
    ("URD1.4", "Financial Tracking & AR Management",
     "FR-3.1.4",
     "Export financial reports in CSV/PDF for accounting.",
     "Partial", "UC-17, UC-18",
     "R1",
     "/reports route ships CSV exports; PDF export deferred."),
    ("URD1.5", "Financial Tracking & AR Management",
     "FR-3.1.5",
     "Support discount codes, family caps, and installment plans.",
     "Partial", "UC-15",
     "R1",
     "Installment plans live (captain dues split + per-player invoices). Discount codes + family caps not built."),
    ("URD1.6", "Financial Tracking & AR Management",
     "FR-3.1.6",
     "Apply late fees and charges for failed payments automatically.",
     "Partial", "UC-18",
     "R1",
     "Overdue flag + reminder cadence live; late-fee config UI deferred."),
    ("URD1.7", "Financial Tracking & AR Management",
     "FR-3.1.7",
     "Support offline payment logging.",
     "Completed", "UC-15",
     "R1",
     "pending_offline submission state in review queue. Commit fb1c464."),
    ("URD1.8", "Financial Tracking & AR Management",
     "FR-3.1.8",
     "Allow partial captain overrides with system safety checks.",
     "Completed", "UC-16",
     "R1",
     "captain dues split + cover-outstanding flow. Commit ae7f15b, 78d8df5."),
    ("URD1.9", "Financial Tracking & AR Management",
     "FR-3.1.9",
     "Integrate with QuickBooks for financial syncing.",
     "In Progress", "UC-17",
     "R1",
     "quickbooks_sync_logs schema + read-only UI on /payments. OAuth + worker pending."),
    ("URD1.10", "Financial Tracking & AR Management",
     "FR-3.1.10",
     "Track payroll for referees/scorekeepers.",
     "Partial", "UC-12, UC-30",
     "R1",
     "referee_payroll invoice type recognised in finance schema; payroll calculator + invoice flow pending."),

    # -----------------------------------------------------------------------
    # 2. Live Video Integration & Highlights (PPHL §3.2)
    # -----------------------------------------------------------------------
    ("URD2.1", "Live Video Integration & Highlights",
     "FR-3.2.1",
     "Integrate live camera feeds (LiveBarn-style).",
     "Not Started", "UC-22",
     "—",
     "Streaming provider integration not started."),
    ("URD2.2", "Live Video Integration & Highlights",
     "FR-3.2.2",
     "Stream games on team pages with optional pay-per-view.",
     "Not Started", "UC-22",
     "—",
     "Team-page stream embed + PPV gating not started."),
    ("URD2.3", "Live Video Integration & Highlights",
     "FR-3.2.3",
     "Auto-highlight goals and key plays via scorekeeping integration.",
     "Not Started", "UC-23",
     "—",
     "Depends on URD5.1 scorekeeper UI + URD2.1 video feed."),
    ("URD2.4", "Live Video Integration & Highlights",
     "FR-3.2.4",
     "Allow manual highlight clipping and user uploads.",
     "Not Started", "UC-24",
     "—",
     "Upload pipeline + media storage not started."),
    ("URD2.5", "Live Video Integration & Highlights",
     "FR-3.2.5",
     "Share clips by player, team, or game.",
     "Not Started", "UC-24",
     "—",
     "Depends on URD2.4 upload pipeline."),
    ("URD2.6", "Live Video Integration & Highlights",
     "FR-3.2.6",
     "Support announcer/commentary audio feed.",
     "Not Started", "UC-22",
     "—",
     "Companion audio stream not started."),

    # -----------------------------------------------------------------------
    # 3. Goalie911 / Substitute Requests Tool (PPHL §3.3)
    # -----------------------------------------------------------------------
    ("URD3.1", "Goalie911 / Substitute Requests Tool",
     "FR-3.3.1",
     "Captains/players can request subs via portal.",
     "In Progress", "UC-31",
     "R1",
     "free-agent pool schema + claim button live; sub-request workflow scaffolded."),
    ("URD3.2", "Goalie911 / Substitute Requests Tool",
     "FR-3.3.2",
     "System sends SMS alerts to ranked pool of eligible subs.",
     "Not Started", "UC-31",
     "—",
     "Blocked on URD10.1 SMS provider."),
    ("URD3.3", "Goalie911 / Substitute Requests Tool",
     "FR-3.3.3",
     "Enforce eligibility rules (level matching, availability).",
     "In Progress", "UC-31",
     "R1",
     "Eligibility flags on player; ranking algorithm pending."),
    ("URD3.4", "Goalie911 / Substitute Requests Tool",
     "FR-3.3.4",
     "Provide approval workflow for Division Head.",
     "Not Started", "UC-31",
     "—",
     "Division-head review queue not started."),

    # -----------------------------------------------------------------------
    # 4. Direct Online Registration & Auto-Roster (PPHL §3.4)
    # -----------------------------------------------------------------------
    ("URD4.1", "Direct Online Registration & Auto-Roster",
     "FR-3.4.1",
     "Allow players to register directly to a team or as free agents.",
     "Completed", "UC-01, UC-03",
     "R1",
     "Registration funnel + player /register list. Commits 13cfad7, 69fa627, 5ad4e59."),
    ("URD4.2", "Direct Online Registration & Auto-Roster",
     "FR-3.4.2",
     "Auto-assign jersey numbers and update rosters.",
     "Not Started", "UC-01, UC-04",
     "—",
     "Jersey assignment currently manual via roster management UI."),
    ("URD4.3", "Direct Online Registration & Auto-Roster",
     "FR-3.4.3",
     "Captains can invite players from past rosters.",
     "Partial", "UC-04",
     "R1",
     "Captain rollover wizard re-uses last season's roster. Commit f929523."),
    ("URD4.4", "Direct Online Registration & Auto-Roster",
     "FR-3.4.4",
     "System sends alerts for players to confirm/decline registration.",
     "Partial", "UC-04",
     "R1",
     "Console-provider only; real email/SMS pending (URD10.x)."),
    ("URD4.5", "Direct Online Registration & Auto-Roster",
     "FR-3.4.5",
     "Support waivers, code of conduct, ID uploads.",
     "Completed", "UC-27, UC-28, UC-29",
     "R1",
     "Funnel waiver step + parental consent + admin compliance review. Commit 17287e5."),
    ("URD4.6", "Direct Online Registration & Auto-Roster",
     "FR-3.4.6",
     "Flag mis-leveled players for admin review.",
     "Completed", "UC-05",
     "R1",
     "Admin Pending Roster Approvals queue. Commit 1f49249."),
    ("URD4.7", "Direct Online Registration & Auto-Roster",
     "FR-3.4.7",
     "Auto-pitch free agents to captains to fill roster spots.",
     "Partial", "UC-03",
     "R1",
     "Captain can browse free-agent pool; notification fan-out + auto-suggest pending."),

    # -----------------------------------------------------------------------
    # 5. Live Stats, Standings & Schedule (PPHL §3.5)
    # -----------------------------------------------------------------------
    ("URD5.1", "Live Stats, Standings & Schedule",
     "FR-3.5.1",
     "iPad-compatible stat-entry app for scorekeepers.",
     "In Progress", "UC-11",
     "R1",
     "game_events append-only log live; tablet scoresheet UI pending."),
    ("URD5.2", "Live Stats, Standings & Schedule",
     "FR-3.5.2",
     "Real-time update of scores and standings.",
     "Partial", "UC-12, UC-13",
     "R1",
     "ProjectStatsHandler rebuilds stat_lines on finalize; WS/SSE delivery pending."),
    ("URD5.3", "Live Stats, Standings & Schedule",
     "FR-3.5.3",
     "Display leaderboards by team, player, division.",
     "Completed", "UC-13",
     "R1",
     "Leaderboards rendered on team / player / division pages."),
    ("URD5.4", "Live Stats, Standings & Schedule",
     "FR-3.5.4",
     "Support attendance tracking and misconduct reports.",
     "Partial", "UC-14",
     "R1",
     "Misconduct events captured via game_events; attendance UI pending."),
    ("URD5.5", "Live Stats, Standings & Schedule",
     "FR-3.5.5",
     "Allow sub-rosters and suspension tracking with auto-expiration.",
     "Partial", "UC-14",
     "R1",
     "suspensions table + handlers live; auto-expiration cron pending."),

    # -----------------------------------------------------------------------
    # 6. Credit & Wallet System (PPHL §3.6)
    # -----------------------------------------------------------------------
    ("URD6.1", "Credit & Wallet System",
     "FR-3.6.1",
     "Player wallet for credits/gift cards.",
     "Completed", "UC-15, UC-17",
     "R1",
     "Wallet apply flow on player payments. Commit 0eef2d1."),
    ("URD6.2", "Credit & Wallet System",
     "FR-3.6.2",
     "Credits usable for fees, tournaments, or apparel.",
     "Partial", "UC-15, UC-17",
     "R1",
     "Credits applied against fees; tournament + apparel checkout still scoped."),
    ("URD6.3", "Credit & Wallet System",
     "FR-3.6.3",
     "Transferable balances between users.",
     "Not Started", "UC-17",
     "—",
     "User-to-user transfer flow not started."),

    # -----------------------------------------------------------------------
    # 7. Team Stores (Shopify) (PPHL §3.7)
    # -----------------------------------------------------------------------
    ("URD7.1", "Team Stores (Shopify Integration)",
     "FR-3.7.1",
     "Auto-generate team store based on roster.",
     "Not Started", "UC-25",
     "—",
     "/store route is a placeholder; no merch tables in packages/db."),
    ("URD7.2", "Team Stores (Shopify Integration)",
     "FR-3.7.2",
     "Integrate with Shopify for fulfillment.",
     "Not Started", "UC-25, UC-26",
     "—",
     "Shopify OAuth + product sync not started."),
    ("URD7.3", "Team Stores (Shopify Integration)",
     "FR-3.7.3",
     "Support seasonal ordering windows and jersey color selection.",
     "Not Started", "UC-26",
     "—",
     "Pending team-store schema."),

    # -----------------------------------------------------------------------
    # 8. Scheduling & Ice Allocation (PPHL §3.8)
    # -----------------------------------------------------------------------
    ("URD8.1", "Scheduling & Ice Allocation",
     "FR-3.8.1",
     "Input available rink times and restrictions.",
     "Partial", "UC-06",
     "R1",
     "games.venueName/surfaceLabel freeform strings; venue/slot inventory model pending."),
    ("URD8.2", "Scheduling & Ice Allocation",
     "FR-3.8.2",
     "Auto-generate balanced schedules.",
     "In Progress", "UC-06",
     "R1",
     "Round-robin / bracket generator pending (see backlog 9.1, 4 eng-weeks)."),
    ("URD8.3", "Scheduling & Ice Allocation",
     "FR-3.8.3",
     "Track ice usage and utilization.",
     "Not Started", "UC-06",
     "—",
     "Depends on venue-slot model from URD8.1."),
    ("URD8.4", "Scheduling & Ice Allocation",
     "FR-3.8.4",
     "Support blackout times, league vs. tournament modes.",
     "In Progress", "UC-06, UC-07",
     "R1",
     "leagues.format = tournament enum value live; blackout-window enforcement pending."),

    # -----------------------------------------------------------------------
    # 9. Referee Scheduling & Notifications (PPHL §3.9)
    # -----------------------------------------------------------------------
    ("URD9.1", "Referee Scheduling & Notifications",
     "FR-3.9.1",
     "Auto-assign refs based on availability and skill.",
     "Partial", "UC-30",
     "R1",
     "game_officials table + assignment handlers live; availability calendar + auto-match pending."),
    ("URD9.2", "Referee Scheduling & Notifications",
     "FR-3.9.2",
     "Notify refs of changes via SMS/app.",
     "Partial", "UC-30, UC-21",
     "R1",
     "Templates in catalog; real SMS provider pending."),
    ("URD9.3", "Referee Scheduling & Notifications",
     "FR-3.9.3",
     "Dashboard for assigners with override rights.",
     "Partial", "UC-30",
     "R1",
     "Assignment endpoints live; assigner dashboard UI pending."),

    # -----------------------------------------------------------------------
    # 10. Team & Player Notifications (PPHL §3.10)
    # -----------------------------------------------------------------------
    ("URD10.1", "Team & Player Notifications",
     "FR-3.10.1",
     "Automated notifications for game changes, suspensions, eligibility.",
     "Partial", "UC-21, UC-14",
     "R1",
     "75+ template codes in communications/catalog.ts; ConsoleProvider only (real SendGrid/Twilio pending)."),
    ("URD10.2", "Team & Player Notifications",
     "FR-3.10.2",
     "Multi-channel delivery: email, SMS, push.",
     "Partial", "UC-19, UC-20, UC-21",
     "R1",
     "Outbox + retry scheduler scaffolded; provider bindings missing."),

    # -----------------------------------------------------------------------
    # 11. Captain Dashboard & Roster Management (PPHL §3.11)
    # -----------------------------------------------------------------------
    ("URD11.1", "Captain Dashboard & Roster Management",
     "FR-3.11.1",
     "Captains can add/drop players pre-roster lock.",
     "Completed", "UC-04",
     "R1",
     "Workflow 7B — 10 cases across 2 sprints. Commit 8641049, 4988d5b, 7f668dc."),
    ("URD11.2", "Captain Dashboard & Roster Management",
     "FR-3.11.2",
     "Edit jersey numbers, contact info.",
     "Completed", "UC-04",
     "R1",
     "Captain roster controller field edits. Workflow 7B."),
    ("URD11.3", "Captain Dashboard & Roster Management",
     "FR-3.11.3",
     "Auto-track playoff eligibility.",
     "Partial", "UC-09",
     "R1",
     "Min-games-played eligibility logic exists; playoff bracket flow pending."),
    ("URD11.4", "Captain Dashboard & Roster Management",
     "FR-3.11.4",
     "Import/export roster tools.",
     "Partial", "UC-04",
     "R1",
     "CSV export live in /reports; CSV import for rosters pending."),

    # -----------------------------------------------------------------------
    # 12. Advanced Menu Navigation (PPHL §3.12)
    # -----------------------------------------------------------------------
    ("URD12.1", "Advanced Menu Navigation",
     "FR-3.12.1",
     "Multi-level navigation (Org > League > Division > Team).",
     "Completed", "—",
     "R1",
     "Superadmin web: orgs / leagues / seasons / divisions / teams routes live."),
    ("URD12.2", "Advanced Menu Navigation",
     "FR-3.12.2",
     "Breadcrumbs and site map for easy navigation.",
     "Partial", "—",
     "R1",
     "Breadcrumbs present on detail pages; global site map pending."),

    # -----------------------------------------------------------------------
    # 13. Playoff Seeding & Bracket Auto-Fill (PPHL §3.13)
    # -----------------------------------------------------------------------
    ("URD13.1", "Playoff Seeding & Bracket Auto-Fill",
     "FR-3.13.1",
     "Define points per win/tie/OT.",
     "Partial", "UC-09",
     "R1",
     "divisions.playoff_config JSONB schema (points + tiebreakers); admin editor pending."),
    ("URD13.2", "Playoff Seeding & Bracket Auto-Fill",
     "FR-3.13.2",
     "Auto-generate playoff brackets.",
     "In Progress", "UC-09",
     "R1",
     "Bracket generator algorithm pending (backlog 9.7, 3 eng-weeks)."),
    ("URD13.3", "Playoff Seeding & Bracket Auto-Fill",
     "FR-3.13.3",
     "Publish games to schedules.",
     "In Progress", "UC-09",
     "R1",
     "Will fan-out into games table once URD13.2 lands."),

    # -----------------------------------------------------------------------
    # 14. Pickup Hockey Scheduling (PPHL §3.14)
    # -----------------------------------------------------------------------
    ("URD14.1", "Pickup Hockey Scheduling",
     "FR-3.14.1",
     "Online registration with payment for pickup games.",
     "Not Started", "UC-10",
     "—",
     "Pickup module not started."),
    ("URD14.2", "Pickup Hockey Scheduling",
     "FR-3.14.2",
     "Cap number of skaters/goalies.",
     "Not Started", "UC-10",
     "—",
     "Pending pickup module."),
    ("URD14.3", "Pickup Hockey Scheduling",
     "FR-3.14.3",
     "Auto-balance teams by skill rating.",
     "Not Started", "UC-10",
     "—",
     "Skill-rating model not started."),
    ("URD14.4", "Pickup Hockey Scheduling",
     "FR-3.14.4",
     "Waitlist functionality.",
     "Not Started", "UC-10",
     "—",
     "Pending pickup module."),

    # -----------------------------------------------------------------------
    # 15. Tournament Registration & Management (PPHL §3.15)
    # -----------------------------------------------------------------------
    ("URD15.1", "Tournament Registration & Management",
     "FR-3.15.1",
     "Tournament landing pages.",
     "In Progress", "UC-09",
     "R1",
     "leagues.format = tournament enum live; landing-page generator pending."),
    ("URD15.2", "Tournament Registration & Management",
     "FR-3.15.2",
     "Automated roster validation.",
     "Partial", "UC-05",
     "R1",
     "Admin compliance queue handles roster validation; tournament-specific checks pending."),
    ("URD15.3", "Tournament Registration & Management",
     "FR-3.15.3",
     "Scheduling software with fair matchups.",
     "In Progress", "UC-06",
     "R1",
     "Depends on URD8.2 auto-scheduler."),
    ("URD15.4", "Tournament Registration & Management",
     "FR-3.15.4",
     "Mobile-first score updates.",
     "In Progress", "UC-11",
     "R1",
     "Depends on URD5.1 scorekeeper UI."),
    ("URD15.5", "Tournament Registration & Management",
     "FR-3.15.5",
     "License scan for ID checks.",
     "Partial", "UC-29",
     "R1",
     "Admin compliance review supports ID uploads; OCR / scan integration pending."),

    # -----------------------------------------------------------------------
    # 16. Family & Multi-Team Dashboard (PPHL §3.16)
    # -----------------------------------------------------------------------
    ("URD16.1", "Family & Multi-Team Dashboard",
     "FR-3.16.1",
     "Parents can manage multiple children/teams.",
     "Not Started", "UC-32, UC-33",
     "—",
     "Parent-child linkage schema present; family dashboard UI not started."),
    ("URD16.2", "Family & Multi-Team Dashboard",
     "FR-3.16.2",
     "Sync calendar, payments, messages across linked accounts.",
     "Not Started", "UC-32",
     "—",
     "Pending parent dashboard."),

    # -----------------------------------------------------------------------
    # 17. Team Communication Tools (PPHL §3.17)
    # -----------------------------------------------------------------------
    ("URD17.1", "Team Communication Tools",
     "FR-3.17.1",
     "Built-in chat, SMS, email.",
     "Partial", "UC-20",
     "R1",
     "Templated email/SMS dispatch scaffolded; real-time chat UI pending."),
    ("URD17.2", "Team Communication Tools",
     "FR-3.17.2",
     "Announcements from captains/coaches.",
     "Partial", "UC-19, UC-20",
     "R1",
     "Announcement endpoints + templates live; captain announcement UI pending."),
    ("URD17.3", "Team Communication Tools",
     "FR-3.17.3",
     "Auto-reminders for payments and games.",
     "Partial", "UC-18, UC-21",
     "R1",
     "Overdue + game-change reminder cron live; channel delivery depends on URD10.x providers."),

    # -----------------------------------------------------------------------
    # 18. Custom Forms, Surveys & Feedback (PPHL §3.18)
    # -----------------------------------------------------------------------
    ("URD18.1", "Custom Forms, Surveys & Feedback",
     "FR-3.18.1",
     "Custom forms for waivers, evaluations, feedback.",
     "Completed", "UC-27",
     "R1",
     "form-builder-tab.tsx + funnel runtime. Commit 5ad4e59."),
    ("URD18.2", "Custom Forms, Surveys & Feedback",
     "FR-3.18.2",
     "Export form data to CSV.",
     "Completed", "—",
     "R1",
     "/reports → registrations + standings + rosters CSV exports."),

    # -----------------------------------------------------------------------
    # 19. Admin / Backend Functionality (PPHL §3.19)
    # -----------------------------------------------------------------------
    ("URD19.1", "Admin / Backend Functionality",
     "FR-3.19.1",
     "Full CMS-style admin dashboard.",
     "Completed", "—",
     "R1",
     "superadmin-web (admin) routes — orgs, leagues, seasons, divisions, teams, users, finance, reports."),
    ("URD19.2", "Admin / Backend Functionality",
     "FR-3.19.2",
     "Role-based permissions (RBAC).",
     "Completed", "—",
     "R1",
     "user_role_assignments + RolesGuard / SuperAdminGuard / AuthorizedAccessGuard + loadUserScope."),
    ("URD19.3", "Admin / Backend Functionality",
     "FR-3.19.3",
     "Audit logs and activity tracking.",
     "Completed", "UC-29, UC-17",
     "R1",
     "Global AuditInterceptor records every 2xx mutation; resource.verb action labels."),
    ("URD19.4", "Admin / Backend Functionality",
     "FR-3.19.4",
     "Email marketing (built-in or Mailchimp API).",
     "Not Started", "UC-19",
     "—",
     "Out of scope until real email provider lands (URD1.3 / URD10.x)."),

    # -----------------------------------------------------------------------
    # 20. Coaches Practice Corner (PPHL §3.20)
    # -----------------------------------------------------------------------
    ("URD20.1", "Coaches Practice Corner",
     "FR-3.20.1",
     "Upload/share practice plans (PDF, video).",
     "Not Started", "UC-24",
     "—",
     "Practice-plan storage not started."),
    ("URD20.2", "Coaches Practice Corner",
     "FR-3.20.2",
     "Assign jerseys for practices.",
     "Not Started", "—",
     "—",
     "Practice-jersey schema not started."),
    ("URD20.3", "Coaches Practice Corner",
     "FR-3.20.3",
     "Video breakdown integration (HUDL-style).",
     "Not Started", "UC-24",
     "—",
     "External video-breakdown integration not started."),

    # -----------------------------------------------------------------------
    # 21. Mobile App Features (PPHL §3.21)
    # -----------------------------------------------------------------------
    ("URD21.1", "Mobile App Features",
     "FR-3.21.1",
     "Provide schedules, standings, stats, rosters on mobile.",
     "Not Started", "UC-13, UC-32",
     "—",
     "Native iOS/Android shells not started; web app is mobile-responsive."),
    ("URD21.2", "Mobile App Features",
     "FR-3.21.2",
     "Support push notifications.",
     "Not Started", "UC-21",
     "—",
     "FCM/APNs integration depends on native shells."),
    ("URD21.3", "Mobile App Features",
     "FR-3.21.3",
     "Role-based views (Player, Captain, Admin, Ref).",
     "Not Started", "—",
     "—",
     "Mirrors superadmin role gating once native shells ship."),
]


# ---------------------------------------------------------------------------
# Build the workbook by cloning the template and overwriting rows
# ---------------------------------------------------------------------------
def fmt_id(idx: int) -> str:
    """Match the template's zero-padded 3-digit ID style (001, 002, ...)."""
    return f"{idx:03d}"


def test_case_from_urd(urd: str) -> str:
    """URD1.1 → ITC1.1, mirroring the template's convention."""
    return "ITC" + urd.removeprefix("URD")


def main() -> None:
    if not TEMPLATE.exists():
        raise SystemExit(f"Template not found: {TEMPLATE}")

    shutil.copyfile(TEMPLATE, OUT)
    wb = load_workbook(OUT)
    ws = wb["Requirement_Traceability_Matrix"]

    # 1. Update project metadata cells (col C on rows 2..5)
    label_to_row = {
        "Project Name:": 2,
        "National Center:": 3,
        "Project Manager Name:": 4,
        "Project Description:": 5,
    }
    for label, row in label_to_row.items():
        ws.cell(row=row, column=3, value=PROJECT_META[label])

    # 2. Clear the template's sample data rows (rows 7..ws.max_row)
    for row in ws.iter_rows(min_row=7, max_row=ws.max_row):
        for cell in row:
            cell.value = None
            # Drop any per-cell fill so we don't inherit a leftover colour
            if cell.fill and cell.fill.fgColor and cell.fill.fgColor.rgb not in (None, "00000000"):
                cell.fill = PatternFill(fill_type=None)

    # 3. Re-style headers with column widths matching the template + a wider
    #    Status column so the chip stays readable.
    header_alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
    for col in range(1, 12):
        ws.cell(row=6, column=col).alignment = header_alignment
    ws.row_dimensions[6].height = 36

    # Slightly widen Status and Tech-Spec columns for the new content
    widths = {
        "A": 5,    # ID
        "B": 9,    # URD
        "C": 32,   # Module
        "D": 56,   # Functional Requirement
        "E": 13,   # Status
        "F": 16,   # Technical Specification (UC refs)
        "G": 11,   # Test Case Number
        "H": 10,   # Tested In
        "I": 14,   # Implemented In
        "J": 13,   # Verification
        "K": 70,   # Additional Comments
    }
    for col_letter, w in widths.items():
        ws.column_dimensions[col_letter].width = w

    # 4. Write the requirement rows starting at row 7
    body_font = Font(name="Arial", size=9)
    bold_body_font = Font(name="Arial", size=9, bold=True)
    wrap_left = Alignment(wrap_text=True, vertical="top", horizontal="left")
    wrap_center = Alignment(wrap_text=True, vertical="top", horizontal="center")
    thin = Side(style="thin", color="BFBFBF")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    for i, row in enumerate(REQ_ROWS, start=1):
        urd, module, fr_id, fr_text, status, uc_refs, impl_in, comments = row
        r = 6 + i  # data rows start at row 7

        # Compose the functional requirement cell so the FR-3.x.y label
        # stays attached to the text (matches the template's style of
        # putting the spec ID in-line with the description).
        fr_cell_text = f"[{fr_id}] {fr_text}"

        tested_in = impl_in
        verification = VERIFICATION_FROM_STATUS[status]
        tc_number = test_case_from_urd(urd)

        values = [
            fmt_id(i),    # A — ID
            urd,          # B — URD
            module,       # C — Technical Assumption(s) / Customer Need(s)
            fr_cell_text, # D — Functional Requirement
            status,       # E — Status
            uc_refs,      # F — Technical Specification
            tc_number,    # G — Test Case Number
            tested_in,    # H — Tested In
            impl_in,      # I — Implemented In
            verification, # J — Verification
            comments,     # K — Additional Comments
        ]

        for col_idx, val in enumerate(values, start=1):
            cell = ws.cell(row=r, column=col_idx, value=val)
            cell.font = body_font
            cell.border = border
            # Centre the short reference / status columns; left-align text columns
            if col_idx in (1, 2, 5, 6, 7, 8, 9, 10):
                cell.alignment = wrap_center
            else:
                cell.alignment = wrap_left

        # Status fill chip
        status_cell = ws.cell(row=r, column=5)
        status_cell.fill = STATUS_FILLS[status]
        status_cell.font = bold_body_font

        ws.row_dimensions[r].height = 48

    # Freeze the header so the matrix is navigable
    ws.freeze_panes = "A7"

    wb.save(OUT)
    print(f"Wrote {OUT.relative_to(DOC_DIR.parent)} — {len(REQ_ROWS)} requirements across "
          f"{len({r[1] for r in REQ_ROWS})} modules.")


if __name__ == "__main__":
    main()
