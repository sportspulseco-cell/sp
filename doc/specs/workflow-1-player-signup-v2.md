# SportsPulse — Workflow 1: Player Sign-Up, Registration & Approval

**Version 2.0 — Revised & Production Grade**
**Power Play Hockey League (PPHL) · May 2026**
**Aligned with Registration Module Spec v2.0**

| Covers | Use cases | Actors | Status |
|---|---|---|---|
| UC-01 through UC-05 — Workflow 1 (full) | Player reg, Parent reg, Free agent, Captain invite, Admin approval | Player, Parent, Captain, League Admin, System, Payment Gateway | Ready for development |

---

## 1. Overview & What Changed from v1

This document is the production-grade specification for **Workflow 1: Player Sign-Up, Registration & Approval**. It replaces the draft workflow in the original PPHL workflow document and is fully synchronised with the Registration Module Spec v2.0.

### 1.1 What was wrong with the original workflow

| | |
|---|---|
| **GAP** | Original workflow had Profile & Details Entry listed twice as separate steps with no distinction. Profile creation and registration path selection are different phases — separated cleanly here. |
| **GAP** | Eligibility review came BEFORE the player selects a team or division. Architecturally wrong — a player cannot be evaluated for division eligibility until the system knows which division they're registering for. Correct order: account → path → eligibility data → review. |
| **GAP** | Payment was listed twice. Payment is a financial transaction, eligibility is a compliance check. Now distinct phases. |
| **GAP** | SafeSport certification and governing body ID verification were buried inside payment with no rules. Now in a dedicated Compliance phase. |
| **GAP** | No definition of what happens when a captain has not yet created a team when a player tries to register. Team creation prerequisite is now explicit. |
| **GAP** | Free agent path was mentioned but not detailed. Two flows now defined: registers as free agent from the start, vs. fails to make a team and falls into the pool. |
| **GAP** | No session handling — browser closes mid-payment had undefined behaviour. Session persistence and resumption now specified. |
| **GAP** | Confirmation step did not distinguish team registration (captain split-pay link) vs. individual. Now fully split. |

### 1.2 How this aligns with the Registration Spec v2

Every phase in this workflow maps directly to a section in Registration Module Spec v2.0. The state machine, API endpoints, field definitions, payment formulas, and email triggers referenced here are defined in full detail in that spec.

| Workflow phase | Spec v2 section | Alignment |
|---|---|---|
| Phase 1: Account creation | §5.2 Step: Account | Full |
| Phase 2A: Team registration path | §5.2 Step: Details (team) | Full |
| Phase 2B: Individual player path | §5.2 Step: Details (player) | Full |
| Phase 2C: Free agent path | §5.2 Step: Registration type + free-agent flag | Full |
| Phase 2D: Captain invite path | §4.2 Player invite link + UC-04 | Full |
| Phase 3: Compliance & waivers | §5.2 Step: Waivers + §3.3.2 Eligibility rules | Full |
| Phase 4: Payment | §5.2 Step: Payment + §7 Calculations | Full |
| Phase 5: Admin & captain review | §4 Submissions dashboard + Bulk actions | Full |
| Phase 6: Confirmation | §5.2 Step: Confirmation + §3.5 Email templates | Full |
| State machine | §6 State machine | States identical |

---

## 2. Actors & Preconditions

### 2.1 Actors

| Actor | Role |
|---|---|
| **Player** | The person registering — adult or youth (under 18). May register themselves, be registered by a parent, or receive a captain invite. |
| **Parent / Guardian** | Registers on behalf of a minor player. Signs all waivers and consents. Pays fees. Linked to child's player profile. |
| **Team Captain** | Creates or manages a team. Invites players. Approves or rejects team join requests. Manages split-pay dues. Receives notifications on all submissions to their team. |
| **League Admin** | Final eligibility and compliance approval authority. Can approve, reject, or request resubmission. Can override any eligibility rule with an admin note logged to audit trail. |
| **System** | The SportsPulse platform. Enforces all validation rules, state transitions, notifications, payment calculations, and audit logging automatically. |
| **Payment Gateway** | Stripe. Tokenises card data, processes charges, handles refunds. SportsPulse never stores raw card data. |
| **Governing Body API** | USA Hockey API (optional). Auto-validates governing body ID and certification status. Falls back to manual admin review if API is unavailable. |

