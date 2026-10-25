"""Build the PPHL traceability matrix from evidence.

    python doc/traceability/build.py

Inputs
  - PPHL requirements (FR-3.x.y) and use cases (UC-xx): the two PPHL
    documents in doc/, as rows kept in doc/build-traceability-xlsx.py
    (text only; its May-2026 "status" column is NOT trusted).
  - Module map M1..M21 (doc/testing/pphl-journey-matrix.md), restated here
    with the routes, API prefixes, tables and journeys of each module.
  - Evidence (all optional; missing files simply mean "no evidence"):
      test-results-audit/<env>/crawl-<role>.json   full-surface crawl per role
      test-results-audit/crawl-<role>.json          (first staging crawl)
      test-results-audit/journeys-<env>.log         journey runs (line reporter)
      doc/testing/bugs/*.md                          logged findings

Outputs
  - doc/traceability/MATRIX.md       the matrix, readable in the repo
  - doc/traceability-matrix.xlsx     the same, in PPHL's workbook format
    (sheets: Requirements, Modules & Release 1, Routes, Bugs)

A status is never typed by hand. It is computed from:
  1. journey evidence (a Playwright run in a real browser, per role),
  2. route evidence (the crawl: 404 / error boundary / failed API call),
  3. otherwise "no evidence".
"""
from __future__ import annotations

import importlib.util
import json
import re
import shutil
from collections import defaultdict
from datetime import date
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT / "doc"
EVIDENCE = ROOT / "test-results-audit"
TEMPLATE = DOC / "Tracibility Matrix (1).xlsx"
OUT_XLSX = DOC / "traceability-matrix.xlsx"
OUT_MD = DOC / "traceability" / "MATRIX.md"
TODAY = date.today().isoformat()

