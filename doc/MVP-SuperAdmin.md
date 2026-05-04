# SportsPulse — Super Admin App (MVP Spec)

Auth: **Supabase Auth**, email + password (with email verification).

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | **Next.js** (React, App Router, TypeScript) |
| Backend | **NestJS** (TypeScript) |
| Database | **Postgres on Supabase** with **`pg_graphql`** extension enabled |
| Auth | **Supabase Auth** (email + password, email verification ON) |
| GraphQL | Native via `pg_graphql` (Supabase Integrations → GraphQL → Enable `pg_graphql`) |
| DAL | **Drizzle ORM** (raw connection access for RLS via `SET LOCAL app.tenant_id`) |
| Migrations | `drizzle-kit` |

---

## User Roles

1. Super Admin / Platform Admin
2. Org Admin / League Admin
3. Registrar
4. Captain
5. Coach
6. Referee
7. Scorekeeper
8. Player (Adult)
9. Player (Minor / Youth)
10. Parent / Guardian
11. Sponsor
12. Customer Support
13. Spectator / Fan

---

## Modules (MVP)

1. Identity & Access (IAM)
2. League Management
3. Registration & Compliance
4. Roster & Membership
5. Scheduling & Allocation
6. Game Operations
7. Stats Engine
8. Finance & Wallet
9. Communications
10. Audit & Compliance
11. Reporting & Analytics
12. Admin Console
13. Data Migration & Onboarding

---

## 1. Identity & Access (IAM) — MVP Features

### Authentication
- Email + password sign-in (Supabase Auth)
- Sign-out
- Password reset (forgot password)
- Password change (while signed in)

### User Management
- List all users (search, filter, paginate)
- View user profile / detail
- Create user (admin-invite)
- Edit user (name, contact, locale, timezone, country)
- Suspend / reactivate user
- Soft-delete user

### Organization & Tenancy
- List organizations
- Create organization
- Edit organization (name, country, currency, locale)
- Suspend / archive organization
- Org-switcher (super admin acts within any org)

### Roles & Permissions
- List roles
- Assign role to user with scope (org / league / team)
- Revoke role assignment
- View user's effective permissions

### Family Linking
- Link parent/guardian to minor
- Unlink family link

### Audit
- View user activity log (sign-ins, role changes, profile edits)

### Impersonation
- Impersonate a user (time-boxed, audited)

---

## 2. League Management — MVP Features

### Sports
- List supported sports
- Enable / disable sport for an org

### Seasons
- List seasons (filter by org, sport, status)
- Create season (name, sport, dates, registration window, timezone)
- Edit season
- Clone season from prior season
- Change season status (draft → registration_open → in_progress → playoffs → completed → archived)
- Archive season

### Leagues
- List leagues (filter by season, sport, status)
- Create league (under season, sport, format, rule-set)
- Edit league
- Assign rule-set to league (lock on registration open)
- Change league status

### Divisions
- List divisions (under league)
- Create division (age group, tier, gender eligibility, max teams)
- Edit division
- Apply rule-set overrides per division
- Delete / archive division

### Teams
- List teams (filter by org, league, division)
- Create team (name, colors, logo, home venue)
- Edit team
- Assign team to division (DivisionTeamEntry)
- Approve / withdraw team entry
- Dissolve team

### Rule-sets
- List rule-sets (platform + governing-body + org-custom)
- View rule-set definition
- Create / edit org-custom rule-set
- Version rule-set (immutable once in use)

### Age Groups
- List age groups (by governing body)
- Create / edit age group (birth-year range, gender, play-up policy)

### Governing Bodies
- List governing bodies
- Link league to governing body

### Bulk Operations
- Bulk import teams (CSV)
- Bulk import divisions (CSV)

### Audit
- View change history per season / league / division / team

---

## 3. Registration & Compliance — MVP Features

### Registration Forms
- List registration forms (per org / league / division)
- Create form (fields, conditional logic)
- Edit form
- Publish form version (versioned, immutable once published)
- Set form active version
- Clone form

### Registrations
- List registrations (filter by status, league, division, team)
- View registration detail
- Approve registration
- Reject registration (with reason)
- Waitlist registration
- Withdraw registration
- Manually create registration on behalf of user

### Eligibility
- View eligibility record per (player, season, governing body)
- Re-evaluate eligibility (manual trigger)
- Override eligibility with reason (waiver)
- View eligibility evaluation snapshot (audit)

### Waivers & Consents
- List waiver / consent documents
- Upload / edit document (versioned)
- Publish new document version
- View consent signatures per user
- Trigger re-sign campaign on version bump

