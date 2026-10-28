# Registration cluster — PPHL test round (J3, J4, J5)

Tester: registration QA agent, 2026-10-23 (UTC 00:00–02:30), staging only.
Specs: `tests/e2e/journeys/j03-form.spec.ts`, `j04-player-registration.spec.ts`,
`j05-minor-consent.spec.ts`. Run with `E2E_OUTPUT_DIR=test-results-registration`.
J4/J5 read the season J3 built from `test-results-registration-state/registration-j03.json`.
Browser contexts use `timezoneId: America/New_York` (PPHL admins are US-based).

Fixture setup (labelled): no Supabase admin API was used. Every user in these runs
(`staging-e2e+<tag>-adult@`, `staging-e2e+<tag>-minor@`) was created through the
funnel's own "Create account" tab. Guardian emails (`staging-e2e+<tag>-parent@`) have
no inbox; the consent link was read from what the funnel displays (see REG-6) and
cross-checked with a read-only `stagingSql` readback of `registrations.metadata`.

Test-infra fix made: `tests/e2e/journeys/_helpers.ts` imported
`../../playwright.config` (resolves to `tests/playwright.config`, does not exist), so
every journey spec failed to load. Changed to `../../../playwright.config`. No other
shared file was touched.

---

## Bugs (ranked)