# --------------------------------------------------------------------------
# Requirement text: reuse the rows already transcribed from the PPHL docs.
# --------------------------------------------------------------------------
def load_req_rows():
    spec = importlib.util.spec_from_file_location("old_matrix", DOC / "build-traceability-xlsx.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod.REQ_ROWS


# --------------------------------------------------------------------------
# Modules. tier: "core" (release 1 must work), "r1" (release 1 if it
# works, else hide), "later" (not release 1; hide from navigation).
# --------------------------------------------------------------------------
MODULES = {
    "M1": dict(name="Identity, users, roles", tier="core",
               SA=["/users", "/users/:id", "/persons", "/persons/:id", "/roles", "/admin"],
               OA=["/onboarding"], TA=["/onboarding"], PL=["/onboarding", "/profile"],
               api=["iam", "cross-org-grants"], tables=["profiles", "persons", "roles", "user_role_assignments"],
               journeys=["J2", "J17"], ucs=[]),
    "M2": dict(name="Organisations and org setup", tier="core",
               SA=["/organizations", "/organizations/:id", "/org-setup"], OA=["/", "/organization", "/org-setup"],
               api=["orgs", "org-admin"], tables=["orgs", "org_relations", "regions"],
               journeys=["J1"], ucs=[]),
    "M3": dict(name="Leagues, seasons, divisions, regions", tier="core",
               SA=["/leagues", "/leagues/:id", "/seasons", "/seasons/:id", "/divisions", "/divisions/:id"],
               OA=["/leagues", "/leagues/:id", "/seasons", "/seasons/:id", "/divisions", "/divisions/:id"],
               api=["league/leagues", "league/seasons", "league/divisions", "league/regions"],
               tables=["leagues", "seasons", "divisions", "regions"], journeys=["J1"], ucs=[]),
    "M4": dict(name="Teams and team movement", tier="core",
               SA=["/teams", "/teams/new", "/teams/:id"], OA=["/teams", "/teams/new", "/teams/:id"],
               TA=["/captain/team"], PL=["/team"],
               api=["league/teams"], tables=["teams", "division_team_entries", "team_movements"],
               journeys=["J1", "J7"], ucs=["UC-33"]),
    "M5": dict(name="Registration forms, pricing, waivers", tier="core",
               SA=["/forms", "/forms/:id"], OA=["/forms", "/forms/:id"],
               api=["registration/forms", "registration-v2/pricing-tiers", "registration-v2/email-templates"],
               tables=["registration_forms", "registration_form_versions", "pricing_tiers", "waiver_templates"],
               journeys=["J3"], ucs=["UC-01", "UC-27"]),
    "M6": dict(name="Player registration funnel and review", tier="core",
               SA=["/registrations", "/registration/:id"], OA=["/registrations"],
               PL=["/register", "/register/:id", "/registrations", "/registrations/:id", "/registrations/:id/teams", "/parental-consent/:id"],
               api=["public/registration", "registration-v2/admin", "registration/registrations", "registration/self"],
               tables=["registrations", "registration_submissions", "consent_requests"],
               journeys=["J4", "J5"], ucs=["UC-01", "UC-02", "UC-27", "UC-28"]),
    "M7": dict(name="Free agents", tier="core",
               SA=["/registrations"], OA=["/registrations"], TA=["/captain/free-agents"], PL=["/register/free-agent"],
               api=["registration-v2/free-agent-pool"], tables=["free_agent_pool_entries"],
               journeys=["J6"], ucs=["UC-03"]),
    "M8": dict(name="Finance: invoices, payments, wallet, refunds", tier="core",
               SA=["/finance", "/finance/ar", "/finance/create", "/finance/:id", "/payments"], OA=["/finance", "/finance/create"],
               TA=["/captain/dues"], PL=["/payments"],
               api=["finance", "finance/wallet", "finance/refunds", "finance/splits", "finance/escalations", "org-admin/finance"],
               tables=["invoices", "payments", "wallets", "wallet_entries", "refund_assessments", "installment_schedules"],
               journeys=["J13", "J14"], ucs=["UC-15", "UC-16", "UC-17", "UC-18"]),
    "M9": dict(name="Captain team registration (approval gate)", tier="core",
               SA=["/seasons/:id/applications", "/division-applications"], OA=["/divisions/:id"],
               TA=["/captain/register", "/captain/register/:id", "/captain/register/setup/:id"],
               api=["league/division-team-entries"], tables=["division_team_entries"],
               journeys=["J7"], ucs=[]),
    "M10": dict(name="Roster, invites, join requests, transfers", tier="core",
                SA=["/rosters", "/transfers"], OA=["/teams/:id"],
                TA=["/roster", "/captain/roster", "/captain/invites", "/captain/join-requests"], PL=["/team", "/invite/:id"],
                api=["roster", "roster/moves", "registration-v2/team-invites", "public/registration/invites"],
                tables=["team_memberships", "team_invites", "team_join_requests", "roster_moves", "transfers"],
                journeys=["J8"], ucs=["UC-04", "UC-33"]),
    "M11": dict(name="Eligibility, documents, suspensions", tier="r1",
                SA=["/eligibility", "/documents", "/documents/:id"], TA=["/captain/compliance"], PL=["/compliance"],
                api=["compliance", "compliance/eligibility", "compliance/documents", "compliance/self", "suspensions"],
                tables=["eligibility_records", "documents", "suspensions", "waiver_signatures"],
                journeys=["J9", "J12"], ucs=["UC-05", "UC-14", "UC-29"]),
    "M12": dict(name="Venues and scheduling", tier="core",
                SA=["/venues", "/scheduling", "/scheduling/:id/generate", "/scheduling/:id/conflicts", "/scheduling/:id/runs",
                    "/scheduling/:id/rinks", "/scheduling/:id/verify", "/scheduling/:id/fairness", "/scheduling/:id/parity",
                    "/scheduling/:id/playoffs", "/scheduling/:id/tournament"],
                OA=["/venues", "/scheduling", "/scheduling/:id/generate", "/scheduling/:id/conflicts", "/scheduling/:id/runs",
                    "/scheduling/:id/rinks", "/scheduling/:id/verify", "/scheduling/:id/fairness", "/scheduling/:id/parity",
                    "/scheduling/:id/playoffs", "/scheduling/:id/tournament"],
                TA=["/schedule"], PL=["/schedule"],
                api=["scheduling"], tables=["venues", "surfaces", "ice_slots", "schedule_runs", "games"],
                journeys=["J10"], ucs=["UC-06", "UC-07", "UC-08", "UC-09", "UC-10"]),
    "M13": dict(name="Games, events, lineups", tier="core",
                SA=["/games", "/games/:id", "/game-events"], TA=["/lineups", "/lineups/:id"],
                api=["games", "game-events", "games/:gameId/lineups"], tables=["games", "game_events", "game_lineups", "game_officials"],
                journeys=["J11"], ucs=["UC-11", "UC-12"]),
    "M14": dict(name="Stats and standings", tier="core",
                SA=["/stats"], TA=["/stats"], PL=["/stats"],
                api=["stats"], tables=["stat_lines", "standings", "leaderboards"], journeys=["J11"], ucs=["UC-13"]),
    "M15": dict(name="Communications and notifications", tier="r1",
                SA=["/communications", "/communications/templates"], OA=["/communications", "/communications/compose"],
                TA=["/comms"], PL=["/notifications", "/notifications/settings"],
                api=["notifications", "notification-templates", "org-admin/broadcast"],
                tables=["notifications", "notification_preferences", "notification_templates"],
                journeys=["J15"], ucs=["UC-19", "UC-20", "UC-21"]),
    "M16": dict(name="Team store", tier="later", TA=["/captain/store"], PL=["/store"],
                api=["team-store"], tables=["team_store_products", "team_store_orders"], journeys=["J16"], ucs=["UC-25", "UC-26"]),
    "M17": dict(name="Audit and reports", tier="r1",
                SA=["/audit", "/audit/:id", "/reports", "/no-show-report"], OA=["/audit", "/audit/:id"],
                api=["reports", "league/reports"], tables=["audit_events"], journeys=[], ucs=[]),
    "M18": dict(name="Data migration (imports)", tier="later", SA=["/data-migration", "/data-migration/:id"],
                api=["imports"], tables=["import_jobs", "import_job_rows"], journeys=[], ucs=[]),
    "M19": dict(name="Video", tier="later", PL=["/video"], api=[], tables=[], journeys=[], ucs=["UC-22", "UC-23", "UC-24"]),
    "M20": dict(name="Referees and substitutes", tier="later", SA=["/games/:id"],
                api=["games"], tables=["game_officials"], journeys=[], ucs=["UC-30", "UC-31"]),
    "M21": dict(name="Parent / multi-child", tier="later", PL=["/parental-consent/:id"],
                api=["public/registration"], tables=["consent_requests"], journeys=["J5"], ucs=["UC-28", "UC-32"]),
    "M22": dict(name="Disputes (org admin)", tier="later", OA=["/disputes"], api=[], tables=[], journeys=[], ucs=[]),
}
APP_LABEL = {"SA": "Admin console", "OA": "Org admin console", "TA": "Captain app", "PL": "Player app"}

# --------------------------------------------------------------------------
# FR -> module, tier, journeys. Tier follows PPHL's own §7.4 acceptance
# list and their 24 Oct ask ("pin down the major components of release
# one"); "later" rows are proposed for hiding until a later release.
# --------------------------------------------------------------------------
FR = {
    # 3.1 finance
    "FR-3.1.1": ("M8", "core", ["J13"]), "FR-3.1.2": ("M8", "core", ["J13", "J14"]), "FR-3.1.3": ("M8", "r1", ["J13"]),
    "FR-3.1.4": ("M17", "r1", []), "FR-3.1.5": ("M8", "r1", ["J13"]), "FR-3.1.6": ("M8", "r1", ["J13"]),
    "FR-3.1.7": ("M6", "core", ["J4"]), "FR-3.1.8": ("M8", "core", ["J14"]), "FR-3.1.9": ("M8", "later", []), "FR-3.1.10": ("M20", "later", []),
    # 3.2 video
    **{f"FR-3.2.{i}": ("M19", "later", []) for i in range(1, 7)},
    # 3.3 goalie911
    "FR-3.3.1": ("M7", "r1", ["J6"]), "FR-3.3.2": ("M15", "later", []), "FR-3.3.3": ("M7", "r1", ["J6"]), "FR-3.3.4": ("M7", "later", []),
    # 3.4 registration
    "FR-3.4.1": ("M6", "core", ["J4", "J6"]), "FR-3.4.2": ("M10", "later", []), "FR-3.4.3": ("M10", "r1", ["J8"]),
    "FR-3.4.4": ("M15", "r1", ["J8"]), "FR-3.4.5": ("M11", "core", ["J4", "J5", "J9"]), "FR-3.4.6": ("M11", "core", ["J9"]), "FR-3.4.7": ("M7", "r1", ["J6"]),
    # 3.5 stats
    "FR-3.5.1": ("M13", "r1", ["J11"]), "FR-3.5.2": ("M14", "core", ["J11"]), "FR-3.5.3": ("M14", "core", ["J11"]),
    "FR-3.5.4": ("M13", "r1", ["J11"]), "FR-3.5.5": ("M11", "r1", ["J12"]),
    # 3.6 wallet
    "FR-3.6.1": ("M8", "r1", ["J13"]), "FR-3.6.2": ("M8", "r1", ["J13"]), "FR-3.6.3": ("M8", "later", []),
    # 3.7 store
    **{f"FR-3.7.{i}": ("M16", "later", ["J16"]) for i in range(1, 4)},
    # 3.8 scheduling
    "FR-3.8.1": ("M12", "core", ["J10"]), "FR-3.8.2": ("M12", "core", ["J10"]), "FR-3.8.3": ("M12", "later", []), "FR-3.8.4": ("M12", "r1", ["J10"]),
    # 3.9 refs
    **{f"FR-3.9.{i}": ("M20", "later", []) for i in range(1, 4)},
    # 3.10 notifications
    "FR-3.10.1": ("M15", "r1", ["J15"]), "FR-3.10.2": ("M15", "later", ["J15"]),
    # 3.11 captain roster
    "FR-3.11.1": ("M10", "core", ["J8"]), "FR-3.11.2": ("M10", "core", ["J8"]), "FR-3.11.3": ("M11", "later", []), "FR-3.11.4": ("M17", "later", []),
    # 3.12 navigation
    "FR-3.12.1": ("M3", "core", ["J1"]), "FR-3.12.2": ("M3", "r1", []),
    # 3.13 playoffs
    "FR-3.13.1": ("M12", "r1", ["J10"]), "FR-3.13.2": ("M12", "r1", ["J10"]), "FR-3.13.3": ("M12", "r1", ["J10"]),
    # 3.14 pickup
    **{f"FR-3.14.{i}": ("M12", "later", []) for i in range(1, 5)},
    # 3.15 tournaments
    **{f"FR-3.15.{i}": ("M12", "later", []) for i in range(1, 6)},
    # 3.16 family
    "FR-3.16.1": ("M21", "later", []), "FR-3.16.2": ("M21", "later", []),
    # 3.17 team comms
    "FR-3.17.1": ("M15", "later", ["J15"]), "FR-3.17.2": ("M15", "r1", ["J15"]), "FR-3.17.3": ("M15", "r1", ["J13", "J15"]),
    # 3.18 forms
    "FR-3.18.1": ("M5", "core", ["J3"]), "FR-3.18.2": ("M17", "r1", []),
    # 3.19 admin
    "FR-3.19.1": ("M2", "core", ["J1", "J2"]), "FR-3.19.2": ("M1", "core", ["J2", "J17"]), "FR-3.19.3": ("M17", "r1", []), "FR-3.19.4": ("M15", "later", []),
    # 3.20 practice corner, 3.21 mobile
    **{f"FR-3.20.{i}": ("M19", "later", []) for i in range(1, 4)},
    **{f"FR-3.21.{i}": ("M19", "later", []) for i in range(1, 4)},
}
TIER_LABEL = {"core": "Release 1 – core", "r1": "Release 1 – if it works, else hide", "later": "Later release – hide now"}

# Journeys (doc/testing/pphl-journey-matrix.md §3). spec = file in tests/e2e/journeys.
JOURNEYS = {
    "J1": "j01-setup", "J2": "j02-invite", "J3": "j03-form", "J4": "j04-player-registration", "J5": "j05-minor-consent",
    "J6": "j06-free-agent", "J7": "j07-team-application", "J8": "j08-captain-invite", "J9": "j09-eligibility",
    "J10": "j10-schedule", "J11": "j11-game-stats", "J12": "j12-suspension", "J13": "j13-finance", "J14": "j14-dues-split",
    "J15": "j15-comms", "J16": "j16-store", "J17": "j17-isolation",
    # added 24 Oct 2026
    "PDF": "pdf-items", "MOVE": "team-movement", "BLK": "blockers-oct24", "BLK2": "blockers-oct24-b", "BLK3": "blockers-oct24-c", "FILT": "list-filters",
}

# Bugs verified fixed in a browser this session, with where the proof is.
# Everything else stays "open" until a journey re-run stops reporting it.
FIXED_BY_HAND = {
    "CAP-14": "public invite lookup on staging: revoked token -> 200 {teamName, seasonName, kind, status:'revoked'} with no email, issuer or token; unknown token -> 404 (staging, 25 Oct)",
    "CAP-7": "pdf-items item 6 + blockers-oct24 item 4 (staging, 24 Oct)",
    "CAP-12": "blockers-oct24 item 3: wizard in Asia/Kolkata, registration opens today (staging, 24 Oct)",
    "REG-10": "same run as CAP-12",
    "SETUP-10": "blockers-oct24-b item 2: New season under league, New division under season, wizard 'existing league' (staging, 24 Oct)",
    "SETUP-9": "pdf-items items 1/4: no id fragments on /users/[id] (staging, 24 Oct)",
    "SETUP-14": "users 83 of 83 shown; fetchAll everywhere (staging, 24 Oct)",
    "REG-9": "pdf-items item 2: player sees open season (staging, 24 Oct)",
    "COMP-2": "migration 0049 on staging + prod; j09 step 2 passed (journey matrix 3a)",
    "MON-2": "migration 0048 on prod; notifications list/mark-read (journey matrix 3a)",
    "SETUP-13": "mojibake removed (journey matrix 3a)", "MON-21": "mojibake removed (journey matrix 3a)", "SCH-21": "mojibake removed (journey matrix 3a)",
    "SETUP-6": "journey matrix 3a: team create with blank rink", "SETUP-4": "journey matrix 3a", "SETUP-3": "journey matrix 3a", "CAP-20": "journey matrix 3a", "REG-26": "journey matrix 3a",
    "REG-1": "journey matrix 3a", "REG-2": "journey matrix 3a", "REG-4": "journey matrix 3a", "REG-17": "journey matrix 3a",
    "REG-6": "journey matrix 3a", "REG-7": "journey matrix 3a", "CAP-2": "journey matrix 3a", "CAP-1": "journey matrix 3a",
    "COMP-5": "journey matrix 3a", "SCH-1": "journey matrix 3a", "SCH-2": "journey matrix 3a", "SCH-22": "journey matrix 3a",
    "MON-1": "journey matrix 3a", "MON-17": "journey matrix 3a", "MON-7": "journey matrix 3a", "MON-3": "journey matrix 3a",
    "SETUP-15": "journey matrix 3a (code fix; league_admin browser check pending)",
    "CAP-3": "captain-v3 run 25 Oct: J6.0 visitor signs up on player-web and reaches the free-agent form (pass)",
    "SCH-18": "same bug as SETUP-6 (team create with blank rink), fixed and journey-verified",
    "SCH-11": "lineups show opponent team names (verified in code; journey check pending)",
    "SCH-15": "game event log shows player names via personMap",
    "COMP-9": "eligibility page pages through all people (fetchAll) and shows names",
}


# Fixed in a commit but not yet proven in a browser on staging/production.
FIXED_IN_CODE = {
    "CONSOLE-1": "commit c66e81f: load() + LoadError in 60 pages; awaiting staging deploy + crawl",
    "CONSOLE-2": "commit c66e81f: roles/[id] page; awaiting deploy",
    "CONSOLE-3": "commit 3ad966b: ScopedAdminGuard + visibility.ts; awaiting deploy + league-admin-console journey",
    "CONSOLE-4": "commits 3ad966b + c66e81f; awaiting deploy",
    "CONSOLE-5": "commit c66e81f: superOnly nav items; awaiting deploy",
    "CONSOLE-6": "commit c66e81f: DivisionDetail orgHref; awaiting deploy",
    "CONSOLE-7": "commit c66e81f: nav entries removed; awaiting deploy; PPHL to confirm release-1 list",
    "CONSOLE-9": "commit 121979a: registration domain accepts v2 states; staging-v3 crawl clean (super admin 129/0)",
    "CONSOLE-10": "commit 6130a2d: dialog X button named Close",
    "CONSOLE-11": "commit 501da9e: list refreshes when the org-admin step is dismissed",
    "CONSOLE-8": "commits f0764ee + 2c8ffc2: one /sign-in chooser, league. link removed, sign-in pages link back",
    "CAP-4": "commit 560c13d: invite emails built in one place with team, season, /invite link, expiry (delivery needs RESEND_API_KEY)",
    "CAP-5": "commit 560c13d: registration call shows denial + admin reason",
    "CAP-6": "commit 560c13d: Register the team always in captain menu + CTA",
    "CAP-8": "commit 560c13d: one kernel current-season rule + season switcher",
    "CAP-24": "commit 560c13d: refuses a second active membership in another open season",
    "MON-8": "commit fd34b62: POST /captain/dues/:teamId/split + Save split; j14 step 3 hardened",
    "MON-6": "commit 2e44db7: fee schedule picker in the composer (installments existed)",
    "SCH-23": "commit 5d87870: lineup editor reads the game's season roster",
    "COMP-18": "commit 5d87870: same fix as SCH-23",
    "SCH-9": "commit 0eda50e: rink form adopts late-arriving orgs",
    "SETUP-7": "commit 6520e3f: role and scope names, never codes",
    "COMP-8": "commit 3ad966b: league admin reads eligibility in scope",
    "CAP-11": "commit 8333b60: people search and person reads limited to the caller's scope",
    "CAP-13": "blockers-oct24-b (edit season incl. registration window) + status hints state the real rule",
    "SCH-4": "commit 4700c18: Add a team on the division page; j10 step 2 drives it",
    "SCH-12": "commit a6bf6b5: scoped game access for league admins, scorekeepers, referees",
    "SCH-13": "commit a6bf6b5: assists from the scoring team's roster",
    "SCH-14": "commit a6bf6b5: infraction + minutes, PIM in stat lines",
    "SCH-17": "commit a6bf6b5: finalize transaction projects stats + standings, notifies teams",
    "SCH-24": "commit a6bf6b5: captain /stats division table + player lines",
    "SCH-7": "commit a6bf6b5: publish to team schedules",
    "SCH-6": "commit a6bf6b5: reschedule with clash checks",
    "REG-5": "commit b3c8998: pay/submit refused until required waivers signed",
    "REG-8": "commit b3c8998: active published form version bound and verified",
    "REG-16": "commit b3c8998: window enforced before any write",
    "REG-25": "commit b3c8998: league forms only for that league's seasons",
    "COMP-4": "commit b3c8998: /compliance lists and signs required documents",
    "MON-9": "commit 370cb34: RefundService caps refunds, lowers total+paid, idempotent",
    "MON-11": "commit 370cb34 + migration 0053 (staging applied; production pending)",
    "MON-13": "commit 370cb34: compose targets org/league/season/division/team (schedule-later not built)",
    "MON-4": "not reproduced on branch (MON fix round 25 Oct)",
    "MON-5": "not reproduced on branch (MON fix round 25 Oct)",
    "COMP-3": "commit 200733b + migration 0054 (staging applied): player/guardian document upload",
    "COMP-1": "commit 200733b: Documents to review queue with approve / reject / request new upload",
    "COMP-10": "commit 200733b: issue / lift suspensions; served games counted at finalize",
    "COMP-12": "commit 200733b: captain compliance lists suspended players",
    "COMP-13": "commit 200733b: lineup save refuses suspended starters/bench",
    "COMP-14": "commit 200733b: sweep: missing data pending, suspension ineligible",
    "COMP-17": "commit 200733b: sweeps never overwrite an admin waiver",
    "CAP-9": "commit 200733b: claim is an offer the player accepts or declines",
    "CAP-10": "commit 200733b: admin free-agent pool panel with Assign to team",
    "REG-12": "commit 200733b: player-app links from the API's PLAYER_WEB_URL",
    "REG-13": "commit 200733b: same as REG-12",
    "REG-14": "commit 200733b: registration type (team / individual / both) enforced",
    "REG-15": "commit 200733b: guardian consent records typed name, text, IP, browser",
    "SCH-3": "commit 200733b: rinks/surfaces editable, delete refused while in use, slots editable",
    "SCH-5": "commit 200733b: New game picks season, division, entered teams, rink",
    "SCH-20": "commit 200733b: searchable, complete team pickers",
    "CAP-18": "player home banner treats a rostered player as active",
    "SCH-25": "stats division filter lists the selected league's divisions only",
    "SETUP-11": "slug derived from the display name; country, language, currency, time zone dropdowns",
    "REG-24": "commit b3c8998: sign-in resume sends the right email",
    "CAP-15": "commit 560c13d: invites use the team's current season (kernel rule)",
    "SETUP-5": "commit f412c60: a division added with Add another division opens expanded",
    "COMP-6": "commit 7235744: eligibility table refreshes after a sweep",
    "SETUP-8": "commit 7235744: invite dialog says when the email was not sent",
    "REG-11": "commit 7235744: review dates use the season's time zone",
    "CAP-21": "commit cdebe92: one roster cap per division for per-player cost and the register wizard",
    "SCH-16": "commit b8e8b16: logging a goal raises the score to the goal tally while the game is in play",
    "CAP-23": "commit 5532b52: New form dialog preselects only the single org or the page's org filter",
    "REG-20": "commit 5532b52: season picked in the New form dialog; Super Admin not offered as audience",
    "MON-20": "commit 3f612dd: bulk invoice target must belong to the billing org; local API on staging: outsider 404, insider 201",
    "SCH-8": "commit 974a8d5: POST /games/publish-schedule notifies each team; local API on staging 17/17, staging player inbox shows it",
    "MON-14": "commit 974a8d5: postpone/cancel notify both teams of a published game; confirm dialog; browser walk on local superadmin-web",
    "SCH-26": "commit bd3c666: player inbox without delivery pills, real times, words not codes",
    "CONSOLE-12": "commit 5fbe9dc: audit scoped by visibleAuditWhere + ScopedAdminGuard; local API on staging 7/7",
    "REG-21": "commit 8716aa9: one A-D skill level list in the kernel; C1/C2/C3 mapped on read and write",
    "CAP-22": "commit 3b2a7c1: one main landmark on the set-up wizard",
    "SCH-10": "commit 200733b: adding a rink reloads the venue's rinks",
    "SCH-19": "commit b2e7cc1: 4xx errors keep field details; local API 409 with existingTeamId, browser link to the existing team",
    "CAP-17": "commit 369f242: GET free-agent-pool/mine; browser on local apps: saved entry reloads in the form",
    "SETUP-16": "commit aef3401 (+200733b time zone): no org preselected with several; browser on local superadmin",
    "CAP-16": "commit 328888e: invite opens the email form; unused dues field removed",
    "MON-16": "commit 328888e: confirmed-without-invoice says dues were not set up here",
    "CONSOLE-13": "commit 65f1579: wrong-role message from the URL, above the form",
    "REG-22": "commit a64206f: Preview opens the builder's player view",
    "REG-23": "commit a64206f: funnel copy matches what happens; one Next button",
    "COMP-7": "commit 356aeaf: waiver notifies player and captains; local API on staging",
    "MON-12": "commit 356aeaf: captain team message; local API on staging 14 recipients, replay idempotent, non-captain 404",
    "SETUP-17": "commits 834156f + 200733b: user type resolved on the server, super admin first",
    "REG-19": "commits 408fec2 + 3ee7809: prices in dollars; new tier live in an open season (local API on staging: open=active, draft=off)",
    "MON-18": "commits c9b4561 + a8812b2: note endpoint (local API 4/4, browser saves), printable receipt, no fake card update",
    "CAP-19": "commits 5da2fee + 338aa22 + 3ee7809 + 6b50648: one season per roster, same rule as the captain roster (GET teams/:id/seasons), every page of memberships; browser on local apps",
    "MON-22": "commit 3642294: invoice issued notice; local API on staging 4/4",
    "MON-24": "commit 3f057e0: Finance filters push /finance, old address keeps its query, pager total only when unfiltered; browser 6/6",
    "MON-23": "commit 398a1c1: Team invoice to the captain, split on Dues into player shares; no double counting; end to end 17/17, J14 5/5",
    "SETUP-2": "commit 8196989: Edit team on admin + org team pages; org admins may edit their org's teams; browser + API 11/11",
    "CONSOLE-17": "commit ba6ad79: keyset paging matches sort order (games, invoices, assignments, notifications, events, imports, roles); walked staging 8/8 exact",
    "REG-27": "commit 52d6726: /org-admin/forms accepts limit + cursor; org season overview loads forms; API 200 (40 = db), browser 2/2",
    "SCH-28": "commit a79aa34: kernel formatInZone; game times in the rink zone on server pages; kernel 91/91, browsers in 2 zones 21/21",
    "COMP-11": "commit e49ba5c: league discipline rules (off until set), ejection on penalties, finalize issues + notifies, Change games override; kernel 105/105, local API 14/14; staging browser walk pending",
    "SETUP-18": "commit e49ba5c: league API returns metadata so Edit league opens with saved values; API PATCH readback",
    "SCH-27": "commit fdae576: bracket refusal says team count, size needed and next step; browser 3/3",
    "CONSOLE-16": "commit 5ed4be7: 28 locale-less format calls pin en-US; no #418 in en-US or en-IN across 4 apps (browser 32/32)",
    "CONSOLE-15": "commit 6e57b35: retry job sends queued rows from the last 24h; flush skips stale; local API on staging 14/14",
    "MON-19": "commit af83078: org admins open an invoice (read-only; refunds wait for the refund decision); API 404 for other orgs; browser 2/2",
}

# Not bugs to fix now: decisions the founder made, with the date.
ACCEPTED = {
    "MON-10": "Founder decision 25 Oct 2026: keep the mock processor so PPHL can test without cards; the pay dialog says no card is charged",
    "REG-3": "Founder decision 25 Oct 2026: mock payments while PPHL tests (see MON-10)",
}

# --------------------------------------------------------------------------
# Evidence loaders
# --------------------------------------------------------------------------
UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)