### 2.2 Preconditions

- The organisation (PPHL) exists with at least one active league.
- A League Admin has completed Season Setup (Workflow 7 / Registration Module spec). A season must exist with `status = live`, `registration_opens` in the past, `registration_closes` in the future.
- At least one pricing tier is active and assigned to at least one division.
- For team registration: at least one team must exist in the division, OR `registration_type` allows team creation at registration time.
- For captain invite flow: the captain must already have a registered account with `captain` role on the target team.

---

## 3. Registration Paths Overview

Four distinct entry paths. All converge at Phase 3.

| Path | Entry point | Who uses it | Converges at |
|---|---|---|---|
| **2A — Team reg** | Public link `/registration/{slug}` | Captain registers team and players | Phase 3 |
| **2B — Individual** | Public link `/registration/{slug}` | Single player registers themselves | Phase 3 |
| **2C — Free agent** | Public link with free-agent option | Player without a team | Phase 3 |
| **2D — Captain invite** | Personal invite link | Player responding to direct invite | Phase 3 |

---

## Phase 1 — Account Creation & Authentication

**Actors:** Player, Parent/Guardian, System

### 4.1 New user — account creation

1. Player (or parent on behalf of minor) lands on the registration page via one of the four entry paths.
2. System detects unauthenticated session. Displays two options: **Create account** / **Already have an account? Log in**.
3. Player selects **Create account**. Enters: full name, email, phone, password (min 8 chars, 1 number, 1 special), confirm password.
4. System sends email verification link (expires 24 hours). Player must verify before submission can be completed.
5. Player is shown a 'Check your email' screen. Registration session preserved in a server-side session token stored in a secure httpOnly cookie. Player can close the browser, verify email in another tab, and return without losing progress.
6. On email verification, player is redirected back to the exact step they were on.

> **NOTE** — Session tokens expire after **72 hours** of inactivity. If a session expires mid-registration, the player is shown a 'Your session has expired' message and asked to log in. Any data already entered (profile details, waiver status) is preserved on the pending submission record and reloaded on login.

### 4.2 Existing user — login

1. Player selects **Log in**. Enters email + password. System authenticates via JWT.
2. If MFA is enabled (optional for league admins, not required for players), enter OTP.
3. On successful login, system checks for any in-progress registration submissions for this season. If found, player is offered: **Resume previous registration** OR **Start fresh**.
4. If **Start fresh** is selected, the previous pending submission is voided (status = `cancelled`) and a new one begins.

### 4.3 Minor player — parent account

1. If DOB (entered in Phase 2) indicates under 18, the system flags the submission as requiring parental consent.
2. Parent must have a linked account. If not: system prompts parent email entry, sends parent account creation invite.
3. All waivers and consents in Phase 3 must be signed by the parent account.
4. Payment in Phase 4 must be made by the parent account.

> **NEW** — The system does not ask for DOB during account creation. DOB is collected in Phase 2 (Details). The minor flag is set at that point and the flow adapts retroactively — any steps already completed are reviewed against minor rules.

#### Field definitions — account creation

| Field | Required | Validation & notes |
|---|---|---|
| Full name | ✓ | Max 120 chars. Stored on user record. Pre-filled into all registration forms. |
| Email | ✓ | Unique per system. Used for login, notifications, all email templates. Verification required. |
| Phone | ✓ | E.164 format enforced. Used for SMS. Country code required. |
| Password | ✓ | Min 8 chars, 1 number, 1 special. bcrypt cost factor 12. Never stored plain. |

#### Endpoints

```
POST  /api/v1/auth/register                     Create new account → session token + verification_pending
POST  /api/v1/auth/verify-email                 Verify email via token → authenticated session
POST  /api/v1/auth/login                        Authenticate existing user → JWT + refresh token
GET   /api/v1/auth/session/registration-state   Returns in-progress submission for session
```

---

## Phase 2 — Registration Path & Details