```
[REG-1] Funnel "Sign in" never checks the password — anyone can open another player's registration · blocker
  Journey: J4 · UC-01
  Surface: player-web /register/[seasonId] → Account step → "Sign in" tab
  Repro:
    1. Anonymous browser, open /register/<open season>, pick "Register as a player", Next.
    2. Sign in tab: type an existing player's email and the password "definitely-not-the-password".
    3. Click "Sign in & continue".
  Expected: credentials refused; nothing about the player is shown.
  Actual: funnel advances to Details and pre-fills the player's DOB (1990-05-05), phone and answers; the stranger can continue and change the submission.
  Evidence: j04 test 10 findings "wrong password still advances to Details (account takeover)", "stranger sees the player's DOB"; screenshot test-results-registration/j04/10-signin-wrong-password.png
  Root cause: packages/registration-funnel/src/funnel.tsx:1179 calls onSignIn(emailValue) and drops signInPassword; API POST /public/registration/seasons/:id/resume (apps/superadmin-api/src/modules/registration-v2/interface/public-registration.controller.ts:666-855) takes only {email} and looks the user up with the service-role client, returning dobDate/phone/answers. Every later public endpoint authorizes by "email matches" only (loadAndAuthorize, :1980).
  Proposed fix: make the funnel a Supabase-session client: sign in with supabase-js (anon key) in the browser, send the JWT, and have the public-registration controller derive the user from JwtAuthGuard (optional-auth guard) instead of a body email. Drop the email-only resume endpoint.

[REG-2] "Create account" with an existing email and any password registers as that user · blocker
  Journey: J4 · UC-01
  Surface: player-web /register/[seasonId] → Account → "Create account"
  Repro:
    1. Create account with email staging-player@sportspulse.us (existing user) and a new password.
    2. Click "Next: Details".
  Expected: "An account already exists — sign in".
  Actual: funnel proceeds to Details; a registration row is written for the existing user and the player role is granted.
  Evidence: db row registrations db0a9170-2a53-43be-b593-46933af96cef status=pending_payment metadata.email=staging-player@sportspulse.us (created by j04 test 11); finding "existing email + wrong password creates a registration as that user"
  Root cause: apps/superadmin-api/src/shared/auth/supabase-admin.service.ts:51-52 inviteUserByEmail returns the existing user id when the email exists and never checks the password; startSubmission (public-registration.controller.ts:441+) then inserts the registration and calls ensurePlayerRoleForRegistration for that user.
  Proposed fix: same shared fix as REG-1 (authenticated funnel). In the interim, startSubmission must 409 when created=false.

[REG-3] Payment is a client-controlled mock: no card, "PAID" invoice, plan deposit records full price · blocker
  Journey: J4 · UC-01, UC-15
  Surface: player-web funnel Payment step; player-web /payments
  Repro:
    1. Tier $150, payment plan $50 deposit + 2×$50 (J3).
    2. In the funnel choose "Payment plan — $50.00 deposit today", leave card fields empty, click "Pay $50.00".
  Expected: Stripe charges the $50 deposit; invoice total 15000, paid 5000; two scheduled installments.
  Actual: no card needed; invoice INV-… shows "$150.00 PAID" on /payments; db invoices.paid_cents=15000; no installment rows. A "Simulate decline" button is visible to players. Copy says "Card data will be tokenised by Stripe".
  Evidence: finding "plan payment records deposit only: Expected 5000 Received 15000"; "'Simulate decline' button shown to players"; screenshots j04/05-done.png, j04/06-payments.png
  Root cause: public-registration.controller.ts:1546-1780 payInner: outcome comes from the request body (mockOutcome ?? "succeeded", :1588), amount is always tier.fullPriceCents (:1604) and paidCents=amountCents (:1733); no Stripe branch exists. Also the tier is loaded by id without checking it belongs to this season or is active.
  Proposed fix: move payment into the finance module behind Stripe PaymentIntents (deposit amount for plans, installment schedule rows), never accept an outcome from the client, validate tier.seasonId and isActive server-side; hide mock controls unless a server flag says sandbox.

[REG-4] Org admin registrations queue is always empty · blocker
  Journey: J4, J5 · UC-01
  Surface: org-admin-web /registrations (and the Submissions count on /forms/[id])
  Repro:
    1. A player completes the funnel for an org season (status pending_review).
    2. Sign in as org_admin on staging-org, Operations → Registrations.
  Expected: the submission is listed with Approve / Reject.
  Actual: "0 PENDING · 0 TOTAL — No registrations yet" while the org has 7 registration rows.
  Evidence: finding 'OA /registrations lists the submission (page says "0 PENDING · 0 TOTAL", db has 7 rows for the org)'; screenshot j04/07-oa-registrations.png; J5 test 2 same for the pending_consent minor
  Root cause: apps/org-admin-web/src/app/(app)/registrations/page.tsx:21 calls registration.listRegistrations → GET /registration/registrations, which is @UseGuards(JwtAuthGuard, SuperAdminGuard) (apps/superadmin-api/src/modules/registration-compliance/interface/registrations.controller.ts:36-37). The 403 is swallowed by `.catch(() => ({ items: [] }))`. org-admin-web/src/lib/api/client.ts rewrites forms/pricing/email paths to /org-admin/* but not registrations.
  Proposed fix: add a scoped list endpoint (GET /org-admin/registrations, or relax registrations.controller to AuthorizedAccessGuard + @UserScope orgIds filter) and add it to the org-admin rewrite map; stop swallowing errors into an empty state (render "could not load").

[REG-5] Required liability waiver silently skipped; registration completes unsigned · blocker
  Journey: J4, J5 · UC-27
  Surface: player-web funnel Compliance step
  Repro:
    1. J3: Divisions & eligibility keeps "Require liability waiver" ON, waiver text left empty (UI says "Empty falls back to the SportsPulse default"), Save eligibility rules.
    2. Player reaches Compliance.
  Expected: liability waiver shown with scroll-to-sign; cannot continue unsigned.
  Actual: only "Automated eligibility checks" and "Code of conduct" render; no waiver; player continues to payment. No consent_signatures row.
  Evidence: findings "required liability waiver is presented for signature (UC-27): Received false", "waiver signature stored (consent_signatures): Received 0"; screenshot j04/04-compliance.png
  Root cause: packages/registration-funnel/src/funnel.tsx:1514-1520 builds inlineLiability only when content.trim() is non-empty, and when season.config has any waiver key (`usingInline`) it ignores the org documents list. The admin copy in packages/forms-builder/src/divisions-client.tsx promises a default that does not exist. The form-builder "Waivers & documents" editor (form-builder-client.tsx) holds a default text, but season.config wins (funnel.tsx:160-200), so that text is ignored too.
  Proposed fix: one waiver source of truth (season.config or document versions, not both); server-side default body when enabled+empty; server must refuse pay/advance while a required waiver has no signature (today the gate is client-only).

[REG-6] Parental consent link and token are handed to the minor; the token is forgeable · blocker
  Journey: J5 · UC-02, UC-28
  Surface: player-web funnel Compliance → "Parental consent required"
  Repro:
    1. New user, DOB 14 years ago, create account → Details → Next.
    2. Enter guardian email, "Send consent request".
  Expected: link goes only to the guardian; the minor sees "we emailed your guardian".
  Actual: the funnel shows the full email body with https://staging-player.sportspulse.us/parental-consent/<token> and pre-fills the "Consent token" field; the minor can open it and click "Confirm registration". Token = base64url("<submissionId>:<ms>") — the test rebuilt it from the submission id.
  Evidence: findings "consent link shown to the minor", "consent token pre-filled for the minor", "consent token is derivable from the submission id (unsigned): true"; screenshot j05/03-consent-requested.png
  Root cause: public-registration.controller.ts:1098 mints an unsigned token and returns consentToken + mockConsentMessage to the caller (:1135); funnel.tsx ConsentStep (1340-1460) renders it; decodeConsentToken (:1300+) only checks shape and age.
  Proposed fix: random 32-byte token stored hashed on the registration (or HMAC with a server secret), never returned to the player; deliver only by email (Resend) and show "sent" state; redeem binds to the guardian.

[REG-7] Minor is stuck forever after the guardian consents · blocker
  Journey: J5 · UC-02, UC-28
  Surface: player-web funnel consent step; /parental-consent/[token]
  Repro:
    1. Continue REG-6 repro; guardian opens the link in a fresh browser and clicks "Confirm registration" (status → pending_payment).
    2. Minor clicks "Confirm consent" in the funnel.
    3. Minor reloads, signs in again, Details → Next.
  Expected: funnel moves on to waivers and payment.
  Actual: step 2 shows "An unexpected error occurred" (HTTP 500 POST …/parental-consent/confirm); step 3 shows "Parental consent required" again with an empty form; "Send consent request" would also fail (only valid from pending_consent). The minor can never reach payment, so the admin can never approve.
  Evidence: j05-http-errors: "http 500 POST https://staging-api.sportspulse.us/api/public/registration/submissions/34900ec8-…/parental-consent/confirm"; db status=pending_payment; screenshots j05/05-minor-after-parent.png, j05/05-minor-dead-end.png
  Root cause: confirmParentalConsent (public-registration.controller.ts:1146-1170) calls assertValidTransition(pending_payment → pending_payment) which throws a plain Error (500). The funnel's step list (funnel.tsx:236) pushes "consent" whenever isMinor, ignoring that the server status is already past pending_consent.
  Proposed fix: make confirm idempotent (already consented → 200 with current status); drive the step list from server status (skip consent when status !== pending_consent); map kernel transition errors to 409 with a readable message.

[REG-8] Every registration is attached to an arbitrary form version (wrong form, possibly another org's) · major
  Journey: J4, J5 · UC-01
  Surface: API POST /public/registration/seasons/:id/submissions and /resume; visible on player-web /registrations
  Repro: register for season E2EMVK85UUY (form f48452f3…).
  Expected: registrations.form_version_id = a version of that season's form.
  Actual: form_version_id belongs to form b9b50196… (an earlier season's form); player /registrations card reads "E2EMVK7P7PJ REGISTRATION" under season E2EMVK85UUY.
  Evidence: finding "registrations.form_version_id belongs to the season's form: Expected f48452f3… Received b9b50196…"; screenshot j04/06-registrations.png
  Root cause: public-registration.controller.ts:530 and :748 `select().from(registrationFormVersions).limit(1)` with no where clause ("Pick the first active one").
  Proposed fix: resolve the season's published season_registration form (same query getSeasonContext uses, minus the league OR, see REG-25) and 422 when none is published.

[REG-9] Players cannot discover open registrations · major
  Journey: J4 · UC-01
  Surface: player-web /register ("Open registrations"), player home
  Repro:
    1. Anonymous browser → staging-player /register.
    2. Signed-in staging-player → /register and /.
  Expected: open seasons listed (UC-01 trigger "Player clicks Register on league portal").
  Actual: (1) anonymous is redirected to /sign-in although middleware lists /register as public; (2) signed-in player sees "Nothing's open right now" — in this run the season's registration_opens_at was 04:00Z (REG-10 forced it), so (2) is not conclusive for an open window. By code, a brand-new player with no org role always gets an empty list.
  Evidence: findings "anonymous /register is reachable: Received /sign-in"; screenshots j04/01-anon-register.png, j04/02-player-register.png
  Root cause: apps/player-web/src/app/(app)/register/page.tsx sits in the authenticated (app) group and calls listOpenForMe; GET /public/registration/open-for-me (public-registration.controller.ts:242-260) returns [] when scope.orgIds is empty, i.e. for every new player. The anonymous GET /public/registration/open has no UI caller.
  Proposed fix: move the open-registrations list out of (app) to a public route that uses /public/registration/open (it only exposes published, open seasons), and keep open-for-me for the signed-in home card.
  Resolved by REG-30 (26 Oct): a public page per league, /join?org=<slug>.

[REG-10] Admin cannot open registration "today" in the US evening; failed setup leaves an orphan league · major
  Journey: J3 · UC-01 precondition
  Surface: org-admin-web /org-setup → Season → Publish league
  Repro: at 20:00–23:59 ET, set Registration opens = today (ET), Publish league.
  Expected: accepted (client validation allows today).
  Actual: red banner "registrationOpensAt must be today or a future date"; league row "E2EMVK83DFF League" already created with 0 seasons.
  Evidence: screenshot test-failed-1 of j03 run E2EMVK83DFF (Divisions step banner); db leagues name='E2EMVK83DFF League' seasons=0
  Root cause: apps/superadmin-api/src/modules/league-management/interface/dto/season.dto.ts:21-46 compares the UTC date of the ISO string with the server's UTC date; the browser sends local midnight. packages/admin-pages/src/org-setup/org-setup-wizard.tsx:262-300 creates league, season, divisions in separate calls with no rollback.
  Proposed fix: send date-only values plus the league timezone and validate in that timezone; make org-setup one server command in one transaction.

[REG-11] Registration window shown one day late · minor
  Journey: J3
  Surface: org-admin-web /forms/[id]?section=review
  Repro: closes typed as Nov 13 in an ET browser.
  Expected: "Oct 23 – Nov 13".
  Actual: "Oct 23 – Nov 14".
  Evidence: finding "review registration window"; screenshot j03/08-review.png
  Root cause: org-setup-wizard.tsx:289 stores closes as local 23:59:59 (04:59Z next day); review-section.tsx:121 formats on the server in UTC.
  Proposed fix: format with the league timezone (shared date formatter in packages/kernel).

[REG-12] Org admin "Live wizard" opens the PRODUCTION player app · major
  Journey: J3
  Surface: org-admin-web /forms/[id] header "Live wizard"
  Expected: https://staging-player.sportspulse.us/register/<seasonId> on staging.
  Actual: https://player.sportspulse.us/register/<seasonId>. Superadmin's link is correct.
  Evidence: finding "OA Live wizard must target this environment's player app"; state liveWizardHref
  Root cause: packages/forms-builder/src/setup-shell.tsx:217 falls back to the prod URL when NEXT_PUBLIC_PLAYER_WEB_URL is unset; the org-admin staging project does not set it and no .env.example / vercel.json declares it.
  Proposed fix: declare NEXT_PUBLIC_PLAYER_WEB_URL in apps/org-admin-web/.env.example and vercel.json; no prod fallback in shared packages (fail loudly).

[REG-13] Review "Registration links" point at a hard-coded marketing domain · major
  Journey: J3
  Surface: /forms/[id]?section=review (OA and SA)
  Actual: "powerplayhockeyleague.com/registration/<slug>" and "/player" split-pay link; neither route exists.
  Evidence: finding "registration links"; screenshot j03/08-review.png
  Root cause: packages/forms-builder/src/review-section.tsx:82.
  Proposed fix: build from the player app URL + /register/<seasonId>; drop the split-pay link until that flow exists.

[REG-14] "Registration type" setting does nothing · major
  Journey: J3 / J4 · spec registration-module-v2 §1.2
  Surface: /forms/[id] Season setup → Registration type; funnel Path step
  Repro: Season setup → Registration type "Team + individual (mixed)" → Save → reload.
  Actual: "Saved." shows and PATCH /org-admin/forms/:id returns 200, but registration_forms.description stays null; after reload the dropdown shows "Team registration (captain-led)" while Review says "Team + individual" (its null fallback). Even when stored, the funnel always offers all paths (team, player, free agent, captain invite).
  Evidence: findings "registration type persisted (PATCH 200): Received null", "registration type after reload: Received team_captain_led" (run E2EMVK8ZS8T); screenshot j03/08-review.png
  Root cause: apps/superadmin-api/src/modules/registration-compliance/application/registration-forms/handlers.ts UpdateFormHandler.execute applies description only inside `if (input.name !== undefined) form.rename(name, description)` — a description-only PATCH is a silent no-op with 200. Design: packages/forms-builder/src/season-section-form.tsx:51,109 stores the type in the free-text description column; funnel.tsx PathStep (:860-930) never reads it.
  Proposed fix: add seasons.registration_type (enum team|individual|both) in packages/db, edit it in Season setup, filter PATHS in the funnel and enforce in startSubmission.

[REG-15] Guardian consent page has no signature and stores no consent record · major
  Journey: J5 · UC-28
  Surface: player-web /parental-consent/[token]
  Actual: page shows child, season, org and two buttons; no name, checkbox or signature; guardian identity unknown; no consent_signatures row. UC-27/§6.1 also says the guardian signs waivers for a minor; the funnel asks the minor to type their own name.
  Evidence: findings "guardian portal collects a signature / acknowledgement: 0", "consent record stored in compliance: 0"; screenshot j05/04-parent-portal.png
  Root cause: apps/player-web/src/app/parental-consent/[token]/consent-client.tsx:143-172; redeemParentalConsent only flips status (public-registration.controller.ts:1243-1300).
  Proposed fix: typed legal name + checkbox, write a consent signature (document version, IP, UA, signer email) through the registration-compliance document repository; route minor waivers to the guardian.
  Status (29 Oct 2026): fixed. Consent: typed name + checkbox, consent record (recordGuardianConsent). Documents: the consent page shows the league's documents and the same signature covers them (signGuardianDocuments, labelled "Signed by parent or guardian <name>"); the minor's own signature is refused (409 guardian_signs) and their Waivers screen shows who signed. A guardian who consented earlier signs the documents from a fresh documents-only link. Evidence: J05 on staging; older-minor API check 9/9; guardian page browser check 7/7.

[REG-16] Funnel accepts registrations before the window opens · major
  Journey: J4
  Surface: player-web /register/[seasonId]
  Actual: registration 4c00e164 created 2026-10-23T00:35Z for a season whose registration_opens_at is 04:00Z; it was paid and approved.
  Evidence: db registrations.created_at vs seasons.registration_opens_at
  Root cause: getSeasonContext (public-registration.controller.ts:348-430) and startSubmission check neither status nor window.
  Proposed fix: one shared "isRegistrationOpen(season)" in packages/kernel used by the context endpoint (render "Registration closed/not yet open") and by startSubmission/pay (409).

[REG-17] Review queues: org admin rows unreadable, Approve offered on unreviewable rows; SA counters wrong · major
  Journey: J4, J5
  Surface: org-admin-web /registrations; superadmin-web /registrations
  Actual: OA table shows Reference = id prefix, Subject = person-id prefix, no name/season/tier/consent; Approve/Reject shown for any status starting with "pending_" (pending_consent, pending_payment), which the server then refuses; Reject reason optional. SA page header cards read "0 pending · 0 total submissions" while the queue below lists rows; SA review dialog shows Path "individual" (raw enum) and Tier "9903d91c" (id prefix).
  Evidence: code (OA list never loads, REG-4); SA screenshot j04/08-sa-review-dialog.png
  Root cause: apps/org-admin-web/src/app/(app)/registrations/registrations-table.tsx:42 isReviewable, :86 subjectPersonId.slice; OA has its own table instead of the SA ReviewQueue (apps/superadmin-web/src/components/registrations/review-queue.tsx) — a silo; SA stat cards read a different list.
  Proposed fix: move ReviewQueue + review dialog into a shared package and mount it in both apps with role-scoped API; reviewable = pending_review | pending_offline only; reason required on reject.

[REG-18] Duplicate config sources in the form builder · major (raised 26 Oct: the funnel offers every division's price) · fixed in code
  Journey: J3
  Actual: (a) two waiver editors (Form builder "Waivers & documents" and Divisions "eligibility") — the first is ignored once the second is saved; (b) "Allow free agent registration" shows ON by default in admin but the funnel defaults it OFF until saved; (c) tier "Division" select and the Divisions assignment matrix both assign divisions; (d) Max roster size exists on the division (org-setup) and on season.config.
  Root cause: packages/forms-builder/src/divisions-client.tsx:82 (`?? true`) vs packages/registration-funnel/src/funnel.tsx:158 (`?? false`); pricing-tab.tsx Division select vs pricing_tier_divisions.
  Proposed fix: one canonical field each, defaults in packages/kernel shared by admin and funnel.
  Status 26 Oct: (b) fixed (commit bda4634: both read SEASON_CONFIG_DEFAULTS); (d) fixed (commit 88f4fa7: the season's
    max roster is the default for divisions without their own). (a) and (c) open, traced in code:
  (a) The Waivers & documents tab writes the form version (schema.waivers.*), the Divisions tab writes seasons.config
    (requireLiabilityWaiver, requireCodeOfConduct and their texts, always all four keys). One kernel rule,
    resolveRegistrationWaivers, decides: the season boolean wins, then the form's switch, then on. So after one
    eligibility save the form's liability and code-of-conduct switches never count again. The admin season page prints
    "No" for an unset requireLiabilityWaiver although the effective default is on.
  (c) The tier "Division" select writes pricing_tiers.division_id; "Whole season" sends no key, so the old division
    stays. The Divisions matrix writes pricing_tier_divisions and overwrites division_id with the first ticked division.
    Readers: the player funnel reads neither and offers every active tier of the season whatever division was picked;
    neither the tier change nor payment checks the tier against the division. The captain team registration reads
    division_id only. pricing_tier_divisions is read by no player or captain flow. Severity: (c) lets a player pick
    another division's price; raised to major. Also found: the price step accepted any tier id (another season's,
    inactive), the division change accepted another season's division, and payment charged $0 when no price was picked.
  Fix (c), 26 Oct: one rule in packages/kernel/src/pricing-tiers.ts. The Divisions grid decides which divisions a price
    is for; a tier saved before the grid keeps its single division; none means the whole season. One loader
    (registration-v2/application/season-tiers.ts) feeds the funnel context, the admin tier list, the submission and
    payment checks and captain team registration. The funnel shows only the registrant's division's prices and drops a
    stale pick. The server refuses another division's or season's price (422), refuses another season's division (422),
    clears a price that a division change leaves invalid, and at payment re-checks the price (409) and requires one when
    prices are offered (409). The pricing tab's own Division picker is gone; it shows the divisions and "Set on the
    Divisions tab".
  Evidence: kernel 117/117 (4 tier tests). Local API against staging, regfa/verify-reg18c.mjs 10/10 (context and admin
    list carry divisions; B's price refused in A 422; A's accepted; other season's division 422; moving to B clears A's
    price; pay with none 409; pay with A's price forced into the row 409; no invoice from refused pays; B's price pays
    $222.00). Browser, local player and admin apps, regfa/walk-reg18c.mjs 6/6 (new player in division B: price step
    shows B's price and not A's; registration holds B and B's price; admin pricing tab shows each price's divisions, no
    picker). Season-wide price shown in the browser: not exercised (that season has none; kernel test covers it).
  Not verified: captain team registration's price (kernel test + typecheck only).
  Fix (a), 26 Oct: for a form bound to a season, the Waivers tab no longer edits the liability waiver and code of conduct
    (its switches were ignored once the season's were saved). It shows what the funnel will ask for, from the same
    kernel rule (resolveRegistrationWaivers): Required or Off, whose text is used, and "Set on the Divisions tab". The
    photo release stays editable there (only the form has it). A form with no season keeps its editors. The season page
    shows each registration switch as Yes or No when set and "Default (on/off)" when not (it printed No for unset).
  Evidence (a): local admin app against staging, regfa/walk-reg18a.mjs 5/5: both documents read-only and matching the
    public document list; no switch for them, photo release switch present; turning the season's code of conduct off
    shows Off on the tab and drops it from the funnel's list; season page shows the liability switch as set. Season
    config restored.
  Not verified (a): the "Default (on)" wording in a browser (that season has the switch set); the Divisions tab still
    starts an unsaved season at the kernel default rather than an old form's own switch (old forms only).

[REG-19] Pricing tier editor is raw cents and missing plan controls · minor
  Journey: J3 · UC-01 "installment"
  Actual: "FULL PRICE (CENTS)", "DEPOSIT (CENTS)" — typing 150 means $1.50; no early-bird / date-based price; installment interval (30 days) and dates not editable; new tiers are created inactive and only become active when the season status changes to registration_open (a tier added after opening stays hidden).
  Evidence: findings "price field label asks admin for cents", "early-bird option offered: 0"; screenshot j03/04-pricing.png
  Root cause: packages/forms-builder/src/pricing-tab.tsx:166-190, :27 (isActive:false); seasons/handlers.ts ChangeSeasonStatusHandler.
  Proposed fix: money input in dollars (shared MoneyInput), installment interval/dates fields, create tier active when the season is already open.
  Scope note (26 Oct): early-bird (date-based) prices are not in PPHL's requirements or use cases; J3 now logs the
    option instead of reporting it. Not built.

[REG-20] New form dialog: no season picker; org_admin offered "Super Admin" audience · minor
  Journey: J3
  Surface: org-admin-web /forms → New form
  Actual: a season-registration form is created unbound (season chosen on a later tab); "Applies to roles" lists Super Admin, Org Admin, … to an org_admin.
  Evidence: findings "season picker in New form dialog: 0", "org_admin offered Super Admin as applies-to role: 1"; screenshot j03/02-new-form-dialog.png
  Root cause: packages/admin-pages CreateFormButton (shared) — listSeasons is passed but not rendered for purpose=season_registration.
  Proposed fix: when purpose = season_registration, require a season dropdown in the dialog; filter roles by what the caller may grant.

[REG-21] Skill level enum differs between division setup and funnel · minor
  Journey: J4
  Actual: funnel offers A, B, C1, C2, C3; org-setup divisions use A, B, C, D, Premier; spec says Level A/B/C/D. The "Level / division match" check can never match C/D.
  Evidence: finding "funnel skill levels match division skill/tier enum"
  Root cause: packages/registration-funnel/src/funnel.tsx:2275-2290 hard-coded options; packages/admin-pages/src/org-setup/steps/division-card.tsx skill/tier list.
  Proposed fix: one SKILL_LEVELS enum in packages/kernel used by both.

[REG-22] "Preview" opens the Review tab, not the player form · minor
  Journey: J3 · spec v2 "Form preview"
  Evidence: finding "Preview shows the player form: …?section=review"
  Root cause: packages/forms-builder/src/setup-shell.tsx:206 (and the "Publish" pill :228) both link to section=review.
  Proposed fix: render the shared RegistrationFunnel in a preview mode (no writes).

[REG-23] Funnel copy promises things that do not happen · minor
  Journey: J4, J5
  Actual: "A verification email will be sent" (accounts are auto-confirmed); "Card data will be tokenised by Stripe" (no Stripe); "for the mock flow you'll see the message inline (Workflow 1 §6.2)"; footer "The Account step in a follow-up email will link this submission"; Account step renders two "Next: Details" buttons; "// // PAYMENTS" double eyebrow on player /payments.
  Evidence: screenshots j04/03-account.png, j04/05-done.png, j05/05-minor-after-parent.png, j04/06-payments.png
  Root cause: packages/registration-funnel/src/funnel.tsx (AccountStep ~1276, PaymentStep, ConsentStep 1371-1377, footer)
  Proposed fix: remove dev/mock copy; one primary button per step.

[REG-24] Sign-in resume fires eligibility check with an empty email (404) · minor
  Journey: J5
  Evidence: "http 404 POST …/submissions/<id>/eligibility-check" in j05-http-errors
  Root cause: funnel.tsx submitSignIn uses `email.trim()` (stale state) instead of useEmail for runEligibilityCheck.
  Proposed fix: pass useEmail.

[REG-25] League-scoped forms attach to every season of every org (code) · major
  Journey: J4 (not reproduced — no league-scoped form was published on staging during the run; 4 unpublished ones from other testers exist)
  Root cause: public-registration.controller.ts:191, :306, :401 `seasonId = X OR scope = 'league'` with no org/league match — a newer published league form from org B becomes org A's funnel schema.
  Proposed fix: match scope_id = season.league_id (and org) for league scope.

[REG-26] Sport defaults to "Australian Rules Football" in Org setup (J1 owns org-setup) · minor
  Evidence: finding "sport default for a hockey org"
  Root cause: packages/admin-pages/src/org-setup/org-setup-wizard.tsx:56 firstSportCode.
  Proposed fix: default to the org's sport (or force a choice).
```