LATEST_STAGING = {"env": None}
LATEST_PROD = {"env": None}


def load_crawls():
    """{env: {role: [visit,...]}}; LATEST_STAGING["env"] is the newest non-production crawl."""
    out: dict[str, dict[str, list]] = defaultdict(dict)
    newest = (0.0, None)
    newest_prod = (0.0, None)
    if not EVIDENCE.exists():
        return out
    for f in EVIDENCE.rglob("crawl-*.json"):
        # Folder name = run label (staging, prod, staging-v2 ...). The very
        # first staging crawl (24 Oct, before the fixes) landed in the root.
        env = f.parent.name if f.parent != EVIDENCE else "staging-before-fixes"
        role = f.stem.replace("crawl-", "")
        try:
            out[env][role] = json.loads(f.read_text(encoding="utf8"))
        except Exception:
            continue
        if not env.startswith("prod") and f.stat().st_mtime > newest[0]:
            newest = (f.stat().st_mtime, env)
        if env.startswith("prod") and f.stat().st_mtime > newest_prod[0]:
            newest_prod = (f.stat().st_mtime, env)
    LATEST_STAGING["env"] = newest[1]
    LATEST_PROD["env"] = newest_prod[1]
    return out


def load_journey_logs():
    """{env: {spec: {"passed": n, "failed": n, "skipped": n, "findings": set(ids), "tests": [(title, status)]}}}

    Reads Playwright JSON reports written by the evidence run
    (test-results-audit/journeys/<cluster>.json, staging) and any
    test-results-audit/journeys-<env>/*.json. A finding id (SETUP-3,
    REG-12, ...) printed to stdout by a test counts as still open.
    """
    out: dict[str, dict[str, dict]] = defaultdict(dict)
    if not EVIDENCE.exists():
        return out
    files = []
    for f in (EVIDENCE / "journeys").glob("*.json"):
        files.append(("staging", f))
    for d in EVIDENCE.glob("journeys-*"):
        if d.is_dir():
            for f in d.glob("*.json"):
                files.append((d.name.replace("journeys-", ""), f))
    id_re = re.compile(r"\b(SETUP|REG|CAP|COMP|SCH|MON|LA)-\d+\b")

    def walk(suite, file_hint, env):
        file = suite.get("file") or file_hint
        for spec in suite.get("specs", []):
            spec_name = re.sub(r"\.spec\.ts$", "", Path(file or "").name)
            rec = out[env].setdefault(spec_name, {"passed": 0, "failed": 0, "skipped": 0, "findings": set(), "tests": []})
            for t in spec.get("tests", []):
                results = t.get("results", [])
                status = results[-1]["status"] if results else t.get("status", "skipped")
                outcome = "passed" if status in ("passed", "expected") else "skipped" if status == "skipped" else "failed"
                if spec.get("ok") and outcome == "failed":
                    outcome = "passed"  # retried and passed
                if outcome == "failed" and results:
                    msg = re.sub(r"\x1b\[[0-9;]*m", "", (results[-1].get("error") or {}).get("message", ""))
                    first = msg.strip().split("\n")[0]
                    if re.match(r"(Error: )?((SETUP|REG|CAP|COMP|SCH|MON|CONSOLE)-\d+\b|CAP:|soft findings)", first):
                        # The walk ran; what failed is the "no open findings" assertion.
                        rec["findings"].update(id_re.findall(msg))
                        outcome = "finding-check"
                rec.setdefault(outcome, 0)
                rec[outcome] += 1
                rec["tests"].append((spec.get("title", ""), outcome))
                for r in results:
                    for chunk in r.get("stdout", []) + r.get("stderr", []):
                        text = chunk.get("text", "") if isinstance(chunk, dict) else str(chunk)
                        if "finding" in text.lower() or "[BUG" in text:
                            rec["findings"].update(id_re.findall(text))
        for child in suite.get("suites", []):
            walk(child, file, env)

    files.sort(key=lambda ef: ef[1].stat().st_mtime)  # later runs override earlier ones
    for env, f in files:
        try:
            data = json.loads(f.read_text(encoding="utf8"))
        except Exception:
            continue
        for suite in data.get("suites", []):
            walk(suite, suite.get("file"), env)
    return out


