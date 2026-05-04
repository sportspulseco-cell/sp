# SportsPulse — Architecture & Tech Stack Blueprint

## 0. Strategic frame (read this first)

Three opinions that should shape every other decision:

1. **Don't start with 30 microservices.** That kills startups. Start with a **modular monolith** organized around the 10 service boundaries you've already identified, then **strangle** into microservices when load and team size justify it. You'll keep all the modularity benefits (clean module boundaries, independent schemas, future-extractable) without paying the day-1 distributed-systems tax (network calls, distributed tx, observability sprawl, deploy complexity for 5 engineers).
2. **The moat is mobile-first scorekeeping + real-time + AI highlights**, not features SportsEngine already has. Research shows SportsEngine's scoring is desktop-only and their mobile app crashes 10x/day. Win there.
3. **Multi-tenant from the very first commit.** Every row gets a `tenant_id` (org/league). Use **Postgres Row-Level Security** for hard isolation. Retrofitting this later is brutal.

---

## 1. Recommended tech stack

### Frontend layer (separate apps, shared design system)

| Concern | Recommendation | Why |
|---|---|---|
| Web app (public + admin) | **Next.js 15** (React 19, App Router, RSC) + **TypeScript strict** | Server Components reduce hydration; Vercel/Azure-friendly; huge talent pool |
| Styling / UI kit | **Tailwind CSS + shadcn/ui + Radix** | Own your components; no vendor lock-in; ships fast |
| GraphQL client | **Apollo Client** + **GraphQL Codegen** | Type-safe queries end-to-end; cache normalization for live stats |
| State (non-server) | **Zustand** (light) + URL state | Avoid Redux unless you need it |
| Mobile apps | **Expo (React Native 0.76+)** with **native scorekeeping module** in Swift/Kotlin | One codebase, native perf for the one screen that needs it (offline scoring); OTA updates via EAS Update |
| Tablet scorekeeper | Separate Expo build, offline-first with **Expo SQLite + append-only event log + retry queue** | iPads at the rink lose connectivity — offline is non-negotiable. Scorekeeping is append-only (goals, penalties, saves, period transitions); no bidirectional CRDT sync needed. WatermelonDB is over-engineered for this write pattern — revisit only if real-time collaborative scorekeeping (multiple refs scoring simultaneously) becomes a requirement. |
| Real-time UI | GraphQL subscriptions over WebSocket → **Apollo Client subscriptions** with **Azure SignalR** as transport | SE doesn't have real-time scoreboards; you will. **Risk:** Apollo Client expects native WebSocket/SSE; routing through SignalR needs a custom transport adapter. Spike in week 1 (see §8). Fallback: SignalR's own client SDK for realtime, GraphQL for request/response only. |
| Design system | Shared `packages/ui` consumed by web + mobile (via React Native Web / Tamagui) | One brand, one source of truth |

### Backend / API layer

| Concern | Recommendation | Why |
|---|---|---|
| Primary language | **TypeScript** (NestJS framework) | Same language as frontend; massive ecosystem; great Prisma + GraphQL fit |
| Performance hotspot service | **Go** for the **stats engine**; **Python + Google OR-Tools (CP-SAT)** for the **scheduler/optimizer** | Stats roll-ups benefit from Go concurrency; the scheduler is bound by the CP solver itself, and Python OR-Tools bindings are the most mature |
| Client API style | **GraphQL** (single schema served by NestJS) for the web + mobile + scorekeeper apps | One round-trip for nested data (dashboards, scoreboards); type-safe codegen for FE/mobile; subscriptions for live scores |
| Federation | **Defer to Phase 2.** MVP runs a **single GraphQL schema** in `api-core` — no Apollo Router yet | Federation is overkill while you have one backend service; introduce it when you extract the 2nd/3rd subgraph |
| Webhooks / 3rd-party callbacks | **REST** (`POST /webhooks/stripe`, `/webhooks/twilio`, `/webhooks/shopify`) | Vendors send REST — non-negotiable |
| 3rd-party integrator API | **REST + OpenAPI 3.1** | B2B integrators (QuickBooks sync partners, future ones) expect REST + Postman collections |
| Internal service-to-service | **gRPC** (api-core ↔ scheduler-svc ↔ media-svc) | Both sides are yours, schemas are tight, GraphQL adds no value internally |
| Async messaging | **Azure Service Bus** (commands) + **Azure Event Grid** (events) | First-party, scales to 100k+ msg/sec |
| Background jobs | **BullMQ** on Redis (TS services) + **Azure Container Apps Jobs** for batch | Cron, retries, dead-letter handling |
| Real-time transport | **Azure SignalR Service** for fan-in/fan-out at scale | Better than rolling your own WebSocket fleet |
| Search | **Azure AI Search** | Players, teams, schedules, video metadata |
| File/video storage | **Azure Blob Storage** + **Azure CDN / Front Door** | Cheap, durable, geo-replicated |