---

## Gaps

Backend without UI
- SA-only review actions (request resubmission, override flag, bulk approve) have no org-admin surface (REG-17).
- `consent_signatures` / document repository exists, but guardian consent never writes to it (REG-15).
- `GET /public/registration/open` (anonymous discovery) has no caller (REG-9).
- `seasons/:id/rollover` described in spec; the Season setup "Rollover" button only clones season dates and does not copy pricing/divisions/questions/templates (code: packages/forms-builder/src/season-section-form.tsx:117-145) — not exercised in the browser.

UI without backend
- "Registration type" dropdown (REG-14).
- "Visibility: Draft / Live" select on Review is local state only (packages/forms-builder/src/review-actions.tsx) — not persisted.
- Payment card fields and "Simulate decline" (REG-3); "Discount code" placeholder EARLYBIRD10 — not exercised.
- "More" (…) button in the form header does nothing.

PPHL use case not built
- UC-01: real payment gateway, installment schedule, email/SMS confirmation (no inbox evidence), ID/proof upload in the funnel.
- UC-02: parent account / "Add child" flow; parent-child linkage; parent pays.
- UC-27: waiver timestamp + IP record is written only when a waiver card renders (REG-5); paper-copy upload path absent.
- UC-28: guardian digital signature and consent record (REG-15); decline path exists (not exercised).
- Spec v2: submission bulk-action audit table, per-event email sending (templates are stored; no send observed), adaptive step count from registration type.