def load_bugs():
    bugs = []
    for f in sorted((DOC / "testing" / "bugs").glob("*.md")):
        text = f.read_text(encoding="utf8", errors="replace")
        for m in re.finditer(r"^\[([A-Z]+-\d+)\]\s+(.*?)\s+·\s+(\w+)[^\n]*\n(.*?)(?=^\[[A-Z]+-\d+\]|\Z)", text, re.M | re.S):
            body = m.group(4)
            journey = re.search(r"Journey:\s*([^\n]*)", body)
            surface = re.search(r"Surface:\s*([^\n]*)", body)
            bugs.append({
                "id": m.group(1), "title": m.group(2).strip(), "severity": m.group(3),
                "journey": journey.group(1).strip() if journey else "", "surface": surface.group(1).strip() if surface else "",
                "file": f.name,
            })
    return bugs


# --------------------------------------------------------------------------
# Status computation
# --------------------------------------------------------------------------
def route_pattern(path: str) -> str:
    return UUID_RE.sub(":id", path)


def route_evidence(crawls, module):
    """For each app route of the module: {env: {role: verdict}}; verdict ok|404|error|api-fail|unseen."""
    rows = []
    # A crawl as a role only counts for that role's app (the same path
    # exists in several apps, e.g. /registrations).
    roles_for_app = {"SA": {"superAdmin", "leagueAdmin"}, "OA": {"orgAdmin"}, "TA": {"teamAdmin"}, "PL": {"player"}}
    for app in ("SA", "OA", "TA", "PL"):
        for route in module.get(app, []):
            cell = {}
            for env, roles in crawls.items():
                for role, visits in roles.items():
                    if role not in roles_for_app[app]:
                        continue
                    hits = [v for v in visits if route_pattern(v["url"].split("?")[0]) == route]
                    if not hits:
                        continue
                    worst = "ok"
                    for v in hits:
                        if v["notFound"]:
                            worst = "404"
                        elif v["errorBoundary"] and worst == "ok":
                            worst = "error"
                        elif v["couldNotLoad"] and worst == "ok":
                            worst = "could-not-load"
                        elif v["apiFailures"] and worst == "ok":
                            worst = "api-fail"
                    cell[f"{env}:{role}"] = worst
            rows.append((app, route, cell))
    return rows