### Data access layer (DAL)

| Concern | Recommendation | Why |
|---|---|---|
| ORM (TS services) | **Drizzle ORM** | Native Postgres RLS support (raw connection access for `SET LOCAL app.tenant_id`); zero runtime overhead (no engine binary); first-class window functions / CTEs / TimescaleDB extensions; plays nicely with PgBouncer transaction mode. Prisma fights you on all of these. |
| ORM (Go service — stats) | **sqlc** + pgx | Generates type-safe Go from SQL — no runtime ORM overhead |
| DB access (Python service — scheduler) | **SQLAlchemy 2.0 (Core)** + asyncpg | Read-heavy from a replica; SQLAlchemy Core gives raw SQL with typing |
| Schema management | **drizzle-kit** migrations in CI; one shared `packages/db` with the canonical Drizzle schema | Single source of truth across all TS services |
| Multi-tenant isolation | **Postgres RLS policies** on every tenant-scoped table; tenant context injected via `SET LOCAL app.tenant_id` at the start of each transaction | Defense in depth — even a bug can't leak across orgs. Drizzle's raw connection access makes this trivial. |
| Connection pooling | **PgBouncer** in transaction mode (Azure offers managed) | Standard production pattern; Drizzle is compatible (Prisma is not, without workarounds) |
| Repository pattern | Thin repositories per aggregate — don't over-abstract Drizzle | Keep it boring |

### Database layer

| Workload | Storage | Why |
|---|---|---|
| Core OLTP (orgs, leagues, players, rosters, payments, schedules) | **Azure Database for PostgreSQL Flexible Server** (HA-enabled, zone-redundant) | Mature, ACID, JSONB for flexible attributes |
| Live game events / time-series stats (every goal, penalty, save, shot) | **TimescaleDB extension** on the same Postgres cluster (hypertables, 10x compression) → migrate to **ClickHouse** if you cross ~50M events/day | Same DB cluster, zero new infra. Drizzle gives raw SQL access for hypertable creation and time-bucketed queries. |
| Read models / cache (rosters, standings, leaderboards) | **Azure Cache for Redis** (Premium, with cluster mode) | Sub-ms reads for hot paths |
| Audit logs / immutable events | **Postgres** with append-only tables + partition by month → archive to Blob | Compliance + cheap long-term storage |
| Analytics / reporting | **Azure Synapse** or **dbt → Databricks** later | Don't build until product is stable |
| Document/unstructured | Postgres JSONB columns where possible; **Azure Cosmos DB** only if you have a real document use case | Avoid premature polyglot persistence |

**On your "Postgres + GraphQL" instinct** — yes, but be precise: Postgres is the **persistence**, GraphQL is the **API contract** for clients (web/mobile). They don't replace each other. REST stays for webhooks and B2B integrators. gRPC for internal service calls. The combination you want is:

```
Web/Mobile/Tablet  ──GraphQL──▶  NestJS api-core  ──Drizzle──▶  Postgres (RLS)
                                       │                   ↘  Redis (cache)
                                       │                   ↘  TimescaleDB ext (game events)
3rd-party (Stripe, Twilio, Shopify) ──REST webhooks──▶ webhooks-svc
B2B integrators ──REST + OpenAPI──▶ api-core
api-core ──gRPC──▶ scheduler-svc / media-svc / stats-engine
Live subscriptions ──WebSocket via Azure SignalR──▶ realtime-svc
```

