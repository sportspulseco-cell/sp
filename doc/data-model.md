# SportsPulse — Data Model

Live snapshot of the production Supabase schema. Pulled from
`information_schema` on 2026-05-04. Update this file whenever schema
changes ship.

- **Tables:** 53 in `public`
- **Foreign keys:** 95 cross-table relationships
- **Drizzle schema source:** [`packages/db/src/schema/`](../packages/db/src/schema)

---

## ⚠️ Security advisory — Row Level Security

**All 53 tables in `public` have RLS disabled.** The Supabase advisor flags
this as critical because the **anon key is shipped in the web app
bundles** — anyone with the anon key could call `supabase.from('any_table').select('*')`
and read or modify every row.

**Why we're not being attacked today:**
- All real data access flows through the NestJS API (`sp-api-one.vercel.app/api`).
- The API uses the **service role key** server-side (which bypasses RLS anyway) and gates every request through `JwtAuthGuard + AuthorizedAccessGuard + UserScope projection`.
- The web apps only use the anon key for **auth operations** (`signUp`, `signInWithPassword`, `getUser`) and one direct query: `profiles` lookup in `(admin)/layout.tsx` for the topbar.

**Why this still needs fixing before public registration ships (Workflow 1 v2):**
- Public registration uses anonymous endpoints. We must guarantee the public attack surface goes through the API, not through `supabase-js` direct queries.
- Any future SDK that re-uses the anon key directly (player dashboard, mobile app, etc.) must be RLS-policied.

**Plan:**
1. Add RLS policies to `profiles` (`auth.uid() = id` for SELECT) so the layout's direct query keeps working.
2. Enable RLS on every other table with **no policies attached** — this default-denies all anon/authenticated access. Service role still passes through, so the API keeps working.
3. Audit every direct `supabase.from(...)` in web app code; route through the API or add explicit policies.

The remediation SQL is at the bottom of this file but **must not be run blindly** — step 1 above must precede the rest.

---

## Module map

The 53 tables group into 9 modules that mirror the API's bounded contexts:

| Module | Tables |
|---|---|
| **iam** | `profiles`, `persons`, `roles`, `user_role_assignments`, `family_links`, `identity_verifications`, `background_checks` |
| **org-management** | `orgs`, `org_relations`, `cross_org_grants`, `governing_bodies` |
| **league-management** | `seasons`, `leagues`, `divisions`, `age_groups`, `teams`, `division_team_entries`, `rule_sets` |
| **registration-compliance** | `registrations`, `registration_items`, `registration_forms`, `registration_form_versions`, `eligibility_records`, `documents`, `document_versions`, `consent_signatures` |
| **roster-membership** | `team_memberships`, `roster_moves` |
| **game-operations** | `games`, `game_events`, `game_attendance`, `game_officials`, `scoresheet_signatures`, `suspensions` |
| **stats** | `stat_lines`, `standings`, `leaderboards` |
| **finance** | `invoices`, `invoice_items`, `payments`, `fee_schedules` |
| **communications** | `notifications`, `notification_templates`, `notification_delivery_logs` |
| **platform** | `audit_events`, `system_settings`, `feature_flags`, `import_jobs`, `import_job_rows`, `countries`, `currencies`, `locales`, `sports` |

---

## ER diagram (Mermaid · renders inline on GitHub)