**Actors:** Player, Parent/Guardian, Team Captain, System

### 5.1 Path selection

Shown only when `season.registration_type = 'both'`. System presents three cards:

- **Register a team** — captain registering my team for this season.
- **Register as a player** — I am registering myself individually.
- **Register as a free agent** — I want to play but do not have a team yet. *(Only if `allow_free_agent = true`)*

If `registration_type = 'team'` only, captain card is the only option (screen skipped). If `'individual'` only, player card only.

### 5.2 Path 2A — Team registration (captain)

| Field | Required | Validation |
|---|---|---|
| Team name | ✓ | Unique within selected division for season. Validated server-side on blur. Inline error on duplicate. |
| Division | ✓ | Dropdown — only divisions assigned to selected pricing tier. Pre-selected if arrived via division-specific URL. |
| Team colour (primary) | — | Hex picker. Stored on team record. Displayed on team pages and schedules. |
| Team logo | — | PNG/JPG. Max 2 MB. If none uploaded, system uses generated initials avatar. |
| Captain name | auto | Pre-filled from authenticated user. Editable. |
| Captain email | auto | Pre-filled. Editable. |
| Captain phone | ✓ | Pre-filled. E.164. SMS game-change alerts. |
| Jersey number preference | optional | Configured by admin as custom question. Only shown if active. |

> **NOTE** — Team creation here creates a draft team record with `status = pending`. Not visible on public standings or schedules until submission reaches `status = approved`.

### 5.3 Path 2B — Individual player

| Field | Required | Validation |
|---|---|---|
| Full name | auto | From authenticated account. Editable. |
| Date of birth | ✓ | Validates division age range. Triggers parental consent if < 18. Format MM/DD/YYYY. |
| Gender | ✓ | Configurable per league. |
| Email | auto | From account. Editable. |
| Phone | ✓ | E.164. |
| Photo | optional | PNG/JPG, max 2 MB. |
| Address | optional | Street, city, state, zip. Not shown publicly. |
| USA Hockey ID | conditional | Alphanumeric 6-12. Expiry must be future date. |
| Emergency contact name | conditional | Not shown publicly. |
| Emergency contact phone | conditional | E.164. |
| Position(s) | conditional | Multi-select: Forward, Defense, Goalie. Used for Goalie911 matching. |
| Shot hand | optional | Left / Right. |
| Height / Weight | optional | For equipment sizing if merchandising enabled. |
| Medical / allergy notes | optional | Free text. **Encrypted at rest.** Visible only to League Admin and Org Admin. |
| Level (A/B/C/D) | ✓ | Self-reported. Admin can override. Affects division assignment validation. |

### 5.4 Path 2C — Free agent

Same as 2B, plus:

| Field | Required | Validation |
|---|---|---|
| Preferred position ranking | ✓ | 1st / 2nd choice. Used by captains filtering pool. |
| Availability (days/times) | optional | Multi-select. Displayed on free-agent profile. |
| Willing to play at level | optional | E.g. 'Prefer B, open to C'. |

> **NEW** — Free agent profiles are visible to all captains in the same league whose division(s) match the player's level. Captains see a filterable free agent pool with position, level, availability, and no-show rate (from previous seasons if available).

### 5.5 Path 2D — Captain invite

Player arrives via personal invite link encoding `team_id` and `season_id`. Player does not select team or division — context is pre-loaded.

- Invite links generated by captain from team dashboard → Roster → Invite Player.
- Captain can: enter email/phone, select past roster members, share generic team URL.
- Generic URL does not expire until `roster_lock_date`. Personal email invites expire after 7 days but can be resent.
- On clicking link: prompt to create account or log in, then land at Details with team and division pre-filled and locked.
- If player is already registered for this season on a different team: error 'You are already registered. Contact your league admin to transfer.'

#### Endpoints

```
POST  /api/v1/public/registration/{season_slug}/submissions/start     Init submission with type+path
PATCH /api/v1/public/registration/submissions/{id}/details            Save details (partial, on blur)
GET   /api/v1/public/registration/{season_slug}/free-agent-pool       Captain-facing pool with filters
POST  /api/v1/captain/teams/{team_id}/invites                          Send invite or generate URL
GET   /api/v1/public/registration/invites/{invite_token}              Resolve invite → team+season
```