### Infrastructure & DevOps

| Concern | Recommendation | Why |
|---|---|---|
| Compute | **Azure Container Apps** at MVP → **AKS** (Azure Kubernetes Service) at scale | ACA is "Kubernetes without the Kubernetes" — perfect for 0→10k users; AKS when you need fine control |
| Autoscaling | **KEDA** on AKS (event-driven) + HPA on CPU/memory | Scale by queue depth, not just CPU |
| Ingress / WAF / CDN | **Azure Front Door Premium** (global LB + WAF + CDN in one) | One layer, one bill |
| Service mesh | **None at MVP** → Linkerd if needed at scale | Don't add complexity you don't need |
| Container registry | **Azure Container Registry (ACR)** | First-party, geo-replicated |
| Secrets | **Azure Key Vault** + Workload Identity | No secrets in env vars |
| IaC — Azure resources | **Bicep** (week 1, non-negotiable) — all Azure: AKS/ACA, Postgres Flex, Redis, Blob, Key Vault, Front Door, Service Bus, SignalR, AI Search, ACR, App Insights, networking | Day-one Azure resource parity (Microsoft owns it); stateless (Azure is the source of truth, no state file to manage); cleaner syntax than HCL; native `az deployment what-if` previews |
| IaC — non-Azure SaaS | **Terraform** (narrow scope) — only for: **Cloudflare** (DNS, Stream if used), **GitHub** (repos, branch protection, secrets, Argo CD apps), **Stripe** (webhook endpoints, products), **Sentry / LaunchDarkly / Mux** (projects, environments, alert rules) | Bicep can't reach these; Terraform has mature providers for all of them; keep the scope narrow so you don't run two IaC systems for the same resources |
| IaC stance | **Both from day 1.** Bicep skeleton in week 1 (~300 lines covers MVP). Terraform added when the first non-Azure SaaS is wired in (probably week 2–3 with Stripe + GitHub). Deployed via GitHub Actions on PR merge with `what-if` / `plan` posted to the PR. | Cost of IaC now: ~5 engineer-days. Cost of retrofitting after 6 months of Portal clicks: ~2 weeks plus drift bugs. Asymmetric bet — non-negotiable for a product handling payments + minor data + multi-tenant blast radius. |
| GitOps | **GitHub Actions** → ACR → **Argo CD** on AKS | Declarative, auditable deploys |
| Feature flags | **OpenFeature** + **Azure App Configuration** | Ship dark, ramp gradually |
| Observability | **OpenTelemetry → Azure Monitor + Application Insights**; Grafana on top | Single OTEL standard, vendor flexibility |
| Error tracking | **Sentry** | Better DX than App Insights for FE/RN errors |
| Synthetic monitoring | **Azure Front Door** health probes + **Checkly** for critical user journeys | Catch broken signup flows before users do |

### Identity & access

| Concern | Recommendation | Why |
|---|---|---|
| Auth provider | **Clerk** (fastest to ship, great org/multi-tenant primitives, native B2B) — *or* **Azure AD B2C** if enterprise SSO matters more than DX | Don't build auth from scratch |
| Authorization | **RBAC + ABAC** stored in your own permissions table; **Cerbos** or **OpenFGA** as the policy engine if you need granular | RBAC alone won't model "captain of *this* team in *this* season" |
| Mobile auth | OIDC + biometric unlock, refresh-token rotation | |
| MFA | TOTP + WebAuthn (passkeys) | |

### 3rd-party integrations (fixed choices)