# Tests that only summarise findings ("8. no bug findings were recorded",
# "J7.z no defects recorded during the walk", "9 report findings") are not
# steps of the flow; they fail whenever any logged finding is still open.
STEP_SKIP = re.compile(r"finding|defects recorded|no bug", re.I)


def journey_steps(r):
    return [(t, st) for t, st in r.get("tests", []) if not STEP_SKIP.search(t) and st != "finding-check"]


def journey_status(logs, journey_ids):
    """Combine journey runs: (verdict pass|partial|fail|None, detail)."""
    seen = []
    worst = None
    order = {"pass": 0, "partial": 1, "fail": 2}
    for env, specs in logs.items():
        for j in journey_ids:
            spec = JOURNEYS.get(j)
            if not spec or spec not in specs:
                continue
            r = specs[spec]
            steps = journey_steps(r)
            if not steps:
                if r.get("findings") or any(st == "finding-check" for _, st in r.get("tests", [])):
                    # Single-test walk that reached the end and reported findings.
                    v = "partial"
                    seen.append(f"{j}: walk ran to the end; open findings {', '.join(sorted(r['findings'])) or 'see log'} ({env})")
                    worst = v if worst is None or order[v] > order[worst] else worst
                continue
            passed = sum(1 for _, st in steps if st == "passed")
            failed = [t for t, st in steps if st == "failed"]
            skipped = sum(1 for _, st in steps if st == "skipped")
            if not failed and not skipped:
                v = "pass"
                line = f"{j}: all {passed} steps pass ({env})"
            elif passed == 0:
                v = "fail"
                line = f"{j}: first step fails: {failed[0][:70] if failed else 'skipped'} ({env})"
            else:
                v = "partial"
                line = f"{j}: {passed} of {len(steps)} steps pass; failing: {'; '.join(x[:60] for x in failed[:2])} ({env})"
            if r.get("findings"):
                line += f"; open findings {', '.join(sorted(r['findings']))}"
            seen.append(line)
            worst = v if worst is None or order[v] > order[worst] else worst
    return worst, "; ".join(seen)