---

## Evidence table

Runs: J3 full runs E2EMVK85UUY and E2EMVK8ZS8T (11/12 passed each; test 12 lists 9 and 11 findings); J4 against E2EMVK85UUY (player tag E2EMVK8N875, steps 0–8 then resumed 9–13 with J4_FROM=9); J5 against both seasons (steps 1–4 pass, 5 dead end, 6 skipped). In the final J4 run against E2EMVK8ZS8T, step 8 (SA queue row visible within 30 s) timed out once; it passed in the previous run — treat as flaky/slow, not a confirmed bug. Screenshot paths above (`j03/…`, `j04/…`, `j05/…`) are under `test-results-registration-state/evidence/out-<spec>/` (merged copies of all runs; `test-results-registration/` is wiped on every run). Not committed.

| Journey step | Verified (how, evidence kind) | NOT verified / Blocked (why) |
|---|---|---|
| J3.1 OA Org setup creates league+season+division | Browser walk, db-row (seasons/divisions by name) | Sport default wrong (REG-26); evening-ET dates refused (REG-10) |
| J3.2 New form dialog | dom (purpose select default, role list), screenshot | Season not pickable at creation (REG-20) |
| J3.3 Season dropdown of existing seasons, bind | dom (SELECT, option text), db-row registration_forms.season_id | Registration type persistence (REG-14) |
| J3.4 Pricing tier with plan | db-row pricing_tiers 15000/5000/2/plan=true, screenshot | Early-bird not offered |
| J3.5 Division↔tier, eligibility rules | dom (warning cleared), db-row pricing_tier_divisions, seasons.config | — |
| J3.6 Form builder question + publish | dom "Published — this is now the live version", db active_version_id | Conditional logic not exercised |
| J3.7 Email template (Approved, active) | dom Active chip | Email delivery not observable |
| J3.8 Review & publish | dom summary, "Published.", screenshot | Links wrong (REG-13), window off by one (REG-11) |
| J3.9 Season → registration_open, tier active | dom status control, db seasons.status + pricing_tiers.is_active=true | — |
| J3.10 Live wizard / Preview | href attribute | OA link → prod (REG-12); Preview not a preview (REG-22) |
| J3.11 SA /forms parity | SA list + every tab renders, screenshot | SA list has no Season column (OA has) |
| J4.1 Anonymous discovery | dom (redirect to /sign-in) | Fail (REG-9); direct /register/[id] works anonymously |
| J4.2 Signed-in discovery (home, /register) | dom | Blocked: season window opened 04:00Z due to REG-10 |
| J4.3 Funnel path → account (new user via funnel) | dom stepper, db-row registrations pending_payment | form_version wrong (REG-8) |
| J4.4 Details → compliance → tier → review | dom, stepper 1,2,3,4,5,5,5,⋯ (monotonic) | Liability waiver absent (REG-5) |
| J4.5 Pay (plan) | db-row invoices, registrations pending_review | Real charge absent; plan paid=full (REG-3) |
| J4.6 Player /registrations, /payments | dom + screenshots (Pending review card; $150 PAID) | — |
| J4.7 OA approves | dom "0 TOTAL" vs db 7 rows | Fail (REG-4) |
| J4.8 SA review queue approves | dom row → Review dialog → Approve, db status approved | — |
| J4.9 Player sees approved | dom (resumed run) | — |
| J4.10 Wrong-password sign-in | dom (Details reached, DOB shown) | Fail (REG-1) |
| J4.11 Existing email create-account | dom + db-row for staging-player | Fail (REG-2) |
| J4.12 Duplicate registration | db (still one row) | Visible message not observed (button still spinning at 6 s) |
| J5.1 Minor → pending_consent | db-row status pending_consent | — |
| J5.2 OA approve before consent | — | Blocked by REG-4 (row not listed); server refuses by code (kernel transitions) — not observed |
| J5.3 Guardian email + link | dom (inline email, prefilled token), db metadata.parentEmail | Real email delivery not reachable |
| J5.4 Guardian confirms at /parental-consent/[token] (fresh context) | dom, db status pending_payment + parentConsentConfirmedAt | No signature/consent record (REG-15) |
| J5.5 Minor continues to waivers/payment | http 500 on confirm, dom dead end | Fail (REG-7) |
| J5.6 Admin approves consented minor | — | Blocked by REG-7 (never reaches pending_review) |
| Isolation (org B seasons) | — | Not testable: staging has one org; covered by code reading only (REG-25) |