---

## Phase 3 — Compliance, Waivers & Eligibility

**Actors:** Player, Parent/Guardian, System, League Admin, Governing Body API

All four paths converge here. Fixed sequence — cannot skip ahead.

### 6.1 Step 1 — Digital waivers

System presents waivers enabled in Form Builder (Spec §3.4.2) in fixed order:

1. **Liability waiver** — full text in scrollable panel. **Sign** button only activates after scroll-to-bottom. Player types full legal name. System validates: typed name = account name (case-insensitive, trimmed). System stores: signature text, timestamp UTC, IP, user agent, `waiver_version_id` (each text change creates new version). **Records immutable.**
2. **Code of conduct** — required checkbox.
3. **Photo / media release** — optional checkbox. Player can decline. Non-blocking. Choice recorded with timestamp.

**Decision: All required waivers signed?**
- ✓ → Step 2.
- ✗ → Hard-block. 'You must sign all required documents to continue.' Specific unsigned waivers listed.

### 6.2 Step 2 — Parental consent (minors only)

Skipped if age ≥ 18.

- Parent email field appears.
- System sends consent email (72h expiry). Submission status → `pending_consent`.
- Player sees: 'We have sent a consent request to your parent/guardian.'
- Parent clicks → creates/logs into parent account → reviews participation/media/medical consents → signs digitally.
- On parent signature: status → `pending_payment`. Player notified.

**Decision: Parent consent completed?**
- ✓ → Step 3.
- ✗ → Stays `pending_consent`. Reminders at 24h and 48h. New link auto-sent on expiry.

### 6.3 Step 3 — Eligibility verification

Automated checks first. If all pass → Phase 4. If any fail → admin review triggered.

**Automated checks:**
- **Age / division fit** — DOB within division's allowed range. Mismatch → flag.
- **Duplicate account** — search same name + DOB. Match → flag (does not block).
- **USA Hockey ID format** — alphanumeric 6-12, expiry future. Expired → block.
- **Governing body API** — call USA Hockey. Invalid → flag. Unavailable → fall back to manual review (player advances).
- **Level / division match** — flag if mismatch. Does not block.
- **SafeSport** — required + missing → upload required (PDF/JPG, max 5 MB).

**Document uploads:**

| Field | Required | Validation |
|---|---|---|
| USA Hockey ID card | conditional | JPG/PNG/PDF, max 5 MB. **Encrypted in storage.** |
| Birth certificate / age proof | conditional (minors) | Same. |
| Residency proof | conditional | Same. |
| SafeSport cert | conditional | Has expiry. System flags if within 30 days. |

**Decision: All automated checks pass with no flags?**
- ✓ → Phase 4 immediately. No admin action needed.
- ✗ → Status `pending_review`. Admin notified. **Player can still proceed to payment** (admin review is async).

> **NEW** — Original workflow blocked the player until admin reviewed. This created a queue problem (60 launch-day registrations all blocked). Corrected approach: payment proceeds in parallel with async admin review. If admin rejects, full refund issued. This is industry standard (SportsEngine, Crossbar).

#### Endpoints

```
POST  /api/v1/public/registration/submissions/{id}/waivers
POST  /api/v1/public/registration/submissions/{id}/parental-consent-request
GET   /api/v1/public/registration/consent/{token}
POST  /api/v1/public/registration/consent/{token}/sign
POST  /api/v1/public/registration/submissions/{id}/eligibility-check
POST  /api/v1/public/registration/submissions/{id}/documents
```

---

## Phase 4 — Payment

**Actors:** Player, Parent/Guardian, Team Captain, System, Stripe

Invoice generated and payment collected. All four paths go through this. Calculations per Spec v2 §7.

### 7.1 Invoice generation

Pre-populated based on:
- Selected pricing tier.
- Returning vs. new (admin can configure different pricing — handled via custom pricing URLs).
- Division fees in pricing tier.
- Split pay: captain's invoice shows full team amount; individual player invoices show share.