| Integration | Provider | Why this one |
|---|---|---|
| Payments | **Stripe Connect** (Standard or Express accounts per league) | Instant payouts → directly counters SportsEngine's BBB-complaint weakness of frozen funds |
| SMS | **Twilio** with **MessageBird** as failover | |
| Email transactional | **SendGrid** + **Postmark** as failover | Postmark for high-deliverability transactional |
| Email marketing | **Resend** or **Customer.io** | Don't bolt onto transactional |
| Push | Native APNs / FCM via Expo Push | |
| Video live + VOD | **Mux** (best DX) — *or* **Cloudflare Stream** for cost | Azure Media Services is being retired Sept 2025 — do NOT pick it |
| Auto-highlights (AI) | **Pixellot SDK** for hardware-paired rinks; for DIY → fine-tune **YOLOv8** + audio cue detection on Azure ML | TeamSnap+XbotGo just shipped this Nov 2025 — close the gap quickly |
| Accounting | **QuickBooks Online API** | Required for AR sync |
| Merchandise | **Shopify Storefront/Admin API** | Per-team stores via app-installed Shopify orgs |
| Background checks (when youth) | **Sterling** or **Checkr** | |

---

## 2. Service decomposition (start as modules, extract later)

```
┌─────────────────────────────────────────────────────────────┐
│   apps/web (Next.js)    apps/mobile (Expo)   apps/score (Expo) │
└──────────────────────────────┬──────────────────────────────┘
                               │
                  ┌────────────▼────────────┐
                  │  api-core (NestJS)      │  ← single GraphQL schema (clients)
                  │   + REST routes         │  ← webhooks, B2B integrators
                  └────────────┬────────────┘
                  (Apollo Router + Federation deferred to Phase 2)
                               │
   ┌──────────┬──────────┬─────┼─────┬──────────┬──────────┐
   ▼          ▼          ▼     ▼     ▼          ▼          ▼
┌─────┐  ┌────────┐  ┌───────┐ ┌──┐ ┌──────┐ ┌──────┐  ┌──────┐
│ IAM │  │ League │  │ Reg & │ │..│ │Sched │ │Game  │  │Stats │ ...
│     │  │  Mgmt  │  │ Compl │ │  │ │uler  │ │Ops   │  │Engine│
└──┬──┘  └────┬───┘  └───┬───┘ └─┬┘ └──┬───┘ └──┬───┘  └──┬───┘
   │          │          │       │     │        │          │
   └────┬─────┴──────────┴───────┴─────┴────────┴──────────┘
        │
   ┌────▼──────────────────────────────────────────┐
   │  Postgres (RLS) + Redis + Blob + Search       │
   └───────────────────────────────────────────────┘
        │
   ┌────▼──────────────────────────────────────────┐
   │  Azure Service Bus (commands) + Event Grid    │
   │  (events) — outbox pattern from each service  │
   └───────────────────────────────────────────────┘
```

**Phase 1 (MVP, months 1–6):** Four deployables — `api-core` (modular monolith with all domains as modules), `realtime-svc` (SignalR + subscriptions), `media-svc` (video pipeline), and `scheduler-svc` (Python + OR-Tools CP-SAT). Scheduler is promoted to Phase 1 because it's the strongest competitive wedge against SportsEngine and Crossbar (see [Scheduler-Research.md](Scheduler-Research.md)).

**Phase 2 (post-PMF):** Extract `stats-engine` (Go), `comms-svc`, `payments-svc`.

**Phase 3 (scale):** Each module → its own service as load and team size demand.

### Domain modules (your service boundaries — start as modules, end as services)

1. **Identity & Access** — users, orgs, roles, permissions, RBAC + ABAC
2. **League Management** — orgs, seasons, leagues, sub-leagues, divisions, teams, rule-sets
3. **Registration & Compliance** — players, waivers, consents, eligibility, USA Hockey ID, SafeSport
4. **Scheduling & Allocation** — auto-schedule, ice allocation, blackouts, playoff brackets, pickup
5. **Game Operations** — scoresheets, events, ref finalization, suspensions
6. **Stats Engine** — projections, standings, leaderboards, goalie stats
7. **Finance & Wallet** — invoices, payments, refunds, credits, Stripe Connect, QuickBooks sync
8. **Communications** — email/SMS/push/in-app chat, announcements, templates
9. **Media & Video** — streams, highlights, uploads, moderation
10. **Merchandise** — Shopify orchestration, team stores
11. **Notifications** — cross-cutting fan-out (consumes events from all)
12. **Audit & Compliance** — immutable logs, exports, GDPR/CCPA workflows