[REG-27] Org console season overview always says "Could not load forms for this season" · major
  Journey: staging crawl as org admin (25 Oct, build c226f96; also on 24355fb): org Home and every season page flagged.
  Surface: org-admin-web Home ("Where each season stands") and /seasons/<id>, step 2 Registration.
  Repro: sign in as an org admin; open Home.
  Expected: step 2 says whether the season has a published registration form.
  Actual: "Could not load forms for this season" on every season. The shared season overview asks for forms with limit and
    cursor; the org console sends that to /org-admin/forms, whose query only allowed orgId and seasonId, and the API rejects
    unknown query fields (400).
  Fix: /org-admin/forms accepts limit (1 to 200) and cursor; one page comes back with no next cursor.
  Evidence: local API against staging as the org admin: 200 with 40 forms for orgId + limit + cursor (database: 40); another
    org 404; limit 0 rejected (400). Browser on the local org app: Home and the season page show no "Could not load", and step
    2 reads "No form published", which the database confirms for that season (0 forms).

[REG-28] An org admin's approval skipped what approval sets up; the approved row kept saying "pending review" · major
  Found: J4 on staging (26 Oct, ae16c22). Step 7 clicked Approve as the org admin; the row did not change and step 8
    found the registration still pending_review. A direct repeat showed the approval was saved (201, approved) but the
    row kept "PENDING REVIEW" for 6 s once, when the click landed while the page's link prefetches were still loading
    (the same click a second time updated in 1 s).
  Actual: the org admin's /org-admin/registrations/:id/review was its own copy of the review: it changed the status and
    queued the notice, but did not run the approval hooks the super admin's approve runs (free agent into the pool,
    team for a team registration), and its reject did not give back the price seat or void the unpaid invoice (MON-29).
    Org admins are the ones who approve in PPHL.
  Fix: the hooks moved to RegistrationV2Service.applyApprovalSideEffects, called by super admin single and bulk approve
    and by the org admin's approve; the org admin's reject uses closeRegistrationMoney in its transaction. The org
    admin's queue shows the status the server returned at once and still refreshes.
  Evidence: regfa/verify-oa-review.mjs on the local API against staging 3/3 (deployed old code 1/3): free agent approved
    by the org admin is in the pool; org admin reject gives the seat back (3 -> 2) and voids the unpaid invoice.
    regfa/repro-oa-approve.mjs: approve 201 and the row reads APPROVED without a reload.
  Not verified: the org admin queue update in a browser on the new build (J4 step 7 after the next staging push).