### 7.2 Payment options

**Option A — Full payment** — single Stripe charge for full amount.

**Option B — Payment plan (if enabled)** — visual timeline (same component as admin wizard, read-only). Player sees deposit + each installment + dates. Confirms → deposit charged immediately → subsequent installments scheduled as Stripe PaymentIntents with future confirmation. Failed installment → retry after 3 days → second failure → late fee + admin/player notified + payment update link.

**Option C — Offline / manual (if enabled)** — no Stripe charge. Invoice `pending_offline`. Admin must mark paid. Player cannot reach `approved` until then.

**Decision: Payment successful (Stripe confirms)?**
- ✓ → Invoice `paid`. Submission `pending_payment` → `pending_review`. `on_payment` email sent.
- ✗ → Stripe decline shown verbatim. Invoice stays `pending_payment`. Player retries. After 3 failed attempts in one session: shown a contact-admin link.

### 7.3 Split pay — captain flow

- Captain pays own share (or full upfront).
- After captain payment clears: system generates individual player invoice links and displays player invite link on captain's confirmation screen.
- Captain shares link. Players click → log in → land at Payment step. Other steps already completed by captain (or players complete own details — configurable per league).
- Captain dashboard: live payment collection tracker — collected vs. outstanding, per-player paid/unpaid list.
- Automated reminders to unpaid players at admin-configurable intervals.

#### Endpoints

```
POST  /api/v1/public/registration/submissions/{id}/invoice
POST  /api/v1/public/registration/submissions/{id}/payment
GET   /api/v1/captain/teams/{team_id}/payment-tracker
POST  /api/v1/admin/invoices/{invoice_id}/mark-paid
```

---

## Phase 5 — Admin & Captain Review

**Actors:** League Admin, Team Captain, System

After payment, submission enters admin review **asynchronously** — player has paid and awaits approval.

### 8.1 Admin eligibility review

League Admin sees `pending_review` submissions in Submissions Dashboard (Spec v2 §4).

**Individual actions:**
- **Approve** → status `approved`. Fires `on_approved`. Player added to roster or pool.
- **Reject** → requires reason text. Status `rejected`. Fires `on_rejected`. **Triggers refund** (full for full payment; deposit refund policy for plans — configurable).
- **Request resubmission** → admin writes a comment. Status `incomplete`. Player emailed with note + link to update documents.
- **Override flag** → admin can override a specific eligibility flag with written justification. Justification stored in audit log. Submission advances.

**Bulk actions:**
- Select multiple → **Approve all** (only `pending_review` ones; others skipped).
- Select multiple → **Reject all** (single reason applied to all).
- Select multiple → **Email selected** (choose template).
- All bulk actions logged to `submission_bulk_actions` with `admin_user_id`, `action_type`, `submission_ids`, timestamp.

> **NEW** — Original workflow had admin review BEFORE payment. Corrected: payment first, async review after. Eliminates launch-day queue problem. Refund handles the rare admin-rejection case.

### 8.2 Captain team-join review

When player registers via captain invite (2D) or self-registers to a specific team (2A), the captain must approve.

- Captain sees notification: 'New player requests to join your team.'
- Views player profile: name, position, level, photo.
- **Approve** (added to roster) or **Decline** (player notified, submission not cancelled — can register elsewhere or go to free agent pool).
- If captain doesn't act within 48h: reminder. If not within 7 days of `roster_lock_date`: system **auto-approves** (configurable).

**Decision: Both admin AND captain approved (where applicable)?**
- ✓ → Phase 6.
- ✗ → Appropriate rejection path (state machine §10).

#### Endpoints

```
PATCH /api/v1/admin/submissions/{id}/approve
PATCH /api/v1/admin/submissions/{id}/reject
PATCH /api/v1/admin/submissions/{id}/request-resubmission
POST  /api/v1/admin/submissions/{id}/override-flag
PATCH /api/v1/captain/team-join-requests/{id}/approve
PATCH /api/v1/captain/team-join-requests/{id}/decline
```

---

## Phase 6 — Confirmation & Activation

### 9.1 System actions on approval