---

## 3. Repository layout (Turborepo monorepo)

```
sportspulse/
├── apps/
│   ├── web/                      # Next.js 15 — public + admin + league sites
│   ├── mobile/                   # Expo — players, parents, captains, refs
│   └── scorekeeper/              # Expo (tablet-optimized, offline-first)
├── services/
│   ├── api-core/                 # NestJS modular monolith (Phase 1)
│   ├── realtime/                 # SignalR + GraphQL subscriptions
│   ├── media/                    # Video pipeline + highlights
│   ├── scheduler/                # Python + FastAPI + OR-Tools CP-SAT solver
│   └── webhooks/                 # Stripe, Twilio, Shopify callbacks
├── packages/
│   ├── db/                       # Drizzle schema + migrations + repository helpers (the DAL)
│   ├── graphql/                  # GraphQL SDL + codegen output (federation deferred)
│   ├── ui/                       # Shared design system (web + RN via Tamagui)
│   ├── auth/                     # Clerk wrappers + permission helpers
│   ├── domain/                   # Pure TS domain types shared FE↔BE
│   └── config/                   # Shared eslint/tsconfig/prettier
├── infra/
│   ├── bicep/                    # All Azure resources (AKS/ACA, Postgres, Redis, Blob, Key Vault, Front Door, Service Bus, SignalR, AI Search, ACR, App Insights, networking)
│   ├── terraform/                # Non-Azure SaaS only — Cloudflare, GitHub, Stripe, Sentry, LaunchDarkly, Mux
│   ├── helm/                     # AKS charts (Phase 2+)
│   └── argocd/                   # GitOps manifests
└── .github/workflows/            # CI/CD
```

---

## 4. Scaling story (100 → 100,000+ users)

| Tier | Users | Architecture |
|---|---|---|
| **Pilot (PPHL)** | 100–2k | Single AKS/ACA region (East US), Postgres Flex (single zone), Redis Standard, 2× api-core replicas |
| **Multi-league** | 2k–20k | Add Postgres read replica, Redis cluster mode, scale api-core to 6–10 replicas, enable Front Door multi-region read |
| **Regional scale** | 20k–100k | Extract stats + scheduler services, add CDN aggressively, Postgres → Citus or partition by tenant, separate WebSocket tier |
| **National scale** | 100k+ | Active-active multi-region (East US + Central US), per-tenant sharding, ClickHouse for analytics, dedicated AKS node pools per workload (CPU/GPU/memory-optimized) |

**Horizontal scaling primitives baked in from day 1:**
- All services **stateless** (sessions in Redis/Clerk)
- All long work **async** via Service Bus → workers scale on queue depth (KEDA)
- All hot reads **cached** in Redis with explicit invalidation events
- All writes **idempotent** (request keys) so retries are safe
- All services behind **Azure Front Door** with health probes + automatic failover
- **Database** scales vertically first (cheap, simple) → read replicas → Citus

---

## 5. Non-negotiable architectural patterns

1. **Outbox pattern** for events — write event to Postgres in same tx as state change, then a publisher relays to Service Bus. No lost events.
2. **Event sourcing for game events** — every goal/penalty is an immutable event; the "scoresheet" is a projection. Lets you replay corrections cleanly.
3. **CQRS-lite** for stats — write to Postgres, project to Redis materialized views, read from Redis.
4. **Idempotency keys** on all write APIs — mobile clients on flaky rink wifi will retry.
5. **Schema-first GraphQL** (client API) + **OpenAPI 3.1** (REST webhooks & B2B) + **Protobuf** (internal gRPC) — contracts before code.
6. **Versioned RBAC** — when you change permissions, you don't break tokens in the wild.
7. **Postgres RLS** — defense-in-depth tenant isolation.
8. **Feature flags everywhere** — ship dark, ramp by tenant.
9. **Saga pattern** for multi-service workflows (registration → payment → roster assign).
10. **Backups + DR** — point-in-time restore on Postgres (35 days), geo-redundant Blob, quarterly DR drills.