def compute_status(fr_id, tier, module_id, crawls, logs, claimed):
    module = MODULES[module_id]
    journeys = FR[fr_id][2]
    jv, jdetail = journey_status(logs, journeys)
    routes = route_evidence(crawls, module)
    latest = LATEST_STAGING["env"]
    def bad_in(cell, envs, kinds):
        return any(v in kinds for k, v in cell.items() if k.split(":")[0] in envs)
    broken = [(a, r) for a, r, cell in routes if bad_in(cell, {latest}, ("404", "error"))]
    broken_prod = [(a, r) for a, r, cell in routes if bad_in(cell, {LATEST_PROD["env"]} if LATEST_PROD["env"] else set(), ("404", "error"))]
    loads = [(a, r) for a, r, cell in routes if bad_in(cell, {latest}, ("could-not-load", "api-fail"))]
    seen_routes = [(a, r) for a, r, cell in routes if cell]
    if tier == "later" and claimed in ("Not Started", "In Progress"):
        return "Not built", "Deferred to a later release; no screen claimed."
    if broken:
        return "Broken", f"Route 404/error in the latest staging crawl ({latest}): " + ", ".join(f"{a}{r}" for a, r in broken[:4])
    if broken_prod and jv != "fail":
        return "Fixed on staging, pending production", "Production crawl still shows 404/error on: " + ", ".join(f"{a}{r}" for a, r in broken_prod[:4]) + (f"; {jdetail}" if jdetail else "")
    if jv == "fail":
        return "Broken", jdetail
    if jv == "partial":
        return "Partly working", jdetail
    if jv == "pass":
        return "Working", jdetail
    if loads:
        return "Degraded", "Page renders but a call failed: " + ", ".join(f"{a}{r}" for a, r in loads[:4])
    if seen_routes:
        return "Renders, flow untested", f"{len(seen_routes)} route(s) load in the crawl; no journey run yet"
    if claimed == "Not Started":
        return "Not built", "No screen; May-2026 matrix also says not started."
    return "No evidence", "No crawl hit and no journey run for this requirement's routes."