1. Player record `status = active` for season.
2. Added to team roster (team / invite paths) OR confirmed in free agent pool (free agent path).
3. `on_approved` email sent to player (and parent if minor).
4. Captain notified via push + email.
5. Roster count updated. If `max_roster_size` reached: team marked full. Pending invites for that team auto-cancelled with notification.
6. Player profile visible on team roster page, division standings, leaderboards.
7. If USA Hockey API integration active: governing body ID registered with the league for the season.

### 9.2 Confirmation screen — per path

**Team registration (captain):**
- 'Your team is registered!' + team name and division.
- Reference number.
- Payment summary (amount paid, installment schedule if applicable).
- Player invite link (if split pay) — Copy button + share prompt.
- Next: 'Your admin will review. You'll be notified by email.'

**Individual player:**
- 'You are registered!' + season name and division.
- Reference number + payment summary.
- Next: 'Your registration is being reviewed.'

**Free agent:**
- 'You are in the free agent pool!'
- 'Captains in your division can now view your profile and invite you.'
- 'You'll be notified if a captain invites you. You can also browse available teams.'

### 9.3 Free agent assignment path (post-confirmation)

1. System notifies captains in matching divisions.
2. Captain browses pool, filters, sends team invite.
3. Free agent receives invite (email + push + in-app). Accept or Decline.
4. **Accepted** — moved from pool to roster. Admin notified. Phase 5 approval still applies.
5. **Declined** — captain notified. Stays in pool.
6. **No response 48h** — reminder. **No response 72h** — invite expires. Captain can resend.
7. **Unplaced at `roster_lock_date`** — admin notified. Manual assign or mark inactive.

#### Endpoints

```
GET  /api/v1/player/registration/confirmation/{submission_id}
GET  /api/v1/player/dashboard
```

---

## 10. State Machine

| Submission state | Triggered by | System actions |
|---|---|---|
| `pending_verification` | Account created, email not verified | Verification sent. Session preserved. Nothing unlocked. |
| `pending_consent` | Player < 18, parent consent email sent | 72h link. Reminders at 24h/48h. New link on expiry. Cannot advance. |
| `pending_payment` | Waivers signed, eligibility checked | Invoice generated. Payment screen. |
| `pending_offline` | Offline payment selected | No Stripe. Admin marks paid. |
| `pending_review` | Payment confirmed, awaiting admin | Admin notified. `on_payment` email. Captain notified (team path). |
| `incomplete` | Admin requested resubmission | Player emailed with admin note. Re-upload + resubmit. |
| `approved` | Admin approves | Activated on roster/pool. `on_approved` email. Captain notified. |
| `rejected` | Admin rejects | Refund triggered. `on_rejected` with reason. Captain notified if team path. |
| `cancelled` | Player cancels before approval | Refund per policy. Player notified. |

---

## 11. Notifications Map

| Trigger | Recipient | Channel | Template |
|---|---|---|---|
| Account created | Player | Email | Verification link (24h) |
| Email verified | Player | Email | 'Welcome — continue your registration' |
| Parental consent required | Parent | Email | Consent link (72h) |
| Parent consent reminder (24h) | Parent | Email | 'Action required' |
| Parent signed | Player | Email + Push | 'Parent approved — complete' |
| Waiver declined | Player | In-app | Inline error |
| Payment confirmed | Player / Parent | Email | `on_payment` (receipt + plan) |
| Installment reminder (3 days) | Player / Parent | Email + SMS | `installment_reminder` |
| Installment failed | Player + Admin | Email | Failed + retry link + late fee |
| Submission pending review | Admin | In-app + Email | New in compliance queue |
| Admin requests resubmission | Player | Email | Admin note + update link |
| Captain invite | Player | Email + SMS | Invite + team details (7 days) |
| Captain invite reminder | Player | Email | Resend at 48h |
| Admin approved | Player + Parent | Email + Push | `on_approved` |
| Admin rejected | Player + Parent | Email | `on_rejected` + reason + refund |
| Roster updated | Captain | Email + Push | '[Player] added to your roster' |
| Free agent invite | Free agent | Email + Push + In-app | Captain + team + Accept/Decline |
| Free agent accepts | Captain | Email + Push | '[Player] accepted — pending review' |
| Free agent placed | Admin | In-app | Pool update |
| Season closing (24h) | All pending | Email | `season_closing` |