---

## 5a. Domain data model (must be locked before any Drizzle code)

The biggest schema risk in this product is **not** infrastructure — it's the domain model. Sports platforms die on edge cases like "player X is rostered on Team A in U14 Tier 1 of Spring 2027 PPHL, but also plays up on a U16 team for select games." If the schema is wrong, RLS policies are wrong, queries are wrong, and the scheduler's constraint model is wrong. **Lock the ER diagram in week 2 before writing migrations.**

### Core entities and relationships

```
Org (tenant)
 └─ Season (start, end, status, registration window)
     └─ League (e.g. "PPHL Spring 2027 Hockey")
         └─ Division (age group + tier, e.g. "U14 Tier 1")
             └─ Team
                 └─ TeamMembership (player ↔ team in a specific season)

Player
 ├─ Person (name, DOB, contact, USA Hockey ID, SafeSport status)
 ├─ EligibilityRecord (waivers, consents, background-check status, per-season)
 └─ TeamMembership[] (many — current + historical, including play-up flags)

AgeGroup (rule-driven, not a string)
 ├─ birth_year_min / birth_year_max
 ├─ governing_body (USA Hockey, AAU, etc.)
 └─ play_up_policy (allowed? requires waiver? max divisions up?)

Roster (a snapshot, not a relation)
 ├─ team_id, season_id, effective_from, effective_to
 └─ RosterMove[] (add, drop, trade, call-up — immutable event log)

GameSlot (the scheduler's atomic unit)
 ├─ venue_id, surface_id, start_ts, duration
 ├─ assigned_game_id (nullable — slot may be unassigned)
 └─ blackouts[], holds[]
```

### The hard cases the schema must handle on day 1

| Case | Modeling approach |
|---|---|
| **Multi-team players (play-up)** | `TeamMembership` is many-to-many with a `membership_type` enum (`primary`, `play_up`, `affiliate`, `call_up`). Eligibility validation runs per-membership, not per-player. |
| **Partial-season registrations** | `TeamMembership.effective_from` / `effective_to` — never assume full-season. Stats and standings filter by date range, not just season_id. |
| **Roster moves mid-season** | Append-only `RosterMove` event log; current roster is a projection. Lets you replay corrections (a common ref/admin workflow) without destroying history. |
| **Eligibility rules** | `EligibilityRecord` is per (player, season, governing_body) — a player can be USA Hockey eligible but SafeSport expired. Rule evaluation is a pure function over these records, not booleans on Player. |
| **Schedule conflicts (player on two teams playing at the same time)** | Scheduler treats `Player` (not `Team`) as the constraint subject for play-up players. Requires reverse-lookup index on `TeamMembership` filtered by `effective_from/to`. |
| **Division reorganization mid-season** | `Team.division_id` is immutable per season; division changes spawn a new TeamMembership row. Standings queries window by `(division_id, date_range)`. |
| **Org/league hierarchy** | `parent_org_id` self-reference on `Org` — a league can be a child of a regional governing body. RLS policies must walk the parent chain. |
| **Historical data import** | Every entity has an `import_source` and `external_id` (SE/Crossbar/CSV). Import is idempotent on `(import_source, external_id)`. |

### RLS implications

- Tenant scoping via `org_id` is **not enough** — an Org can have child Orgs (governing body → member league). RLS policies must use a recursive CTE on the org tree.
- Cross-org reads are required for: a player viewing their own record across leagues they play in, a referee assigned across two associations. Model these as explicit `CrossOrgGrant` rows, not as RLS exceptions.
- The `SET LOCAL app.tenant_id` pattern needs to accept a **set** of org IDs, not one — wrap as `SET LOCAL app.org_ids = '{1,2,3}'` and use `org_id = ANY(...)` in policies.

### Deliverable for week 2

A reviewed ER diagram + Drizzle schema for: `Org`, `Season`, `League`, `Division`, `Team`, `Person`, `Player`, `TeamMembership`, `RosterMove`, `EligibilityRecord`, `AgeGroup`, `GameSlot`, `Game`, `CrossOrgGrant`. **No migrations land in main until this is signed off.**