STATUS_FILL = {
    "Working": "D1FAE5", "Partly working": "FEF3C7", "Fixed on staging, pending production": "DBEAFE", "Degraded": "FEF3C7", "Renders, flow untested": "E0E7FF",
    "Broken": "FEE2E2", "Not built": "F3F4F6", "No evidence": "FDE68A",
}


# --------------------------------------------------------------------------
# Writers
# --------------------------------------------------------------------------
def write_xlsx(req_rows, crawls, logs, bugs, fixed):
    shutil.copyfile(TEMPLATE, OUT_XLSX)
    wb = load_workbook(OUT_XLSX)
    ws = wb["Requirement_Traceability_Matrix"]
    ws.cell(row=2, column=3, value="SportsPulse — PPHL release 1")
    ws.cell(row=3, column=3, value="Sports Pulse Co.")
    ws.cell(row=4, column=3, value="Generated by doc/traceability/build.py")
    ws.cell(row=5, column=3, value=f"Status is computed from browser evidence (crawl + journeys) on {TODAY}. Never typed by hand.")
    for row in ws.iter_rows(min_row=7, max_row=ws.max_row):
        for c in row:
            c.value = None
            c.fill = PatternFill(fill_type=None)
    headers = ["ID", "FR", "Module", "Requirement", "Status (evidence)", "Use cases", "Release tier", "Journeys", "Screens", "Evidence", "Implementation notes (May 2026 matrix, not evidence)"]
    for i, h in enumerate(headers, 1):
        c = ws.cell(row=6, column=i, value=h)
        c.font = Font(name="Arial", size=9, bold=True)
        c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
    widths = {"A": 5, "B": 10, "C": 26, "D": 50, "E": 20, "F": 14, "G": 22, "H": 14, "I": 40, "J": 50, "K": 60}
    for k, w in widths.items():
        ws.column_dimensions[k].width = w
    thin = Side(style="thin", color="BFBFBF")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    font = Font(name="Arial", size=9)
    for i, (urd, _m, fr_id, fr_text, claimed, uc_refs, _impl, comments) in enumerate(req_rows, 1):
        module_id, tier, journeys = FR[fr_id]
        status, detail = compute_status(fr_id, tier, module_id, crawls, logs, claimed)
        screens = "; ".join(f"{APP_LABEL[a]}: {', '.join(MODULES[module_id].get(a, []))}" for a in ("SA", "OA", "TA", "PL") if MODULES[module_id].get(a))
        vals = [f"{i:03d}", fr_id, f"{module_id} {MODULES[module_id]['name']}", fr_text, status, uc_refs, TIER_LABEL[tier],
                ", ".join(journeys) or "—", screens, detail, comments]
        r = 6 + i
        for col, v in enumerate(vals, 1):
            c = ws.cell(row=r, column=col, value=v)
            c.font = font
            c.border = border
            c.alignment = Alignment(wrap_text=True, vertical="top")
        ws.cell(row=r, column=5).fill = PatternFill("solid", fgColor=STATUS_FILL[status])
        ws.row_dimensions[r].height = 42
    ws.freeze_panes = "A7"

    # Modules sheet
    ms = wb.create_sheet("Modules & Release 1")
    ms.append(["Module", "Name", "Release tier", "Admin console", "Org admin console", "Captain app", "Player app", "API", "Tables", "Journeys", "Use cases"])
    for mid, m in MODULES.items():
        ms.append([mid, m["name"], TIER_LABEL[m["tier"]], ", ".join(m.get("SA", [])), ", ".join(m.get("OA", [])), ", ".join(m.get("TA", [])),
                   ", ".join(m.get("PL", [])), ", ".join(m["api"]), ", ".join(m["tables"]), ", ".join(m["journeys"]), ", ".join(m["ucs"])])
    for col, w in zip("ABCDEFGHIJK", [8, 34, 28, 40, 40, 30, 30, 36, 40, 14, 20]):
        ms.column_dimensions[col].width = w

    # Routes sheet: every crawled route per env/role
    rs = wb.create_sheet("Routes")
    rs.append(["Env", "Role", "Route", "Pattern", "HTTP", "Verdict", "h1 / title", "Failed API calls", "Load ms", "Reached from"])
    for env, roles in sorted(crawls.items()):
        for role, visits in sorted(roles.items()):
            for v in visits:
                verdict = "404" if v["notFound"] else "error" if v["errorBoundary"] else "could-not-load" if v["couldNotLoad"] else "api-fail" if v["apiFailures"] else "placeholder" if v["placeholder"] else "ok"
                rs.append([env, role, v["url"], v["pattern"], v["status"], verdict, v["h1"] or v["title"], " | ".join(v["apiFailures"][:3]), v["ms"], v["from"] or ""])
    for col, w in zip("ABCDEFGHIJ", [9, 12, 48, 36, 6, 14, 36, 60, 8, 40]):
        rs.column_dimensions[col].width = w

    # Bugs sheet
    bs = wb.create_sheet("Bugs")
    bs.append(["ID", "Severity", "Title", "Journey", "Surface", "Status", "Evidence / where fixed"])
    for b in bugs:
        st, ev = fixed.get(b["id"], ("open", ""))
        bs.append([b["id"], b["severity"], b["title"], b["journey"], b["surface"], st, ev])
    for col, w in zip("ABCDEFG", [10, 9, 70, 24, 30, 12, 60]):
        bs.column_dimensions[col].width = w
    wb.save(OUT_XLSX)


