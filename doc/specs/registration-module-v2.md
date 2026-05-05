# SportsPulse — Registration Module

**Version 2.0 — Enhanced Edition · Developer Implementation Specification**
**Power Play Hockey League (PPHL) · May 2026**

> **Note:** the source document was truncated mid-section §3.2. This file
> captures every section the team supplied. Anything that was cut off is
> explicitly marked **TBD — awaiting full text** at the bottom so we know
> what's still needed before implementation locks.

| What is new in v2 | Status |
|---|---|
| Tabbed sidebar navigation — non-linear, all sections always accessible | Replaces linear wizard |
| Visual payment timeline — exact dates and amounts instead of raw fields | New component |
| Form preview — admin sees the player form before publishing | New feature |
| Conditional question logic — show questions only when specific answers match | New engine |
| Bulk submission actions — approve/reject/email multiple submissions at once | New admin tool |
| Multi-template email system — different emails per event type | Replaces single template |
| Adaptive player form — step count driven by configuration, not hardcoded | Architecture change |

---

## 1. Overview & Architecture Changes

This document supersedes the v1 Registration Module specification. Every section has been updated to reflect the six UX and architectural improvements identified in the design review. **Read in full before implementing.**

### 1.1 Navigation model change — tabbed sidebar

> **NEW — Non-linear navigation**
>
> The v1 five-step sequential wizard is replaced by a **tabbed sidebar**. All six sections (Season Setup, Pricing, Divisions, Form Builder, Email Templates, Review & Publish) are always visible and accessible in the left rail. Sections show a completion indicator (green checkmark, amber warning, idle). Admin can jump between any section. Sequential order enforced **only at publish time** — system validates all sections before going live.

**Sidebar nav item states:**

- **Done** (green checkmark) — all required fields valid.
- **Warning** (amber exclamation) — section visited but has issues (e.g. division with no pricing tier).
- **Idle** (numbered) — not touched yet.
- **Active** (blue left border) — currently selected.

### 1.2 Adaptive player form

> **NEW — Dynamic step count**
>
> The v1 player form had a hardcoded 6-step flow. In v2, step count is determined at runtime by admin configuration. If no custom questions, Questions step is skipped. If free registration is disabled, Payment is skipped. Form engine computes ordered list of active steps on page load and renders only those.

| Player form step | Shown when | Hidden when |
|---|---|---|
| Registration type | `season.registration_type = 'both'` | Any other value — skip to Account |
| Account | Always | Never |
| Team / Player details | Always | Never |
| Custom questions | season has `form_questions` with `is_active = true` | No active questions |
| Waivers | Any waiver toggle enabled | All toggles off |
| Payment | `pricing_tier.is_free = false` | Tier free — skip to Confirmation |
| Confirmation | Always | Never |

---

## 2. Data Model — New & Updated Tables

Additions to the v1 schema required for v2 features.

### 2.1 Updated: `registration_seasons` (additive columns)

```
nav_completion   JSONB                 -- per-section completion {season:true, pricing:true, ...}
preview_token    VARCHAR(64)           -- random token for ?preview=true URL access pre-publish
```

### 2.2 New: `email_templates`

One season has many templates, one per trigger event.

```
id                            UUID PK
season_id                     UUID FK
event_type                    ENUM('on_payment','on_approved','on_rejected',
                                   'installment_reminder','season_closing','custom')
registration_type_filter      ENUM('all','team','individual') DEFAULT 'all'
subject                       VARCHAR(255)
body_html                     TEXT
attachment_path               VARCHAR(500) NULL    -- PDF in media storage
is_active                     BOOLEAN DEFAULT true
created_at                    TIMESTAMP
```

### 2.3 Updated: `form_questions` — conditional logic

```
conditional_logic_enabled         BOOLEAN DEFAULT false
condition_source_question_id      UUID FK NULL    -- the question whose answer triggers visibility
condition_operator                ENUM('equals','not_equals','contains','is_any_of') NULL
condition_value                   JSONB NULL      -- the value(s) that must match
```