```mermaid
erDiagram
    %% ========= REFERENCE / PLATFORM =========
    countries ||--o{ orgs : country
    currencies ||--o{ orgs : currency
    locales ||--o{ orgs : locale
    countries ||--o{ profiles : country
    locales ||--o{ profiles : locale
    countries ||--o{ persons : country
    countries ||--o{ governing_bodies : country
    sports ||--o{ governing_bodies : sport
    sports ||--o{ leagues : sport
    sports ||--o{ teams : sport
    sports ||--o{ seasons : sport
    sports ||--o{ rule_sets : sport
    sports ||--o{ games : sport
    sports ||--o{ game_events : sport
    sports ||--o{ stat_lines : sport
    sports ||--o{ leaderboards : sport
    currencies ||--o{ countries : default

    %% ========= ORG / GOVERNANCE =========
    orgs ||--o{ org_relations : "parent / child"
    orgs ||--o{ cross_org_grants : from
    orgs ||--o{ cross_org_grants : to
    orgs ||--o{ seasons : owns
    orgs ||--o{ teams : owns
    orgs ||--o{ roles : "custom roles"
    orgs ||--o{ documents : owns
    orgs ||--o{ registration_forms : owns
    orgs ||--o{ rule_sets : owns
    orgs ||--o{ fee_schedules : owns
    orgs ||--o{ invoices : owns
    orgs ||--o{ payments : owns
    orgs ||--o{ notifications : owns
    orgs ||--o{ notification_templates : owns
    orgs ||--o{ audit_events : "scope"
    orgs ||--o{ import_jobs : owns
    governing_bodies ||--o{ leagues : "associated with"
    governing_bodies ||--o{ rule_sets : "publishes"
    governing_bodies ||--o{ age_groups : defines
    governing_bodies ||--o{ eligibility_records : evaluates
    governing_bodies ||--o{ identity_verifications : verifies

    %% ========= LEAGUE STRUCTURE =========
    seasons ||--o{ leagues : contains
    seasons ||--o{ eligibility_records : "for season"
    seasons ||--o{ team_memberships : "for season"
    seasons ||--o{ roster_moves : "for season"
    seasons ||--o{ stat_lines : "for season"
    seasons ||--o{ fee_schedules : "season pricing"
    leagues ||--o{ divisions : has
    leagues ||--o{ standings : "ranked under"
    leagues ||--o{ stat_lines : "league stats"
    leagues ||--o{ games : "league games"
    leagues ||--o{ registrations : "league reg"
    leagues ||--o{ fee_schedules : "league pricing"
    rule_sets ||--o{ leagues : governs
    age_groups ||--o{ divisions : "age band"
    divisions ||--o{ division_team_entries : registers
    divisions ||--o{ standings : "ranked under"
    divisions ||--o{ stat_lines : "division stats"
    divisions ||--o{ games : "scheduled in"
    divisions ||--o{ registrations : "for division"
    divisions ||--o{ fee_schedules : "division pricing"
    teams ||--o{ division_team_entries : entries
    teams ||--o{ team_memberships : roster
    teams ||--o{ roster_moves : moves
    teams ||--o{ games : home
    teams ||--o{ games : away
    teams ||--o{ game_events : "team event"
    teams ||--o{ game_attendance : attendance
    teams ||--o{ stat_lines : "team stats"
    teams ||--o{ standings : "ranked"
    teams ||--o{ registrations : "team reg"

    %% ========= IDENTITY =========
    profiles ||--o{ user_role_assignments : "(authenticated user)"
    persons ||--o{ team_memberships : "rostered"
    persons ||--o{ roster_moves : moves
    persons ||--o{ family_links : "minor"
    persons ||--o{ background_checks : "checked"
    persons ||--o{ consent_signatures : signed
    persons ||--o{ eligibility_records : evaluated
    persons ||--o{ identity_verifications : verifies
    persons ||--o{ game_attendance : attended
    persons ||--o{ game_events : "primary actor"
    persons ||--o{ game_officials : officiates
    persons ||--o{ stat_lines : "stats per player"
    persons ||--o{ registrations : "subject"
    persons ||--o{ invoices : recipient
    persons ||--o{ notifications : recipient
    persons ||--o{ suspensions : suspended
    roles ||--o{ user_role_assignments : "role definition"

    %% ========= REGISTRATION =========
    registration_forms ||--o{ registration_form_versions : versions
    registration_form_versions ||--o{ registrations : "version used"
    registrations ||--o{ registration_items : items
    registrations ||--o{ invoices : "billed via"
    documents ||--o{ document_versions : versions
    document_versions ||--o{ consent_signatures : "version signed"

    %% ========= GAME OPERATIONS =========
    games ||--o{ game_events : timeline
    games ||--o{ game_attendance : attendance
    games ||--o{ game_officials : officials
    games ||--o{ scoresheet_signatures : signed
    games ||--o{ stat_lines : projection
    game_events ||--o{ game_events : correction
    game_events ||--o{ suspensions : "discipline source"

    %% ========= ROSTER =========
    roster_moves ||--o{ team_memberships : "last move"

    %% ========= FINANCE =========
    invoices ||--o{ invoice_items : line_items
    invoices ||--o{ payments : payments
    fee_schedules ||--o{ invoice_items : "priced from"

    %% ========= COMMS =========
    notifications ||--o{ notification_delivery_logs : logs

    %% ========= IMPORT =========
    import_jobs ||--o{ import_job_rows : rows
```

---

## Tables (alphabetical)

The full list with row counts at snapshot time:

| Table | Rows | Module |
|---|---|---|
| `age_groups` | 0 | league-management |
| `audit_events` | 6 | platform |
| `background_checks` | 0 | iam |
| `consent_signatures` | 1 | registration-compliance |
| `countries` | 24 | platform/reference |
| `cross_org_grants` | 0 | org-management |
| `currencies` | 17 | platform/reference |
| `division_team_entries` | 2 | league-management |
| `divisions` | 2 | league-management |
| `document_versions` | 2 | registration-compliance |
| `documents` | 1 | registration-compliance |
| `eligibility_records` | 1 | registration-compliance |
| `family_links` | 0 | iam |
| `feature_flags` | 0 | platform |
| `fee_schedules` | 0 | finance |
| `game_attendance` | 0 | game-operations |
| `game_events` | 2 | game-operations |
| `game_officials` | 0 | game-operations |
| `games` | 2 | game-operations |
| `governing_bodies` | 0 | org-management |
| `identity_verifications` | 0 | iam |
| `import_job_rows` | 0 | platform |
| `import_jobs` | 0 | platform |
| `invoice_items` | 0 | finance |
| `invoices` | 0 | finance |
| `leaderboards` | 1 | stats |
| `leagues` | 2 | league-management |
| `locales` | 20 | platform/reference |
| `notification_delivery_logs` | 0 | communications |
| `notification_templates` | 0 | communications |
| `notifications` | 3 | communications |
| `org_relations` | 1 | org-management |
| `orgs` | 3 | org-management |
| `payments` | 0 | finance |
| `persons` | 5 | iam |
| `profiles` | 3 | iam |
| `registration_form_versions` | 1 | registration-compliance |
| `registration_forms` | 1 | registration-compliance |
| `registration_items` | 2 | registration-compliance |
| `registrations` | 2 | registration-compliance |
| `roles` | 13 | iam |
| `roster_moves` | 3 | roster-membership |
| `rule_sets` | 0 | league-management |
| `scoresheet_signatures` | 0 | game-operations |
| `seasons` | 2 | league-management |
| `sports` | 14 | platform/reference |
| `standings` | 2 | stats |
| `stat_lines` | 1 | stats |
| `suspensions` | 1 | game-operations |
| `system_settings` | 0 | platform |
| `team_memberships` | 2 | roster-membership |
| `teams` | 4 | league-management |
| `user_role_assignments` | 1 | iam |

---

## Gap analysis vs Workflow 1 v2 / Registration Module v2

The platform already has **a registration module skeleton** (`registrations`, `registration_items`, `registration_forms`, `registration_form_versions`). v2 spec needs the following **additive** schema work:

### New tables (greenfield)

| Spec table | Exists today? | Notes |
|---|---|---|
| `pricing_tiers` | ❌ | Spec §3.2.2; replaces flat `fee_schedules` for tiered/payment-plan pricing. Keep `fee_schedules` for legacy until migrated. |
| `installment_schedules` | ❌ | Spec §7.1; per-invoice plan timeline. |
| `email_templates` | ❌ | Spec §2.2; per-event-type, per-registration-type-filter. |
| `waiver_versions` | ❌ | Spec Workflow 1 §6.1; immutable text version per waiver. (Existing `document_versions` could be reused — decision pending.) |
| `waiver_signatures` | ❌ | Spec Workflow 1 §6.1; per-submission, with IP, UA, version_id. (Existing `consent_signatures` is similar — could be unified.) |
| `parent_linkages` | ➖ exists as `family_links` | Confirm shape matches spec (`parent_user_id`, `player_user_id`, `relationship`, `custody_notes`). |
| `team_invites` | ❌ | Spec §5.5; token, expires_at, status. |
| `free_agent_pool_entries` | ❌ | Spec §5.4 + §9.3; positions, availability, level_flexibility. |
| `submission_bulk_actions` | ❌ — could fold into `audit_events` | Spec §2.4; bulk approve/reject/email. |

### Column additions to existing tables

| Table | New columns | Spec ref |
|---|---|---|
| `seasons` (acting as `registration_seasons`) | `nav_completion JSONB`, `preview_token VARCHAR(64)` | Spec §2.1 |
| `registration_forms.questions` (or new `form_questions`) | `conditional_logic_enabled BOOLEAN`, `condition_source_question_id UUID FK`, `condition_operator ENUM`, `condition_value JSONB` | Spec §2.3 |
| `registrations` | `submission_type ENUM('team','individual','free_agent')`, `state ENUM(pending_verification,pending_consent,pending_payment,pending_offline,pending_review,incomplete,approved,rejected,cancelled)`, `pricing_tier_id UUID FK` | Workflow 1 v2 §10 state machine |
| `invoices` | `stripe_payment_intent_id VARCHAR(64)`, `plan_breakdown JSONB`, `status ENUM(pending,paid,pending_offline,refunded,partially_refunded)` | Spec §7 |

All purely additive — **no destructive ALTERs, no DROPs**.

---

## Remediation SQL — RLS

⚠️ **Do NOT run before adding policies.** Documented for future application.

```sql
-- Step 1 — add policies for tables the web apps query directly via anon key
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Step 2 — enable RLS without policies on every other table.
-- Service role bypasses RLS, so the NestJS API keeps full access.
-- Anon and authenticated callers via supabase-js will be denied.
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;
-- … and 49 more (full list available via Supabase Advisor)
```

The complete `ALTER TABLE` block is in the Supabase Advisor `rls_disabled` advisory — query it via `mcp__supabase__get_advisors` when the team is ready to apply.