def write_md(req_rows, crawls, logs, bugs, fixed):
    lines = [f"# PPHL traceability matrix", "",
             f"Generated {TODAY} by `doc/traceability/build.py`. Every status comes from a browser run "
             f"(crawl as each role, or a journey); nothing here is typed by hand. Re-run the crawl and the journeys, then this script.", ""]
    # Evidence summary
    lines += ["## Evidence used", ""]
    for env, roles in sorted(crawls.items()):
        for role, visits in sorted(roles.items()):
            bad = [v for v in visits if v["notFound"] or v["errorBoundary"]]
            lines.append(f"- Crawl **{env}** as **{role}**: {len(visits)} pages, {len(bad)} 404/error, "
                         f"{sum(1 for v in visits if v['apiFailures'])} with a failed API call.")
    for env, specs in sorted(logs.items()):
        for spec, r in sorted(specs.items()):
            steps = journey_steps(r)
            failed = [t for t, st in steps if st == "failed"]
            lines.append(f"- Journey **{spec}** on **{env}**: {sum(1 for _, st in steps if st == 'passed')} of {len(steps)} steps pass"
                         + (f"; failing: {'; '.join(x[:70] for x in failed)}" if failed else "")
                         + (f"; open findings: {', '.join(sorted(r['findings']))}" if r['findings'] else ""))
    if not crawls and not logs:
        lines.append("- No evidence files found yet.")
    # Totals
    counts = defaultdict(int)
    tier_counts = defaultdict(lambda: defaultdict(int))
    rows_md = []
    for urd, _m, fr_id, fr_text, claimed, uc_refs, _impl, comments in req_rows:
        module_id, tier, journeys = FR[fr_id]
        status, detail = compute_status(fr_id, tier, module_id, crawls, logs, claimed)
        counts[status] += 1
        tier_counts[tier][status] += 1
        rows_md.append((fr_id, module_id, tier, status, fr_text, uc_refs, ", ".join(journeys) or "—", detail))
    lines += ["", "## Totals", "", "| Status | All 78 FRs | Release 1 core | Release 1 if works | Later |", "|---|---|---|---|---|"]
    for st in ["Working", "Partly working", "Fixed on staging, pending production", "Degraded", "Renders, flow untested", "Broken", "No evidence", "Not built"]:
        lines.append(f"| {st} | {counts[st]} | {tier_counts['core'][st]} | {tier_counts['r1'][st]} | {tier_counts['later'][st]} |")
    # Release 1 scope
    lines += ["", "## Release 1 scope (proposal for PPHL to confirm)", "",
              "PPHL (24 Oct): \"pin down the major components of our first release\". Modules marked **later** should be hidden from navigation until that release.", "",
              "| Module | Tier | Where |", "|---|---|---|"]
    for mid, m in MODULES.items():
        where = "; ".join(f"{APP_LABEL[a]} {', '.join(m[a])}" for a in ("SA", "OA", "TA", "PL") if m.get(a))
        lines.append(f"| {mid} {m['name']} | {TIER_LABEL[m['tier']]} | {where} |")
    # Requirements
    lines += ["", "## Requirements", "", "| FR | Module | Tier | Status | Requirement | Use cases | Journeys | Evidence |", "|---|---|---|---|---|---|---|---|"]
    for fr_id, module_id, tier, status, fr_text, uc_refs, journeys, detail in rows_md:
        lines.append(f"| {fr_id} | {module_id} | {tier} | **{status}** | {fr_text} | {uc_refs} | {journeys} | {detail} |")
    # Broken routes
    lines += ["", "## Routes with a 404, error boundary or failed call (from the crawl)", ""]
    any_bad = False
    for env, roles in sorted(crawls.items()):
        for role, visits in sorted(roles.items()):
            for v in visits:
                if v["notFound"] or v["errorBoundary"] or v["couldNotLoad"] or v["apiFailures"]:
                    any_bad = True
                    kind = "404" if v["notFound"] else "error" if v["errorBoundary"] else "could not load" if v["couldNotLoad"] else "API failure"
                    lines.append(f"- **{env} / {role}** `{v['url']}` → {kind}" + (f" ({'; '.join(v['apiFailures'][:2])})" if v["apiFailures"] else "") + (f" — reached from `{v['from']}`" if v["from"] else ""))
    if not any_bad:
        lines.append("- None recorded.")
    # Bugs
    open_bugs = [b for b in bugs if fixed.get(b["id"], ("open",))[0] == "open"]
    lines += ["", f"## Logged findings: {len(bugs)} total, {len(open_bugs)} still open", "",
              "| ID | Severity | Title | Journey | Status | Evidence |", "|---|---|---|---|---|---|"]
    for b in bugs:
        st, ev = fixed.get(b["id"], ("open", ""))
        lines.append(f"| {b['id']} | {b['severity']} | {b['title']} | {b['journey']} | {st} | {ev} |")
    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf8")


def main():
    req_rows = load_req_rows()
    missing = [r[2] for r in req_rows if r[2] not in FR]
    if missing:
        raise SystemExit(f"FR mapping missing for: {missing}")
    crawls = load_crawls()
    logs = load_journey_logs()
    bugs = load_bugs()
    fixed = {k: ("fixed", v) for k, v in FIXED_BY_HAND.items()}
    fixed.update({k: ("fixed in code, not deployed", v) for k, v in FIXED_IN_CODE.items()})
    fixed.update({k: ("accepted (decision)", v) for k, v in ACCEPTED.items()})
    # A journey re-run that no longer reports a finding counts as fixed for that id.
    for env, specs in logs.items():
        for spec, r in specs.items():
            jid = next((j for j, s in JOURNEYS.items() if s == spec), None)
            if not jid:
                continue
            # Only a clean run (every step passed, no finding-check failure)
            # can say a logged bug did not reproduce; otherwise it stays open.
            clean = r["failed"] == 0 and not any(st == "finding-check" for _, st in r.get("tests", [])) and not r["findings"]
            for b in bugs:
                if clean and jid in b["journey"] and b["id"] not in fixed:
                    fixed[b["id"]] = ("not reproduced", f"{spec} ran clean on {env}")
            for fid in r["findings"]:
                fixed[fid] = ("open", f"still reported by {spec} on {env}")
    write_xlsx(req_rows, crawls, logs, bugs, fixed)
    write_md(req_rows, crawls, logs, bugs, fixed)
    print(f"wrote {OUT_MD.relative_to(ROOT)} and {OUT_XLSX.relative_to(ROOT)}: {len(req_rows)} FRs, {len(MODULES)} modules, {len(bugs)} bugs, crawls={ {e: list(r) for e, r in crawls.items()} }, journeys={ {e: len(s) for e, s in logs.items()} }")


if __name__ == "__main__":
    main()