### 2.4 New: `submission_bulk_actions` (audit)

```
id                   UUID PK
admin_user_id        UUID FK
action_type          ENUM('approve','reject','email')
submission_ids       UUID[]              -- affected submissions
email_template_id    UUID FK NULL        -- when action_type = email
performed_at         TIMESTAMP
notes                TEXT NULL
```

> **Implementation note:** since the platform already has a global
> `audit_events` table populated by the API's `AuditInterceptor`, we may
> consolidate `submission_bulk_actions` rows into `audit_events` with
> `action='submissions.bulk_*'` and `before/after` JSONB carrying the
> `submission_ids` and `email_template_id`. This keeps a single audit
> ledger. Decision pending team review.

---

## 3. Admin Interface — Tabbed Sidebar

Single-page admin app, persistent left sidebar, main content area. URL updates on tab switch (`/admin/registrations/{season_id}/pricing` etc). All sections **auto-save on field blur**.

### Step 1 — Season Setup

Season details, registration window, rollover from previous season.

#### 3.1.1 Rollover panel

Top of Season Setup. System queries previous seasons for this org and renders each as a clickable card showing: name, signup count, division count, status badge.

- Clicking **Rollover** on a card calls `POST /api/v1/admin/registration-seasons/{id}/rollover` with the source season ID. API copies all pricing tiers, division assignments, active form questions, conditional logic rules, waiver settings, roster rules, and email templates into the new draft season.
- **Dates, season name, and slug are never copied** — must be set fresh.
- After rollover, sidebar shows green checkmarks on sections that had valid data in source. Admin can still edit anything.

#### 3.1.2 Season details fields

| Field | Type | Rules |
|---|---|---|
| Season name | Text — required | Max 120. Auto-generates slug on blur (kebab-case, unique per org). |
| Registration type | Dropdown — required | Team / Individual / Both. Determines paths shown. |
| Season start / end | Date pair — required | End after start. Server-side validated. |
| Registration opens / closes | Datetime pair — required | Opens controls when public link becomes active. Closes triggers 'Registration closed' page. |
| Description | Textarea — optional | Shown on public landing page. Plain text only. |

#### Endpoints

```
POST  /api/v1/admin/registration-seasons                                Create new draft season
POST  /api/v1/admin/registration-seasons/{id}/rollover                  Copy source config
PATCH /api/v1/admin/registration-seasons/{id}                           Auto-save on blur (partial)
```

### Step 2 — Pricing

Standard tiers, payment timeline builder, custom pricing, usage limits.

#### 3.2.1 Tier list

Shows all tiers as cards. Each has active/inactive toggle and edit/delete actions. Standard and custom tiers visually separated.

#### 3.2.2 Pricing tier form

> **TBD — awaiting full text.** The source document supplied to the team was truncated at this point. The v2 spec continues with:
>
> - Pricing tier form fields (name, base price, payment plan toggle, plan timeline builder, usage limit, division assignments, custom-tier flag, returning-team URL slug, …)
> - Step 3 — Divisions (assignment matrix, age range, level constraints)
> - Step 4 — Form Builder (custom question types, conditional logic UI, waiver enabling)
> - Step 5 — Email Templates (per event_type, per registration_type_filter, body editor, preview)
> - Step 6 — Review & Publish (validation summary, preview token URL, publish action that writes `status=live`)
> - §4 Submissions Dashboard (bulk actions, filters, side-panel review)
> - §5 Public Player Form (adaptive step engine)
> - §6 State Machine (already mirrored in Workflow 1 v2 §10)
> - §7 Calculations (full-price, deposit, installment formulas, late-fee math)
> - §3.5 Email Template System (variables, render context, send-via-Resend)
>
> When the team sends the rest of the document, append it here.

---

## Cross-references

- **Workflow 1 v2.0** → see [`workflow-1-player-signup-v2.md`](./workflow-1-player-signup-v2.md)
- **Live data model** → see [`../data-model.md`](../data-model.md)

---

**End of Registration Module v2 (partial) · SportsPulse · Confidential**
