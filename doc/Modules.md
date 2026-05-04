# SportsPulse — Module Catalog

Comprehensive list of every module the platform could ship, grouped by domain. Each top-level module is a candidate **bounded context** (starts as a NestJS module inside `api-core`, extractable to a service later, per [Architecture.md](Architecture.md) §2). Sub-modules are the discrete capabilities that live inside it.

Legend: **[MVP]** = Phase 1 (months 1–6) · **[P2]** = Phase 2 (post-PMF) · **[P3]** = Phase 3 (scale) · **[XCut]** = cross-cutting / platform

---

## 1. Identity & Access (IAM)

- **Authentication** [MVP]
  - Email/password + magic link
  - OAuth/OIDC social login (Google, Apple)
  - Phone/SMS verification
  - Passkey / WebAuthn
  - TOTP MFA
  - Biometric unlock (mobile)
  - Refresh-token rotation
- **Account Management** [MVP]
  - Sign-up / onboarding wizard
  - Profile edit (name, photo, contact, prefs)
  - Email/phone change with re-verification
  - Account deletion (GDPR/CCPA right-to-erasure)
  - Duplicate-account detection & merge
- **Organizations & Tenancy** [MVP]
  - Org creation + branding
  - Parent-org / governing-body hierarchy (recursive `parent_org_id`)
  - Org switching for multi-org users
  - Cross-org grants (`CrossOrgGrant` rows, not RLS exceptions)
  - Org-level feature flag overrides