---

## 5b. Scheduler infeasibility UX (constraint relaxation)

CP-SAT returns INFEASIBLE without explanation. "Your constraints have no solution" is unusable for a league admin. The scheduler must answer: *which specific constraint should I relax, and what does that buy me?*

### Approach

1. **Encode every soft constraint as an OR-Tools assumption literal.** Hard constraints (no team plays itself, no two games on the same surface at the same time) stay as direct constraints. Soft constraints (Team A's blackout on Jan 15, Arena B's preferred slot, ref availability) are gated by boolean assumption literals.
2. **On INFEASIBLE, run `SolveWithAssumptions` to extract the minimal infeasible subset (MIS).** OR-Tools surfaces which assumption literals form the conflict — i.e. which user-supplied constraints are mutually inconsistent.
3. **Rank suggestions by user-friendliness.** Removing a single team's blackout > removing an arena's blackout > expanding a season window > adding a new ice slot. Ranking is heuristic but stable.
4. **Render as actionable diff.** "Team A's blackout on Jan 15 conflicts with Arena B's only available slot that week. Options: (a) remove Team A's blackout, (b) add an Arena C slot on Jan 14–16, (c) extend the season by one week." Each option is a one-click apply that re-runs the solver.
5. **Cache the MIS** per scheduler run so the admin can iterate without re-solving the full problem.

### Budget

**2–3 weeks of dedicated work.** This is a feature, not a polish pass. Allocate it explicitly in the week 11–14 scheduler block. The simulated-annealing fallback (already in §6) handles the case where the user wants a "best-effort" schedule despite infeasibility — it does **not** replace the constraint-relaxation explanation.

---

## 6. Decisions needed (with recommendation)

| # | Decision | Recommendation | Why |
|---|---|---|---|
| 1 | Modular monolith first vs. microservices day 1 | **Modular monolith** | Avoids 6 months of distributed-systems plumbing before you ship |
| 2 | Mobile: native vs RN | **Expo + native scorekeeping module** | Best of both; one codebase, native perf where it matters |
| 3 | API style: GraphQL vs REST vs tRPC | **GraphQL for client API (single schema, no federation at MVP)** + **REST for webhooks & B2B integrators** + **gRPC for internal service calls** | Single round-trip for nested dashboard data; subscriptions for live scores; federation deferred until you have ≥2 backend services to compose |
| 4 | Auth: Clerk vs Azure AD B2C vs Auth0 | **Clerk** for speed; **Azure AD B2C** if enterprise SSO is critical | Clerk's org primitives match your tenant model perfectly |
| 5 | Compute: ACA vs AKS at MVP | **ACA at MVP**, AKS at Phase 2 | Less ops overhead while team is small |
| 6 | Video: Mux vs Cloudflare Stream vs LiveKit | **Mux** | Best DX; Azure Media Services is EOL — do not use |
| 7 | Scheduler implementation | **Python + Google OR-Tools (CP-SAT)** as a separate service from day 1, with simulated-annealing fallback for infeasibility | Promoted to Phase 1 — competitive wedge; CP-SAT is the academic + production standard, Python bindings are most mature, perf is bound by the solver not the language. See [Scheduler-Research.md](Scheduler-Research.md) |
| 8 | Real-time transport for GraphQL subscriptions | **Validate Apollo-over-SignalR in week 1**; if the custom transport adapter is fragile, fall back to **SignalR SDK for realtime + GraphQL for req/resp only** | Apollo Client subscriptions expect native WebSocket/SSE. Discovering this incompatibility in week 15 (live scoreboard build) is catastrophic. One-day spike de-risks 6 months of downstream work. |
| 9 | Scorekeeper offline storage | **Expo SQLite + append-only event queue** (not WatermelonDB) | Scorekeeping is append-only events (goals, penalties, period transitions) flushed when connectivity returns. WatermelonDB's CRDT/sync engine targets collaborative editing — wrong problem shape, extra complexity, more edge cases. |
| 10 | Migration data import | **CSV/Excel bulk import for rosters + game results in MVP** (in addition to Diamond Scheduler / LeagueLobster import for the scheduler) | Leagues won't switch from SportsEngine/Crossbar if they lose 3 years of player stats and game history. Adoption blocker, not a Phase 2 nice-to-have. |
| 11 | Youth compliance | **In MVP timeline, not Phase 2** — Sterling/Checkr background checks, SafeSport verification, USA Hockey ID integration, COPPA consent | If PPHL pilot includes youth leagues, compliance is launch-blocking. Background-check integration alone (Sterling API + status webhooks + expiration tracking + per-org policy config) is 2–3 weeks. |