[REG-29] Review queues listed the oldest registrations first and cut the newest; rows did not name the season · major
  Found: J4 on staging (26 Oct): the org admin's queue row had no season (finding "OA registrations row shows the
    season"), and reading the queue API showed the order.
  Actual: GET /registration-v2/admin/submissions ordered by created_at ascending and stopped at the limit (200 on the
    org admin's page, 100 on the super admin's "All"). Staging has 48 rows, so nothing was cut yet; a PPHL season has
    hundreds, and every new registration would have fallen past the end of the org admin's queue. The org admin page
    says "Pending entries surface first", which the order did not do.
  Fix: waiting decisions (pending review, pending offline) first, oldest first; then everything else, newest first.
    Each row carries its season name; the org admin's queue has a Season column and the super admin's shows it under
    the registrant.
  Evidence: regfa/verify-queue-order.mjs on the local API against staging 5/5 (deployed old code 3/5: waiting rows not
    first, rest not newest first, no season name).
  Not verified: more than 200 registrations in one org (staging has 48); the queues have no paging yet.

[REG-30] Anonymous players could not find a league's registrations; the anonymous API listed every league · major · decision
  Found: J4 step 1 (26 Oct): an anonymous visitor on /register was sent to sign-in with "session expired"; a brand-new
    player saw "Nothing's open right now" (open-for-me lists only orgs the player already belongs to). Meanwhile
    GET /public/registration/open (no caller) listed every organisation's open seasons to anyone.
  Decision (owner left it to me, 26 Oct; keep the visitor anonymous and keep leagues apart): each league has one public
    registration page, /join?org=<slug>. A visitor sees that league's open seasons without signing in and signs in or
    creates an account only when registering. There is no list across leagues: the API refuses a request that names
    no league (400) and answers 404 for an unknown one. /register without a session, or with a league link, opens the
    league page; a signed-in player keeps their own /register. The org admin's Organisation page and the super admin's
    org page show the link to copy and share (one stable link, like a SportsEngine registration page).
  Evidence: regfa/verify-join.mjs 15/15 on the local build against staging: 400 with no league, 404 for an unknown one,
    18 seasons for pphl-staging and none from another org, slug and id give the same list; anonymous /register ->
    /join with no seasons; /register?org= -> the league page with 18 seasons; a season opens the funnel without
    signing in; signed-in /register unchanged; both admin pages show .../join?org=pphl-staging.
  Not verified: staging and production (next push).