- **Roles & Permissions** [MVP]
  - System roles (super-admin, org-admin, league-admin, captain, ref, scorekeeper, player, parent, sponsor)
  - Custom per-org roles
  - RBAC + ABAC ("captain of *this* team in *this* season")
  - Versioned permission tokens (don't break tokens in the wild)
  - Cerbos / OpenFGA policy engine [P2]
- **Family Linking** [MVP]
  - Parent ↔ minor child relationships
  - Multi-child dashboards
  - Delegated actions (parent registers/pays for child)
- **Session & Device Management**
  - Active session list
  - Remote sign-out
  - Trusted-device fingerprinting
- **Enterprise SSO** [P2]
  - SAML / Azure AD B2C / Okta for governing bodies

## 2. League Management

- **Org & Brand** [MVP]
  - Org profile, logo, colors, custom domain
  - Public league site (Next.js page)
  - White-label theming
- **Seasons** [MVP]
  - Create/clone season (carry rosters, config)
  - Registration window (open/close dates)
  - Season status lifecycle (draft → open → in-progress → playoffs → archived)
- **Leagues & Sub-leagues** [MVP]
  - League under season
  - Multi-sport tagging (hockey day 1; expandable)
- **Divisions & Tiers** [MVP]
  - Age-group rules (`birth_year_min/max`, governing body, play-up policy)
  - Skill tiers (A/B/C/D)
  - Division-specific rule-sets (period length, OT format, points-per-win)
- **Teams** [MVP]
  - Team CRUD, colors, logo, home rink
  - Captain & coaching staff assignment
  - Team-store auto-provisioning hook
- **Rule-set Engine** [MVP]
  - Configurable game rules per division
  - Tiebreaker definitions
  - Playoff-eligibility minimums (e.g. ≥3 GP)
  - Suspension thresholds (e.g. 3 misconducts → 1-game suspension)
- **Bulk Setup Tools** [MVP]
  - Season cloner
  - Division template library
  - CSV/Excel import (idempotent on `import_source` + `external_id`)

## 3. Registration & Compliance

- **Form Builder** [MVP]
  - Drag-drop self-serve builder (counters SE's #1 complaint)
  - Conditional logic (show field if…)
  - Field types (text, select, file, signature, date, address)
  - Form versioning + audit
  - Form templates library
- **Player Registration** [MVP]
  - Direct sign-up flow
  - Parent-assisted minor registration
  - Free-agent pool registration
  - Captain team-invite flow with past-roster recall
  - Mid-season / partial-season registration (`effective_from/to`)
- **Eligibility Engine** [MVP]
  - Rule evaluation as a pure function over `EligibilityRecord` rows
  - Age/division fit validation
  - Play-up policy enforcement
  - Residency rules (if configured)
  - Auto-flag for admin review when ambiguous
- **Waivers & Consents** [MVP]
  - Liability waiver (versioned)
  - Code of conduct
  - Photo/media release
  - Concussion / injury policy ack
  - Parental consent (minors, COPPA)
  - Digital signature capture (timestamp, IP, device — immutable log)
- **Background Checks** [MVP — youth gating]
  - Sterling / Checkr API integration
  - Status webhooks
  - Expiration tracking + renewal reminders
  - Per-org policy config (who needs one)
- **Identity Verification** [MVP]
  - USA Hockey ID lookup + expiry tracking
  - SafeSport certification status
  - Government-ID upload (optional)
  - Residency proof upload
  - Document version control
- **Compliance Monitoring** [MVP]
  - Per-(player, season, governing-body) `EligibilityRecord`
  - Expiry alert dashboard
  - Auto-flag ineligible players in roster lock
  - Immutable audit log

## 4. Roster & Membership

- **Team Memberships** [MVP]
  - `TeamMembership` with `membership_type` enum (primary, play-up, affiliate, call-up)
  - `effective_from / effective_to` per membership
  - Multi-team player support with conflict detection
- **Roster Operations** [MVP]
  - Add / drop / trade / call-up
  - Append-only `RosterMove` event log (replayable)
  - Roster lock with date enforcement
  - Max-roster-size + sub-roster limits
  - Jersey number assignment (uniqueness within team)
  - Captain dashboard (add/drop/edit pre-lock)
- **Roster Snapshots & Projections**
  - Current roster = projection of `RosterMove`s
  - Historical roster query at any timestamp
- **Bulk Import / Export** [MVP]
  - CSV/Excel import (rosters)
  - Export for printing / handoff
- **Playoff Roster Rules** [MVP]
  - Min-GP enforcement (e.g. 3+ games for sub eligibility)
  - Lock at playoff cut-off date
  - Captain attestation flow

## 5. Scheduling & Allocation

- **Auto-Schedule Generator** [MVP]
  - Python + OR-Tools CP-SAT
  - 200+ games in ≤60s target
  - Home/away balance, max games/week, rest days
  - Player-level constraints for play-up players
- **Constraint Modeling** [MVP]
  - Hard: no team plays itself, no surface-time clash
  - Soft (assumption literals): blackouts, preferred slots, ref availability
- **Infeasibility UX** [MVP]
  - `SolveWithAssumptions` → minimal infeasible subset
  - Ranked actionable suggestions ("remove this blackout *or* add this slot *or* extend season")
  - One-click apply + re-solve
  - MIS cache per run (Architecture.md §5b)
- **Simulated-Annealing Fallback** [MVP]
  - Best-effort schedule when CP-SAT can't satisfy
- **Ice & Resource Allocation** [MVP]
  - `GameSlot` atomic unit (venue, surface, start, duration)
  - Blackouts and holds
  - Utilization reporting
- **Manual Override** [MVP]
  - Drag-drop schedule editor
  - Conflict warnings (don't block, just warn)
  - Audit trail per move
- **Publish Flow** [MVP]
  - Draft → preview → publish
  - Auto-notify affected teams/refs/players
  - Calendar sync (Google, iCal, Outlook)
- **Imports** [MVP]
  - Diamond Scheduler CSV
  - LeagueLobster CSV
  - Generic CSV + column mapping wizard
- **Playoff Bracket Generator** [MVP]
  - Single-elim, double-elim, round-robin, group-stage
  - Auto-seed from standings + tiebreakers
  - Re-seed on upset (configurable)
- **Tournaments** [P2]
  - Tournament landing page
  - External-team registration
  - Pool play → bracket
- **Pickup Games** [P2]
  - Drop-in session creation
  - Per-session registration + waitlist
  - Skill-based auto-balancing
  - Per-session payment
- **Practice Scheduling** [P2]
  - Practice slot allocation distinct from games
  - Coach-managed sign-ups

## 6. Game Operations

- **Scorekeeper App** [MVP]
  - Expo tablet build (offline-first)
  - Expo SQLite + append-only event queue
  - Auto-flush on reconnect
  - Idempotency keys on every write
- **Live Event Capture** [MVP]
  - Goals, assists, penalties, saves, shots
  - Goalie changes, line changes
  - Period transitions, timeouts
  - Sub-roster + position swaps mid-game
- **Attendance** [MVP]
  - Pre-game check-in (present/absent/sub)
  - Late arrivals
- **Ref Finalization** [MVP]
  - Ref reviews + signs scoresheet
  - Lock & immutability post-sign
  - Correction flow = new event, never overwrite
- **Discipline Engine** [MVP]
  - Auto-suspension calc (configurable thresholds)
  - Suspension queue + admin override
  - Auto-expire after N games served
- **Game Sheet Output** [MVP]
  - Printable PDF
  - Public game page
- **Replay / Correction** [P2]
  - Admin-initiated event-log edit (still immutable, just appends correction)
  - Audit trail of corrections

## 7. Stats Engine

- **Event Ingestion** [MVP]
  - Subscribe to game-event stream
  - TimescaleDB hypertable writes
- **Player Stats** [MVP]
  - GP, G, A, P, PIM, +/-, GWG, FO%, BLK
  - Goalie: MIN, SV, SF, GA, SV%, GAA
  - Per-season + per-playoff splits
- **Team Stats** [MVP]
  - Win/loss/tie/OT
  - Goals for/against, PP%, PK%
- **Standings** [MVP]
  - Points calculation (configurable PPW)
  - Tiebreakers per rule-set
  - Playoff seeding
  - ≤5s update latency target
- **Leaderboards** [MVP]
  - Team / division / league-wide
  - Filterable (date range, division, position)
- **Advanced Stats** [P2]
  - xG, Corsi/Fenwick, zone starts (opt-in)
- **Materialized Views & Cache** [MVP]
  - Redis projections for hot reads
  - Explicit cache-invalidation events
- **Historical Replay** [P2]
  - Re-derive standings from raw events for any date

## 8. Finance & Wallet

- **Invoicing** [MVP]
  - Auto-generate from registration
  - Status: pending / paid / overdue / partial / canceled
  - Email/SMS notifications
  - PDF rendering + history export
- **Payment Processing** [MVP]
  - Stripe Connect (Standard or Express per league)
  - Card, ACH, Apple/Google Pay
  - PCI DSS v4.0 compliance
  - Idempotent retries
- **Payment Plans & Installments** [MVP]
  - Configurable schedules
  - Auto-charge on due date
  - Failed-payment retry ladder
- **Discounts & Codes** [MVP]
  - Promo codes
  - Family caps (e.g. 3rd child 50% off)
  - Early-bird / late-fee curves
- **Captain Dues Splitting** [MVP]
  - Even-split or per-player overrides
  - Captain pays, then collects (or direct-collect)
- **Refunds & Credits** [MVP]
  - Full / partial refund to original method
  - Issue platform credit instead of cash
  - Customer-support refund authority
- **Wallet & Credits** [MVP]
  - Per-user balance
  - Credit transfer between users (e.g. parent → child)
  - Gift cards [P2]
  - ≤2s confirmation target
- **Late Fees & Reminders** [MVP]
  - Auto-apply schedule
  - Reminder cadence config
- **Offline Payments** [MVP]
  - Admin logs cash/check, marks invoice paid
- **AR Dashboard** [MVP]
  - Outstanding balances by org/league/team/family
  - Aging buckets
  - Collector worklist
- **Payouts** [MVP]
  - Stripe Connect → league bank account
  - Payout schedule + history
  - **No held funds** (counters SE's BBB-complaint weakness)
- **Reporting & Reconciliation** [MVP]
  - 10k+ records in ≤5s
  - ±0.1% accuracy
  - CSV/PDF export
- **QuickBooks Sync** [P2]
  - QBO API
  - Customer / invoice / payment mapping
- **Sponsorship Billing** [P2]
  - Sponsor invoicing distinct from registration
- **Multi-currency** [P3]

## 9. Communications

- **Channel Fan-out** [MVP]
  - Email (SendGrid primary, Postmark failover)
  - SMS (Twilio primary, MessageBird failover)
  - Push (Expo Push → APNs/FCM)
  - In-app inbox
- **Templates & Branding** [MVP]
  - White-label templates (no SE-style ad-laden emails)
  - Variables, conditionals
  - Per-org branding
- **Announcements** [MVP]
  - League-wide
  - Division / team / role-targeted
  - Scheduled send
- **Team Chat** [MVP]
  - Per-team threads
  - Captain announcements
  - Read receipts
  - Moderation tools
- **Direct Messages** [P2]
  - User-to-user (with role guardrails for youth)
- **Automated Triggers** [MVP]
  - Game change alerts
  - Payment reminders
  - Roster lock approaching
  - Eligibility expiring
- **Preferences & Opt-out** [MVP]
  - Per-channel toggles
  - Per-category toggles
  - Compliance with CAN-SPAM / TCPA
- **Delivery Analytics** [MVP]
  - ≥98% delivery success target
  - Bounces, opens, clicks
- **Marketing Email** [P2]
  - Resend or Customer.io
  - Campaign builder, audiences
- **Goalie911 / Sub Finder** [P2]
  - Last-minute sub broadcast to opt-in goalies/players
  - Auto-fill workflow

## 10. Media & Video

- **Live Streaming** [MVP]
  - Mux ingest (RTSP/RTMP)
  - 720p min, ≤3s glass-to-glass target
  - Stream health monitor + fallback
- **Pay-per-View / Subscriptions** [P2]
  - Per-game purchase
  - Season pass
- **VOD & Archive** [MVP]
  - Full-game recording
  - Search-indexed metadata
  - Access controls (public / team / subscriber)
- **Auto-Highlight Generation** [P2]
  - Phase A: event-timestamp clipping (10s pre / 15s post goal)
  - Phase B: AI (YOLOv8 + audio cue) on Azure ML
  - Pixellot SDK for hardware-paired rinks
  - Clip available ≤2–3 min after event
- **Manual Clipping** [MVP]
  - In-player clip creation
  - Share by player / team / game
- **Upload Pipeline** [MVP]
  - User-uploaded MP4
  - Transcode to web formats
  - Thumbnails
  - Size limits (≤50 MB practice; higher for games)
- **Moderation** [MVP]
  - Flag/review queue
  - Admin takedown
- **Commentary / Audio** [P2]
  - Announcer feed mux

## 11. Merchandise

- **Team Stores** [P2]
  - Auto-provision per team
  - Per-team branding
  - Shopify Storefront/Admin API
- **Product Catalog** [P2]
  - Templates (jerseys, hoodies, caps)
  - Personalization (name + number)
- **Order Lifecycle** [P2]
  - Seasonal windows
  - Bulk aggregation for group discounts
  - Backorder / pre-order
- **Fulfillment Tracking** [P2]
  - Shopify webhook ingest
  - Customer notifications
- **Inventory Notifications** [P2]
  - Restock alerts

## 12. Notifications (Cross-cutting)

- Single fan-out service consuming events from all modules
- Routing rules (event type → channel + audience)
- Quiet hours, rate limiting per user
- Delivery log + retry
- Dead-letter queue for unrecoverable

## 13. Audit & Compliance (Cross-cutting)

- **Immutable Audit Log** [MVP]
  - Append-only, partitioned by month
  - Archive to Blob after retention window
  - Covers: registrations, roster moves, financial overrides, game corrections, admin actions
- **GDPR / CCPA Workflows** [MVP]
  - Subject access request export
  - Right-to-erasure (with legal-hold awareness)
- **COPPA Workflows** [MVP — youth gating]
  - Parental consent capture
  - Minor-data minimization
- **PCI DSS v4.0 Posture** [MVP]
  - No card data on our servers (Stripe tokens only)
- **SOC 2 Track** [P2]
  - Control mapping, evidence collection
- **Document Version Control** [MVP]
  - Waiver / form / policy versions
  - Re-sign campaigns when versions bump
- **Data Retention Policy** [MVP]
  - Per-table retention rules
  - Auto-purge job

## 14. Reporting & Analytics

- **Built-in Reports** [MVP]
  - Registration funnel
  - Financial AR / payouts
  - Roster compliance
  - Schedule utilization
  - Stats leaderboards
- **Report Builder** [MVP]
  - Self-serve filter + group-by
  - Save & share
  - Scheduled delivery (email PDF/CSV)
- **Raw CSV Export** [MVP]
  - Every list view exports raw (avoids SE "custom report dead-end" complaint)
- **Embedded Dashboards** [P2]
  - Per-league analytics page
- **Warehouse Pipeline** [P2]
  - dbt → Databricks
  - Self-serve BI

## 15. Search

- **Global Search** [MVP]
  - Players, teams, games, schedules, video metadata
  - Azure AI Search backend
- **Scoped Search**
  - Within team / division / season
- **Saved Searches & Alerts** [P2]

## 16. Admin Console

- **Operational Dashboards** [MVP]
  - KPI cards (registrations, AR, schedule progress, ref coverage)
  - Pending review queues (rosters, compliance docs)
- **Org / League / Division / Team CRUD** [MVP]
- **User & Role Management** [MVP]
- **Feature Flags & Plan Config** [MVP]
  - LaunchDarkly / Azure App Config integration
  - Per-tenant feature gating
- **Bulk Operations** [MVP]
  - Mass invoice / refund
  - Bulk roster import
- **Impersonation / Support Mode** [MVP]
  - Admin views as user (audited)
- **Tenant Provisioning** [MVP]
  - New-org bootstrap wizard
- **Health & Status Page** [P2]

## 17. Public-Facing Sites

- **League Website** [MVP]
  - Schedule, standings, news
  - Custom domain + branding
  - SEO-friendly (Next.js SSR)
- **Team Pages** [MVP]
  - Roster, schedule, stats, photos
- **Player Profiles** [MVP]
  - Stats, history, photo
  - Privacy controls
- **Public Game Pages** [MVP]
  - Live scoreboard
  - Box score post-game
- **Tournament Landing Pages** [P2]

## 18. Mobile Apps

- **Player / Parent App** [MVP — Expo]
  - Schedule, scores, stats, chat, payments
  - Push notifications
  - Family multi-child view
- **Captain Dashboard** [MVP]
  - Roster, dues split, announcements
- **Ref App** [MVP]
  - Assignments, accept/decline, payroll history
- **Scorekeeper Tablet App** [MVP — separate Expo build]
  - Offline-first, append-only event log
  - Native scorekeeping module (Swift/Kotlin) for the one screen that needs perf
- **OTA Updates** [MVP]
  - EAS Update

## 19. Coaches & Practice Tools [P2]

- Practice plan upload (PDF, video)
- Practice jersey assignment
- HUDL-style video breakdown integration
- Coach file repository
- Drill library

## 20. Sponsorship & Ads [P2]

- Sponsor onboarding
- Ad placements (own inventory only — never 3rd-party ad networks)
- Sponsor reporting dashboards
- Sponsor invoicing (ties to Finance §8)

## 21. AI Copilots [P2 / P3]

- **Registrar Copilot** [P2]
  - Natural-language admin commands ("move the U14 Tier 1 final to Sat 7pm if Arena B is free")
  - Eligibility-question answering
- **Schedule Assistant** [P2]
  - Plain-English constraint input ("no Sunday games before 10am")
  - Translates to OR-Tools assumptions
- **Highlights Curator** [P2]
  - Ranks auto-generated clips
  - Per-player highlight reels
- **Stats Insight Bot** [P3]
  - "Why is Team X's PK% dropping?"

## 22. Integrations Hub

- **Outbound Webhooks** [MVP]
  - Per-org webhook config (event → URL)
  - Signed payloads, retry, DLQ
- **Inbound Webhooks** [MVP]
  - Stripe, Twilio, Shopify, Sterling, Mux callbacks
- **B2B Public API** [P2]
  - REST + OpenAPI 3.1
  - Postman collections
  - Rate limiting + API keys
- **Calendar Sync** [MVP]
  - Google Calendar, iCal, Outlook
- **Governing-Body APIs** [P2]
  - USA Hockey, AAU eligibility lookup

## 23. Platform / Infra (XCut)

- **Multi-tenancy** — Postgres RLS with recursive org-tree policies
- **Outbox Publisher** — relays events to Service Bus in-tx-safe
- **Saga Coordinator** — multi-step workflows (registration → payment → roster assign)
- **Idempotency Keys Service** — request-key dedupe across all writes
- **Feature Flags** — OpenFeature + Azure App Config
- **Real-time Transport** — Azure SignalR + Apollo subscriptions adapter (or fallback per Decision #8)
- **Background Jobs** — BullMQ on Redis + ACA Jobs for batch
- **Caching Layer** — Redis projections + explicit invalidation events
- **File Storage** — Azure Blob + Front Door CDN
- **Observability** — OpenTelemetry → Azure Monitor + App Insights + Grafana
- **Error Tracking** — Sentry (FE + RN + BE)
- **Synthetic Monitoring** — Front Door probes + Checkly journeys
- **Secrets** — Azure Key Vault + Workload Identity
- **IaC** — Bicep (Azure) + narrow-scope Terraform (Cloudflare, GitHub, Stripe, Sentry, LaunchDarkly, Mux)
- **GitOps** — GitHub Actions → ACR → Argo CD on AKS
- **Disaster Recovery** — Postgres PITR (35d), geo-redundant Blob, quarterly drills, RTO ≤4h / RPO ≤15m

## 24. Data Migration & Onboarding

- **CSV / Excel Importers** [MVP]
  - Rosters
  - Game results / historical stats
  - Schedules (Diamond, LeagueLobster)
  - Generic with column-mapping wizard
- **SE / Crossbar Migration Toolkit** [P2]
  - Direct API import where possible
  - Mapping presets
- **Idempotent Imports** [MVP]
  - `(import_source, external_id)` uniqueness on every entity
- **Validation & Dry-run** [MVP]
  - Preview before commit
  - Error report w/ row-level pinpointing

---

## Module → Service Extraction Plan (recap of Architecture.md §2)

| Phase | Deployables |
|---|---|
| **Phase 1 (MVP)** | `api-core` (modules 1–12 as NestJS modules) · `realtime-svc` · `media-svc` · `scheduler-svc` · `webhooks-svc` |
| **Phase 2 (post-PMF)** | Extract `stats-engine` (Go), `comms-svc`, `payments-svc` |
| **Phase 3 (scale)** | Each high-traffic module → its own service as load + team size demand |

Module boundaries here **are** the future service boundaries. Keep them clean from day 1 — no cross-module DB reads, no cross-module imports of internal types, communicate via domain events on the outbox.