---

## 12. Data Produced by This Workflow

All defined in Registration Module Spec v2 §2.

| Record | Action | Key fields |
|---|---|---|
| `users` | Created or updated | `id`, `name`, `email`, `phone`, `password_hash`, `email_verified_at` |
| `player_profiles` | Created | `user_id`, `dob`, `gender`, `position`, `level`, `usa_hockey_id`, `emergency_contact`, `medical_notes` (encrypted) |
| `parent_linkages` | Created (minors) | `parent_user_id`, `player_user_id`, `relationship`, `custody_notes` |
| `teams` | Created (team path) | `id`, `name`, `division_id`, `captain_user_id`, `status=pending` |
| `registration_submissions` | Created | `id`, `season_id`, `pricing_tier_id`, `team_id`, `status`, `submission_type`, `answers` JSONB |
| `waiver_signatures` | Per waiver | `submission_id`, `waiver_version_id`, `signed_at`, `ip`, `user_agent`, `signature_text` |
| `compliance_documents` | Per upload | `submission_id`, `document_type`, `storage_path` (encrypted), `uploaded_at`, `admin_review_status` |
| `invoices` | Created | `submission_id`, `amount_cents`, `status`, `stripe_payment_intent_id`, `plan_breakdown` JSONB |
| `installment_schedules` | Plan path | `invoice_id`, `installment_number`, `due_date`, `amount_cents`, `status` |
| `consent_records` | Minors | `submission_id`, `parent_user_id`, `signed_at`, `ip`, `consent_version_id` |
| `submission_bulk_actions` | Bulk ops | `admin_user_id`, `action_type`, `submission_ids[]`, `performed_at` |
| `team_invites` | Invite path | `team_id`, `invitee_email`, `token`, `expires_at`, `status` |
| `free_agent_pool_entries` | Free agent | `player_user_id`, `season_id`, `positions`, `availability`, `level_flexibility` |

---

## 13. Acceptance Criteria

### 13.1 Account & session
1. New player can create an account, verify email, and return to the exact step with all data intact.
2. Player with in-progress registration is offered Resume or Start fresh.
3. Session tokens expire after 72h. Expired session shows clear message and preserves data.

### 13.2 Registration paths
1. All four paths complete end-to-end and produce correct DB records.
2. Path selection screen only shows admin-enabled options.
3. Player arriving via invite link cannot change pre-loaded team or division.
4. Player already registered on another team gets clear error on new invite link.

### 13.3 Compliance & waivers
1. Liability waiver Sign button inactive until scroll-to-bottom.
2. Typed name must match account name exactly (case-insensitive, trimmed). Mismatch → inline error without page reload.
3. Minor triggers parental consent. Parent receives email within 60 seconds.
4. Expired governing body ID shows specific error and blocks advance.
5. Automated eligibility checks complete in < 3 seconds.

### 13.4 Payment
1. Plan timeline matches admin wizard exactly.
2. Full payment + plan deposit processed by Stripe in < 5 seconds.
3. Stripe decline shown verbatim with retry option.
4. Concurrent submissions cannot exceed `usage_limit` (SELECT FOR UPDATE).
5. `on_payment` email delivered within 30s of Stripe confirmation.

### 13.5 Admin review
1. Bulk approve correctly skips non-`pending_review` submissions and returns skipped count.
2. Rejection triggers full refund within 24h (Stripe API called immediately).
3. Resubmission email contains admin's note text and direct link.
4. All admin actions logged to audit trail.

### 13.6 Confirmation & activation
1. Approved player on team roster within 5s.
2. Captain receives push within 60s of player added.
3. Free agent profile visible to captains in matching divisions within 5s.
4. Split-pay invite link shown on captain's confirmation immediately after payment.

---

**End of Workflow 1 v2.0 · SportsPulse · Aligned with Registration Module Spec v2.0 · Confidential**