### Identity Verification
- View governing-body ID records (e.g. USA Hockey #) per player
- Manually verify / mark mismatch
- Track expiry dates

### Bulk Operations
- Bulk import registrations (CSV)
- Bulk approve / reject

### Audit
- View registration change history
- View consent signature log

---

## 4. Roster & Membership — MVP Features

### Rosters
- List rosters (per team, per season)
- View current roster (projection)
- View roster snapshot at a given date

### Roster Moves
- Add player to team
- Drop player from team
- Trade player between teams (atomic)
- Call-up / send-down (for affiliate teams)
- Set membership type (primary, play-up, affiliate, call-up)
- Set effective dates (from / to) per membership
- Assign / edit jersey number
- Assign / edit position
- View roster move history (append-only log)

### Roster Lock
- Set roster lock date per league / division
- Lock / unlock roster (admin override)
- View locked-roster attestations

### Playoff Eligibility
- View playoff-eligible players per team
- Override playoff eligibility (admin)

### Bulk Operations
- Bulk import rosters (CSV)
- Bulk export rosters (CSV)

### Audit
- View roster move log per team / player

---

## 5. Scheduling & Allocation — MVP Features

### Venues & Surfaces
- List venues
- Create venue (name, address, country, region, city, timezone)
- Edit venue
- List surfaces per venue
- Create / edit surface (name, sport, type, capacity)

### Game Slots
- List slots (filter by venue, surface, date range)
- Create slot (manual)
- Bulk create slots (recurring, RRULE)
- Edit slot
- Delete / block slot

### Blackouts
- List blackouts (per venue / surface / team / division)
- Create blackout (date range, recurring, reason)
- Edit / remove blackout

### Schedule Generation
- Run scheduler for a league (OR-Tools CP-SAT)
- View schedule run status (queued / solving / feasible / infeasible / applied)
- View infeasibility report (minimal infeasible subset)
- Apply suggested constraint relaxations
- Re-run scheduler

### Schedule Review & Publish
- Preview draft schedule
- Manual edit (drag-drop / reassign)
- Publish schedule
- Notify affected teams / refs / players on publish

### Games
- List games (filter by league, division, team, date)
- View game detail
- Create game manually
- Edit game (slot, teams, time)
- Postpone game
- Cancel game
- Forfeit game
- Reschedule game

### Officials Assignment
- Assign referee / scorekeeper to game
- Set assignment status (proposed / accepted / declined)
- Reassign on decline / no-show

### Bulk Operations
- Bulk import slots (CSV)
- Bulk import games (CSV)

### Audit
- View schedule change log per game

---

## 6. Game Operations — MVP Features

### Pre-Game
- View game day list
- View game roster + attendance template
- Mark attendance (present / absent / late / sub / scratched)
- Cross-check eligibility (block suspended players)

### Live Event Capture
- Open scorekeeping session for a game
- Append game event (sport-specific event types: goal, penalty, save, etc.)
- View live event log
- Period transitions (start / end)
- Edit live event (correction = append correction event)
- View current game state (score, period, clock)

### Discipline
- View penalty / misconduct events
- Auto-suspension queue (calculated from rule-set thresholds)
- Manual suspension issue
- Override / lift suspension
- Track suspension served count

### Finalization
- Ref reviews scoresheet
- Sign scoresheet (digital signature)
- Lock game (status → completed)
- Trigger stats projection on finalization

### Post-Game Corrections
- Request correction on locked game (with reason)
- Append correction events
- Re-sign scoresheet
- View correction audit chain

### Audit
- View full game event log (immutable)
- View correction history

---

## 7. Stats Engine — MVP Features

### Player Stats
- View player stat line per game
- View player season stats (aggregated)
- View player career stats (across seasons)
- Filter by date range, division, position

### Team Stats
- View team stat line per game
- View team season stats
- View team head-to-head stats

### Standings
- View standings per division
- Sort by points / GF / GA / GD / tiebreakers
- View standings as of a date

### Leaderboards
- View leaderboards per league / division
- Filter by metric (goals, points, save %, etc.)
- Top-N display

### Recompute
- Trigger stats recompute for a game
- Trigger standings recompute for a division
- View recompute history

### Export
- Export stats (CSV)
- Export standings (CSV)

### Audit
- View stats projection version history

---

## 8. Finance & Wallet — MVP Features

### Invoices
- List invoices (filter by org, status, date, recipient)
- View invoice detail
- Create invoice (manual)
- Edit draft invoice
- Issue invoice
- Void invoice
- Resend invoice notification

### Payments
- List payment attempts
- View payment detail (provider ref, status)
- Record offline payment (cash / check)
- Mark invoice paid manually

### Refunds
- Issue full refund
- Issue partial refund
- Issue refund as wallet credit instead of cash
- View refund history

### Wallet
- View user wallet balance per currency
- Credit wallet (admin grant)
- Debit wallet (admin adjustment)
- View wallet ledger

### Pricing & Discounts
- Manage promo codes (create, edit, expire)
- Manage family discount rules
- Set late-fee policy per org

### Payment Methods
- List user payment methods (tokenized only)
- Remove payment method

### Payouts
- List payouts to orgs
- View payout detail
- Trigger manual payout

### AR Dashboard
- Outstanding balances by org / league / team / family
- Aging buckets (current / 30 / 60 / 90+)

### Bulk Operations
- Bulk issue invoices
- Bulk send reminders

### Audit
- View ledger entries per account
- View invoice change history

---

## 9. Communications — MVP Features

### Templates
- List notification templates
- Create / edit template (per channel: email / sms / push / in-app)
- Set template locale
- Publish template version

### Announcements
- List announcements
- Create announcement (scope: org / league / division / team)
- Set audience filter (role / age / division)
- Schedule announcement (send-now or scheduled)
- Cancel scheduled announcement
- View delivery status

### Direct Notifications
- Send notification to user(s)
- Pick channel (email / sms / push / in-app)

### Team Chat
- View team chat threads
- View messages in thread
- Moderate message (hide / remove)
- View moderation flags

### User Preferences
- View user notification preferences
- Reset preferences (admin)

### Delivery Logs
- List sent notifications (filter by user, channel, status)
- View delivery detail (sent / delivered / bounced / opened)
- Resend failed notification

### Opt-out
- View opt-out log per user
- Manage suppression list

### Audit
- View announcement publish history

---

## 10. Audit & Compliance — MVP Features

### Audit Log
- List audit events (filter by org, actor, resource, action, date)
- View audit event detail (before / after)
- Export audit log (CSV)

### Data Subject Requests
- List DSRs (access / erasure / portability)
- Create DSR on behalf of user
- View DSR status
- Generate user data export (ZIP)
- Process erasure (pseudonymize PII)
- Mark DSR complete

### Legal Holds
- List legal holds
- Open legal hold (scope, reason)
- Release legal hold

### Document Versions
- View versioned waiver / consent / policy documents
- View signature audit per document version

### Compliance Dashboard
- View pending DSRs
- View overdue DSRs (statutory deadlines)
- View active legal holds

---

## 11. Reporting & Analytics — MVP Features

### Built-in Reports
- Registration funnel report
- Financial AR report
- Payout report
- Roster compliance report
- Schedule utilization report
- Stats leaderboard report
- User activity report

### Report Definitions
- List saved reports
- Create / edit report (filters, group-by, metrics)
- Run report on demand
- Schedule report (RRULE)
- Delete report

### Report Runs
- List report runs
- View run status / output
- Download report output (CSV / PDF)

### Raw Exports
- Export any list view to CSV
- Track export jobs (queued / completed / failed)

### Dashboards
- KPI cards (orgs, leagues, users, registrations, AR, GMV)

---

## 12. Admin Console — MVP Features

### Platform Dashboard
- KPI cards (orgs, users, leagues, games, registrations, payments)
- Active sessions count
- System status indicators

### Tenant Provisioning
- New-org bootstrap wizard (org → admin user → default rule-sets → reference data)

### Feature Flags
- List feature flags (platform + per-org)
- Toggle flag (platform-wide)
- Override flag per org

### Plan & Tenant Config
- Set org plan / tier
- Configure per-org limits (max users, leagues, storage)

### Pending Queues
- Pending roster approvals
- Pending compliance documents
- Pending registration approvals
- Pending refund approvals

### Support Tools
- Search across all entities (users, orgs, leagues, games)
- Open user from any reference
- Impersonation entry point

### System Health
- Background job queue depth
- Error rate (basic)
- Recent system events

---

## 13. Data Migration & Onboarding — MVP Features

### Import Jobs
- List import jobs (filter by org, source, subject, status)
- View import job detail
- Cancel running job
- Retry failed job

### CSV Imports
- Upload CSV file
- Pick subject (rosters / schedules / results / players / invoices)
- Column-mapper UI (map CSV columns → entity fields)
- Dry-run validation (preview errors)
- Commit import

### Source Presets
- SportsEngine preset
- Crossbar preset
- LeagueLobster preset
- Diamond Scheduler preset
- Generic CSV (custom mapping)

### Import Results
- View row-level results (applied / errored / skipped)
- View error report
- Download error CSV
- Re-import errored rows

### Idempotency
- View `(import_source, external_id)` mapping per entity
- Detect duplicate imports

### Audit
- View import history per org