---

## 7. Anti-patterns to avoid (lessons from SportsEngine's pain)

Pulled directly from competitor research — these are the traps that have made SportsEngine beatable:

- ❌ **Monolithic Rails-style coupling** of registration, payments, websites — they can't independently iterate. Modular boundaries from day 1.
- ❌ **Forms built by engineers** — you need a self-serve form builder (drag-drop + conditional logic) on day 1 — biggest customer complaint about SE.
- ❌ **Desktop-only scoring** — SE's #2 complaint. Native mobile scorekeeping is a wedge feature.
- ❌ **Holding payouts** — Stripe Connect with Standard/Express accounts gives leagues their own balance. No frozen funds.
- ❌ **Ad-laden emails** — never. White-label everything.
- ❌ **Quote-only pricing** — publish flat per-org tiers + per-player overage. Trust signal.
- ❌ **Custom report dead-ends** — ship a report builder + raw CSV export from day 1.

---

## 8. Where to start tomorrow

1. **Week 1:** Lock decisions in §6. Spin up Azure subscription, **Bicep skeleton (~300 lines: RG, vnet, Key Vault, ACR, Postgres Flex, Redis, Blob, Service Bus, ACA env)**, monorepo, Clerk org, Stripe Connect sandbox. CI runs `az deployment what-if` on every PR. **One-day spike: Apollo Client subscriptions through Azure SignalR — confirm round-trip works or trigger fallback (Decision #8).**
2. **Week 2–3:** **Domain ER diagram + Drizzle schema sign-off (§5a) — gating; no migrations land before this.** Identity + multi-tenant primitives + RLS (with recursive org-tree policies) proven end-to-end. CI/CD green to ACA. **Add Terraform for GitHub (repo settings, branch protection, secrets) + Stripe (webhook endpoints) — first non-Azure resources.**
3. **Week 4–6:** League management module (orgs → seasons → divisions → teams) including play-up memberships, partial-season registrations, and roster-move event log. Admin web shell. **CSV/Excel bulk import for rosters (idempotent on `import_source` + `external_id`) — Decision #10.**
4. **Week 7–10:** Registration + waivers + Stripe Connect payments. Mobile app shell with player onboarding. **Youth compliance track in parallel (Decision #11): Sterling/Checkr background-check integration (API + status webhooks + expiration tracking + per-org policy config), SafeSport verification, USA Hockey ID, COPPA consent flows.** Budget 2–3 weeks for background checks alone.
5. **Week 11–14:** Scheduling engine (Python + OR-Tools CP-SAT, FastAPI behind Service Bus queue) + first-class ice-block model + ref availability constraints + Diamond Scheduler / LeagueLobster CSV import + publish flow. **Constraint-relaxation infeasibility UX (§5b) is a 2–3 week sub-track inside this block — assumption literals + MIS extraction + ranked actionable suggestions, not a polish pass.**
6. **Week 15–20:** Scorekeeper tablet app (Expo SQLite + append-only event queue, Decision #9) + game events + stats engine + standings. **CSV/Excel import for historical game results + standings (Decision #10).**
7. **Week 21–24:** Comms (announcements, SMS/email/push, team chat) + Goalie911.
8. **Week 25–28:** Video integration (Mux) + auto-highlights v1 (event-timestamp clipping, no AI yet) + PPHL pilot launch.
9. **Phase 2:** Tournaments, brackets, merch, AI auto-highlights, AI registrar copilot.
