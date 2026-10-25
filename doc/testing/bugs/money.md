# Money cluster bug log (J13 finance, J14 dues split, J15 comms, J16 store)

Tester: money cluster agent, 2026-10-23. Target: STAGING only (staging-*.sportspulse.us, staging Supabase).
Specs: `tests/e2e/journeys/j13-finance.spec.ts`, `j14-dues-split.spec.ts`, `j15-comms.spec.ts`, `j16-store.spec.ts`.
Run: `E2E_OUTPUT_DIR=test-results-money bash <scratchpad>/e2e-staging.sh tests/e2e/journeys/j1X-*.spec.ts --reporter=line --workers=1`.
Screenshots: `test-results-money-shots/` (named `jNN-<step>.png`). DB readback: read-only `stagingSql`.

**What "paid" means on staging:** there is no Stripe. `PAYMENT_PROCESSOR` is bound to `MockPaymentProcessor`
unconditionally (`apps/superadmin-api/src/modules/finance/finance.module.ts:66`). A "card" payment always succeeds unless the
caller sends `mockOutcome: "failed"`. No money moves. "Paid" = a `payments` row with `external_provider_id = mock_pi_*` and
`invoices.status = 'paid'`. In this round no invoice could be paid at all on staging (see MON-1).

Evidence levels used below: **runtime** = observed in a real browser on staging (+ db readback); **code-read** = found by
reading local `main`, not observed at runtime (usually because an earlier bug blocked the step).

---

[MON-1] Admin invoice creation always fails (500) · blocker
  Journey: J13, J14 · UC-15, UC-16, UC-17
  Surface: superadmin-web /finance/create (scope Team) and org-admin-web /finance/create (scope Individual)
  Repro:
    1. super_admin → Operations → Invoices → New invoice (/finance/create).
    2. Billing scope = Team, Team = "Staging Skaters", description, $123.45, due date in 2 days → Create invoice.
    3. Repeat as org_admin on staging-org /finance/create, scope Individual, person "Staging Player · staging-player@…", $12.34.
  Expected: one invoice per recipient is created and the page returns to /finance.
  Actual: `POST /api/finance/invoices/bulk` → **500** `{"error":{"code":"INTERNAL_ERROR","message":"An unexpected error occurred"}}`;
    org-admin `POST /api/org-admin/finance/invoices/bulk` → **500**; org-admin form shows "An unexpected error occurred".
    `select count(*) from invoices` stayed 0 for this run. Same 500 from J14 step 2 (team invoice, $600).
  Evidence: runtime. http 500 x3 runs; test-results-money-shots/j13-12c-org-composer-result.png, j14-02-admin-team-invoice.png; db: no rows.
  Root cause: the composer sends `invoiceType: "manual"` (`packages/admin-pages/src/invoice-composer/invoice-composer.tsx` onSubmit) and
    the service defaults to `"manual"` (`apps/superadmin-api/src/modules/finance/application/services/invoicing.service.ts:119`). The DTO
    accepts `manual|registration|team_dues|sub_invoice|referee_payroll` (`.../interface/dto/bulk-invoice.dto.ts:46`), but the table has
    `CHECK (invoice_type IN ('standard','team_dues','sub_invoice'))` (`packages/db/src/schema/finance.ts:150`, migration 0021, confirmed on
    staging via pg_constraint). Every insert violates the CHECK and the transaction rolls back as a generic 500. The 500 cause is
    inferred from the constraint + code (API logs not read).
  Proposed fix: one canonical invoice-type enum in `packages/db` (or `packages/kernel`) imported by the DTO, the service default and the
    composer. Either map "manual" → "standard" in `InvoicingService.createBulkInvoice` or widen the CHECK with an additive migration. Map DB
    constraint violations to a 422 with a readable message instead of INTERNAL_ERROR.

[MON-2] No notification can be written or listed on staging (notifications.read_at missing) · blocker
  Journey: J15, J14, J13 · UC-15, UC-16, UC-18, UC-19, UC-20, UC-21
  Surface: org-admin-web /communications/compose; team-admin-web /captain/dues "Remind all unpaid"; superadmin-web /communications
  Repro:
    1. org_admin → Operations → Communications → Compose. Audiences Players + Captains, channel In-app, subject/body → Send broadcast.
    2. captain → Dues → "Remind all unpaid".
    3. super_admin → Operations → Communications (outbox).
  Expected: one notification row per recipient; captain gets "Queued N reminders"; outbox lists them.
  Actual: (1) API 201 `{"queued":0,"audiencesResolved":2}`, UI says "Queued 0 notifications for 2 recipients. (2 skipped because the row
    already existed or the recipient opted out.)" — the reason shown is false. 0 rows in `notifications`. (2) `POST /api/captain/dues/<team>/remind-all`
    → **500**, no toast, 0 rows. (3) Outbox "No notifications" (QUEUED 0 / SENT 0 / FAILED 0). `select count(*) from notifications` = 0 on staging.
  Evidence: runtime. j15-02-sent.png, j14-05-sa-outbox-after-remind-all.png, http 500 remind-all, db count 0 before/after.
  Root cause: `packages/db/src/schema/notifications.ts:88` declares `readAt: timestamp("read_at")` (added in f4ebb20) but no migration in
    `packages/db/migrations/` creates `read_at`; the staging table has no `read_at` column (information_schema). Drizzle inserts every
    schema column (`default` for unset ones) and selects every column, so every insert/select on `notifications` errors. `NotificationService.queue`
    swallows the error and returns null (`apps/superadmin-api/src/modules/communications/application/notification.service.ts:143-150`), so
    broadcasts, payment confirmations, invoice reminders, invites and game notifications silently vanish; direct inserts (remind-all,
    `captain-dues.controller.ts:226`) surface as 500. Production schema was NOT checked (prod DB is off-limits); if prod also lacks the
    column, prod notifications are broken the same way.
  Proposed fix: add an additive, idempotent migration `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;` and a CI
    check that diffs the Drizzle schema against migrations (drizzle-kit generate must produce no diff). Stop swallowing enqueue errors
    silently: log + return a typed failure so the compose result can say "N failed" instead of "skipped/opted out".

[MON-3] Players can never see their notifications (list endpoint is super-admin only) · blocker (code-read)
  Journey: J15 · UC-19, UC-21
  Surface: player-web /notifications
  Repro:
    1. Player opens Notifications.
  Expected: the player's own notifications, newest first, with an unread count.
  Actual: runtime shows "You're all caught up" — but the db also had 0 rows for the player (MON-2), so runtime cannot yet distinguish this
    bug. From code the page can never show anything.
  Evidence: code-read; runtime page text "You're all caught up … No notifications yet." (j15-03-player-notifications.png).
  Root cause: `apps/player-web/src/app/(app)/notifications/page.tsx:22` calls `communications.listNotifications({recipientPersonId})` →
    `GET /notifications`, which is `@UseGuards(SuperAdminGuard)` (`apps/superadmin-api/src/modules/communications/interface/notifications.controller.ts:73-74`).
    A player gets 403, the page `.catch()` turns it into an empty list. The SDK has no "my notifications" method; `myUnreadCount` exists but
    no page calls it, so there is no unread badge in the player nav (observed: nav label is just "Notifications").
  Proposed fix: add `GET /notifications/me` (recipient = caller's person, uses `recentForPerson`) in the communications controller + SDK
    `communications.myNotifications()`; player-web (and team-admin, which has no inbox at all) call it; render `myUnreadCount` in the nav.
    Never `.catch(() => empty)` a 403.

[MON-4] "+ New invoice" dialog on /finance cannot create anything (empty organisation picker) · major
  Journey: J13 · UC-15
  Surface: superadmin-web /finance → "NEW INVOICE" button (dialog)
  Repro:
    1. super_admin → /finance → NEW INVOICE. Search "Staging" → pick Staging Player. Description, $50, due date, enable payment plan
       (deposit $10, 3 installments) → Create + send.
  Expected: invoice with installment schedule.
  Actual: Organisation select has no options; submit shows "Pick an organisation." No request is sent. The "All orgs" filter on the
    dashboard is empty too.
  Evidence: runtime. j13-02-new-invoice-dialog-result.png; dialog org options `[]`.
  Root cause: `apps/superadmin-web/src/app/(admin)/finance/page.tsx:42` calls `orgs.list({ limit: 500 })`; the API caps `limit` at 100
    (ValidationError) and `.catch()` swallows it to an empty list (the sibling `/finance/create/page.tsx` already has a comment about exactly
    this). Latent behind it (code-read): the dialog's line-item kinds `registration|team_dues|tournament|kit|fine|manual`
    (`components/finance/new-invoice-dialog.tsx:29-36`) are not in the DTO enum, so even with an org every submit would 400; "Save as draft"
    and "Create + send" send the same request; non-individual scopes ask the admin to "Paste the UUID" (raw id input, line 326).
  Proposed fix: delete `NewInvoiceDialog` and make the dashboard button open the shared `InvoiceComposer` (one creation path, per
    reuse rule); fix the `limit: 500` call; port payment plan + fee schedule into the shared composer (MON-6).

[MON-5] Super-admin composer "Individual" scope has no people · major
  Journey: J13 · UC-15
  Surface: superadmin-web /finance/create
  Repro:
    1. Open /finance/create (default scope Individual).
  Expected: person picker lists people in the org (org-admin's identical composer lists "Staging Player · staging-player@…" etc.).
  Actual: Person select shows only "—" and the hint "No people loaded yet for this org".
  Evidence: runtime. composer individual options `["—"]` vs org-admin `["Pick a person…","Staging Player · …","Staging Captain · …","Staging Org · …"]`.
  Root cause: `apps/superadmin-web/src/app/(admin)/finance/create/page.tsx` never passes `persons` to `InvoiceComposerShell`
    (org-admin's page fetches `orgAdminPersons.list` and passes it).
  Proposed fix: fetch persons per org in the SA page (same source as org-admin) and pass them through the shell.

[MON-6] Shared invoice composer has no payment plan / installments or fee schedule · major
  Journey: J13 · UC-15
  Surface: superadmin-web and org-admin-web /finance/create
  Repro: open the composer; look for payment plan / installments / fee schedule.
  Expected: UC-15 "upfront / installments"; the API DTO accepts `paymentPlanEnabled`, `depositCents`, `installmentCount`,
    `installmentStartDate`, `feeScheduleId`.
  Actual: no such fields (text search for "payment plan|installment" and "fee schedule" = 0 matches).
  Evidence: runtime DOM text.
  Root cause: `packages/admin-pages/src/invoice-composer/invoice-composer.tsx` body only sends orgId/scope/target/items/dueAt/notes.
  Proposed fix: add the plan + fee-schedule fields to the shared composer (both apps inherit). Validate deposit < total server-side
    (`invoicing.service.ts:158-170` does not).

[MON-7] Per-player "Remind" on captain dues always fails "Split not found" · major
  Journey: J14 · UC-16, UC-18
  Surface: team-admin-web /captain/dues → row "Remind"
  Repro:
    1. captain → Dues (team has master invoice INV-889AFDA3-MASTER from the J7 run, 2 unpaid shares).
    2. Click "Remind" on the first unpaid row.
  Expected: reminder queued for that player; row shows last reminded.
  Actual: `POST /api/finance/splits/2ed9cf49-…/remind` → **404** `{"code":"NOTFOUND","message":"Split not found"}`; page shows "Split not found".
  Evidence: runtime. j14-03b-after-remind.png; http 404.
  Root cause: `apps/team-admin-web/src/app/(app)/captain/dues/dues-screen.tsx:149` calls `finance.remindSplit(sub.id)` with a
    **sub-invoice id**, but `POST /finance/splits/:id/remind` (`splits.controller.ts:266-303`) looks up `team_invoice_splits`, a different
    table the captain flow never writes. Even when found it only stamps `last_reminder_at` and sends nothing.
  Proposed fix: add `POST /captain/dues/:teamId/sub-invoices/:invoiceId/remind` next to remind-all in `captain-dues.controller.ts`
    (same notification path), and call it from the row. Pick one dues model (sub-invoices) and retire the unused splits table/endpoints.

[MON-8] Custom dues split is not saved; mode resets on reload · major
  Journey: J14 · UC-16
  Surface: team-admin-web /captain/dues → "Split: Custom split"
  Repro:
    1. Switch Split to "Custom split", change the first row to $1.00, tab out.
    2. Reload.
  Expected: custom amounts persisted (sum = team fee) and players' invoices updated.
  Actual: zero non-GET API requests fired; after reload the mode is "Even split" and amounts are back.
  Evidence: runtime. mutations captured `[]`; select value after reload `even`.
  Root cause: split mode and amounts are React state only (`dues-screen.tsx:36-90`). The API that does this
    (`POST /finance/team-invoices/:id/split`, `invoicing.controller.ts:538`) and SDK `createSplit/createSplitsBatchEqual/patchSplit` have no caller.
  Proposed fix: wire Custom split "Save" to `POST /finance/team-invoices/:id/split` (sum-equals-total already enforced server-side);
    re-fetch the breakdown after save. Hide the control until it persists.

[MON-9] Refund does not reduce the invoice's paid amount, so refunds can exceed what was paid · major (code-read)
  Journey: J13 · UC-17
  Surface: superadmin-web /finance/[id] → Issue refund (RefundDialog)
  Repro (planned, blocked by MON-1): pay $123.45, refund $50 wallet credit, then refund $123.45 again.
  Expected: paid_cents 12345 → 7345 after the first refund; second refund refused (exceeds paid).
  Actual (code): both succeed; invoice stays "paid" with paid_cents 12345; wallet gets $173.45.
  Evidence: code-read only (no invoice could be created on staging).
  Root cause: the dialog calls `finance.refundSplit` → `POST /finance/invoices/:id/refund-split`
    (`apps/superadmin-api/src/modules/finance/interface/ar-actions.controller.ts:276-450`), which inserts `refunds`/`wallet_ledger` rows but
    never updates `invoices.paid_cents`/`status`, and checks only `amount <= inv.paidCents`. A second endpoint `POST /finance/invoices/:id/refund`
    (`invoicing.controller.ts:378`) does update the invoice but writes `wallet_transactions` instead of `wallet_ledger` — two wallet ledgers.
    No refund notification is sent to the player (UC-17 step 5).
  Proposed fix: one refund command in the finance application layer: lock invoice, check `sum(refunds) + amount <= paid`, decrement paid,
    set status, write one ledger table, queue `refund.issued` notification, return readback. Delete the duplicate endpoint.

[MON-10] Mock payment processor is wired unconditionally and the player pay dialog exposes "Mock card outcome" · blocker (code-read)
  Journey: J13 · UC-15
  Surface: player-web /payments → Pay dialog; API `POST /finance/invoices/:id/pay`
  Repro (code): any player with an open invoice → Pay → "Mock card outcome: Succeeds" → Pay now.
  Expected: card collected by Stripe; invoice paid only on gateway confirmation.
  Actual (code): `MockPaymentProcessor` always succeeds; the invoice flips to "paid" with no card and no money. The select
    "Mock card outcome (Stripe wires later)" is rendered to players (`payments-client.tsx` PayDialog). Nothing is gated by env.
  Evidence: code-read (`finance.module.ts:66`, `shared/payments/payment-processor.ts`). Not observed at runtime (MON-1 blocked reaching the dialog).
    Production not checked; if prod runs the same `main`, a PPHL player can self-mark invoices paid.
  Root cause: provider binding has no env switch; dialog has no card element.
  Proposed fix: bind the processor from env (`STRIPE_SECRET_KEY` → Stripe, else Mock only when `NODE_ENV!=='production' && PAYMENTS_MOCK=1`);
    remove `mockOutcome` from the player DTO/UI outside test mode; until Stripe ships, disable card pay in prod and offer "pay offline".

[MON-11] Overdue reminders (UC-18) can never fire for admin-created invoices · major (code-read)
  Journey: J13 · UC-18
  Surface: daily pg_cron `sp-daily-overdue-sweep` (06:00) → superadmin-web /payments?tab=overdue
  Repro: create an invoice (blocked by MON-1) and let it pass its due date.
  Expected: invoice flips to overdue, reminders r1–r4 go out, escalation row shows in the admin queue.
  Actual (code): bulk invoices are inserted with `status: 'draft'` (`invoicing.service.ts:132`); there is no "Send" action in any UI
    (`finance.sendInvoice` has no caller; dialog "Create + send" sends the same body as draft); `sp_overdue_sweep()` only selects
    `status IN ('sent','partial','overdue')` (`packages/db/migrations/0027_payments_cron.sql:52`). Draft invoices are never flagged or reminded.
    Players still see and can pay drafts (`/finance/me/invoices` has no status filter). The sweep's reminders also go through the
    `notifications` table (MON-2). Admin escalation view exists (Finance ops → Overdue, "0 invoices").
  Evidence: code-read + cron.job readback (job active, schedule `0 6 * * *`); overdue tab render (j13-11-overdue-tab.png).
  Proposed fix: create as `sent` (or add an explicit Send step that the composer uses), and make "draft" invisible to players.

[MON-12] Captain team message (UC-20) not built · major
  Journey: J15 · UC-20
  Surface: team-admin-web /comms
  Repro: captain → Communications.
  Expected: draft a message to the team (all players / roles / parents) and send.
  Actual: "Coming soon — The Communications page is reserved in the navigation. The backend already has the data; the UI for managing it ships next."
    No textarea. No captain/team message endpoint exists in the API either. Team-admin has no notifications inbox link.
  Evidence: runtime. j15-06-captain-comms.png.
  Root cause: `apps/team-admin-web/src/app/(app)/comms/page.tsx` is a placeholder; no backend.
  Proposed fix: reuse the org broadcast path with a `team` audience scoped by `userIsCaptainOfTeam`, and a shared compose component.

[MON-13] League announcement compose is missing UC-19 fields · major
  Journey: J15 · UC-19
  Surface: org-admin-web /communications/compose
  Repro: open Compose.
  Expected: target league / division, schedule for later, attachments or links, multiple channels (email/SMS/push/in-app), delivery tracking.
  Actual: four role checkboxes for the whole org (Captains, Coaches, Players, admins), one channel (Email or In-app), no league/division
    picker, no schedule, no attachment, no SMS/push. Outbox shows lifecycle counters only.
  Evidence: runtime DOM (compose text in run log; j15-01-compose.png).
  Root cause: `compose-form.tsx` + `org-admin-broadcast.controller.ts` audience model is org-wide roles only.
  Proposed fix: add league/division scope to the broadcast DTO and resolver; allow channel multi-select; add `scheduled_at`.

[MON-14] Game-change notifications to players (UC-21) not built · major (code-read; runtime blocked)
  Journey: J15 · UC-21
  Surface: API game-operations; scheduler Edge Functions
  Expected: moving/postponing/cancelling a game notifies affected players, captains, refs, parents.
  Actual (code): `PostponeGameHandler`/`CancelGameHandler` (`game-operations/application/games/handlers.ts:165-190`) do not notify; only
    `game.finalized` is queued. `scheduler-conflict-apply`/`scheduler-publish` notify **rinks** (`rink_notification_outbox`), not people.
    Player settings page lists no game-change category. Runtime: staging has 0 games, so not exercised.
  Evidence: code-read; db `games` = 0, `rink_notification_outbox` = 0.
  Proposed fix: emit `game.postponed|cancelled|rescheduled` from the game command handlers via NotificationService (after MON-2), with
    recipients = both rosters + officials.

[MON-15] Team store: players cannot order; no roster-generated store · major (gap)
  Journey: J16 · UC-25, UC-26
  Surface: team-admin-web /captain/store → player-web /store
  Repro: captain adds "<tag> Home jersey", $59, Large · Black, stock 10 → player opens Team store.
  Expected: UC-25 generate store from roster; UC-26 personalise name/number, cart, checkout, order status.
  Actual: product create works and the player sees it without delay ($59.00, LARGE · BLACK). The card says "CHECKOUT SOON"; no buy / cart
    / personalise control. No "generate from roster". No order tables.
  Evidence: runtime. j16-01b-product-created.png, j16-02-player-store.png; db `team_store_products` row (price_cents 5900, stock 10).
  Root cause: purchase deferred to real Stripe (page comments in `apps/player-web/src/app/(app)/store/page.tsx`).
  Proposed fix: product scope decision for PPHL; at minimum label it "catalog only" in both apps.

[MON-16] Captain register page claims dues are set up when they are not; dues page points back to it · minor
  Journey: J14 · UC-16
  Surface: team-admin-web /captain/dues → /captain/register
  Repro (staging fixture team, confirmed in "Open" with no master invoice): open Dues → "No dues to track. Run the rollover wizard from
    /captain/register" → open Register.
  Expected: a path that sets up the team's dues.
  Actual: Register shows "You're confirmed!" with Fee "—", "Threshold not set", and all four steps ticked including "Invite your players and
    configure dues split" and "Collect deposits to confirm your spot". No action creates dues. (Later in the session the J7 run registered the
    team in another division, so Dues now shows that master invoice.)
  Evidence: runtime. j14-01b-register.png, j14-01-dues.png.
  Root cause: the register status checklist marks steps complete from entry_status only, not from the existence of a master invoice/
    collected amounts; dues empty state copy hard-codes a route that cannot help a confirmed team.
  Proposed fix: derive each checklist tick from data (invoice exists, collected ≥ threshold); give admin-confirmed teams a "set up dues" action.

[MON-17] Finance ops page shows fabricated QuickBooks activity and another org's name · minor
  Journey: J13 · UC-18
  Surface: superadmin-web /payments?tab=overdue ("Finance ops")
  Actual: header "PPHL E2EMVK5Y660" (an org another tester created, not the user's choice) and "QUICKBOOKS SYNCED · 2 MIN AGO // DEMO …
    Payment confirmed · INV-2025-08841 · $1,000 … Refund issued · INV-2025-08102 · $485" — invoices that do not exist (staging has 0 such rows).
  Evidence: runtime. j13-11-overdue-tab.png.
  Root cause: `apps/superadmin-web/src/app/(admin)/payments/lib/mock-data.ts` fallbacks shown when tables are empty; page picks first org.
  Proposed fix: render an empty state when there is no data (no invented activity); require an explicit org choice.

[MON-18] Internal notes, receipt and update card are stubs · minor (code-read)
  Journey: J13 · UC-15, UC-17
  Surface: superadmin-web /finance/[id] "Save note"; player-web /payments "Download receipt", "Update card"
  Actual (code): `saveNote()` only sets the flash "Note saved locally — wire-through endpoint coming soon." (`invoice-detail-client.tsx:112-125`),
    nothing persists. `downloadReceipt` opens a blank window with a `<pre>` text and "Real PDF receipt wires in the next sprint"
    (`payments-client.tsx:480`), and is only rendered on OPEN invoices with paid > 0, so a fully paid invoice has no receipt at all.
    "Update card" dialog says "this is a stub".
  Evidence: code-read; runtime blocked by MON-1 (no invoice to open). Spec steps 6 and 10 hold the runtime checks.
  Proposed fix: notes column/endpoint on invoices; receipt endpoint (PDF) for paid invoices in history; hide Update card until Stripe.

[MON-19] Org-admin finance has no invoice detail, refund or wallet actions · minor
  Journey: J13 · UC-17
  Surface: org-admin-web /finance
  Actual: only links on the page are `/finance/create`; ledger rows support "record an offline payment inline". UC-17 says a league admin
    issues refunds/credits; only super_admin can (`SuperAdminGuard` on all `finance/*` AR actions).
  Evidence: runtime link list `["/finance/create"]` (page had 0 invoices because of MON-1).
  Proposed fix: role-filtered reuse of the SA invoice detail (god-app rule) with org-scoped guards.

[MON-20] Bulk invoice "individual" target is not checked against the org · minor (code-read)
  Surface: API `POST /finance/invoices/bulk`, `/org-admin/finance/invoices/bulk`
  Root cause: `resolveScopeTargets('individual')` (`invoicing.service.ts`) checks only that the person exists, not that they belong to `orgId`.
    An org admin could bill any person on the platform by id.
  Proposed fix: require an active membership/registration/role in `orgId` for the person, 404 otherwise.

[MON-21] Mojibake in team-admin header: "CAPTAIN Â· 1 TEAM" · minor
  Surface: team-admin-web every page (header)
  Evidence: runtime. j14-01b-register.png top bar.
  Root cause: `apps/team-admin-web/src/app/(app)/layout.tsx:37` contains a literal "Â·" (double-encoded "·").
  Proposed fix: replace with "·".

[MON-22] Players are never told an invoice was issued · major
  Journey: J13 step 3 (local build against staging, 25 Oct) · UC-15
  Surface: player inbox and email after an admin issues an invoice
  Repro: issue an invoice to a player (composer "Create and send", or send a draft).
  Expected: the player gets a notice with the amount, due date and a link to Payments.
  Actual: no notification row at all; the "invoice.created" template existed with the body "Template pending" and nothing queued it.
  Fix (commit 3642294): InvoiceNoticesService on create-as-sent and on send; idempotent per invoice; drafts and void notify nobody.
  Evidence: local API against staging 4/4 (sent notifies once with "$42.00 due Nov 3, 2026"; draft none; send twice = one notice).

[MON-23] An admin "team" invoice never reaches the captain's Dues screen · major (open, needs a decision)
  Journey: J14 step 2 (local build against staging, 25 Oct) · UC-16
  Surface: superadmin-web /finance/create (scope Team) → team-admin-web /captain/dues
  Repro:
    1. Super admin → Finance → New invoice → scope Team → Staging Skaters → $600.00 → Create and send (201).
    2. Captain → Dues.
  Expected (UC-16 precondition "Team invoice created (full season dues)"): the captain sees the $600 team invoice and can split it.
  Actual: the composer writes one separate invoice per rostered player (17 rows, no parent). Dues reads only the division-entry master
    invoice (`division_team_entries.invoice_id` and its sub-invoices), so the captain still sees the old $1,400 master and nothing at $600.
  Decision needed: should "Team" in the composer (a) bill each player directly, as today, and be labelled that way, or (b) create one
    master invoice for the team that the captain splits on Dues? Not changed before release.

[MON-24] Super admin Finance: search, filters and paging do nothing · major
  Journey: J13 step 5 (local build against staging, 25 Oct)
  Surface: superadmin-web /finance (search box, Status, Scope, organisation picker, Prev / Next)
  Repro: Finance → type an invoice number in "Search name, email, invoice #" → Enter. Or pick Status = Overdue, or click Next.
  Expected: the list narrows (or moves to page 2) and the URL keeps the filter.
  Actual: the URL flips to /finance/ar?q=… and back to /finance; the list stays on page 1, unfiltered. Loading /finance?q=… directly works.
  Root cause: `apps/superadmin-web/src/components/finance/ar-dashboard-client.tsx` navigate() pushed `/finance/ar?…`, and
    `/finance/ar` is a bare redirect to `/finance` that drops the query string. Every filter goes through navigate().
    Also: the pager's "of N invoices" is the org-wide count, so a filtered list claimed the unfiltered total.
  Fix: navigate() pushes `/finance?…`; `/finance/ar` keeps its query when it redirects (old links, bookmarks); the invoice
    page's back link and the command palette point at `/finance` ("AR Dashboard" palette entry removed: same page as "Invoices");
    the pager shows "of N" only when the list is not narrowed by status, scope or search.
  Follow-up: Enter typed before the page was interactive did a plain form submit with no named field and reloaded
    /finance unfiltered (seen in J13 step 5). The form now has action="/finance" and the input name="q", so a plain
    submit also searches. Evidence: browser 6/6 (filters) + server-rendered form 3/3 (scratchpad regfa/walk-finance-*.mjs).


---

## Gaps

Backend without UI
- `POST /finance/invoices/:id/apply-wallet-credit` (invoicing.controller.ts:290): no caller (confirmed by grep). Wallet is applied through
  `POST /finance/invoices/:id/pay` (`walletAmountCents`) instead, which writes `wallet_ledger`; apply-wallet-credit writes `wallet_transactions`.
  Two wallet ledgers exist (`wallet_ledger`, `wallet_transactions`); the balance check in the testing guide only sums one.
- `finance.createInvoice`, `sendInvoice`, `reconcileInvoice`, `updateFeeSchedule`: no caller. Screens call `createBulkInvoice` only
  (composer + dialog). No UI sends an invoice (MON-11).
- `finance.createSplit`, `createSplitsBatchEqual`, `patchSplit`, `POST /finance/team-invoices/:id/split`: no caller. Captain dues screen reads
  `GET /captain/dues/:teamId`, and calls only `remind-all`, `cover-outstanding` and (wrongly) `remindSplit` (MON-7/8).
- `communications.myUnreadCount`, `pushSubscribe`: no caller (no unread badge, no push).
- `finance.issueWalletCreditForPerson`, `freezeWallet`, `unfreezeWallet`: no caller.

UI without backend
- team-admin /comms (MON-12). Player store purchase (MON-15). Internal notes, receipt, update card (MON-18).
- Dues split "Custom split" control (MON-8).

PPHL use case not built
- UC-15: card payment via a gateway (mock only, MON-10); confirmation email/SMS (MON-2); installment plan not offered in the working composer (MON-6).
- UC-16: players notified of dues; captain pays missing balance with wallet (cover-outstanding is a mock card charge).
- UC-17: refund notification to player; gateway refund failure path (mock); refund bookkeeping (MON-9).
- UC-18: overdue for admin invoices (MON-11); per-invoice "disable auto-reminders" exists only as escalation "Suppress".
- UC-19 targeting/schedule/channels (MON-13). UC-20 (MON-12). UC-21 (MON-14). UC-25/26 (MON-15).
- Suspected (code search only, not verified): captain-registration sub-invoices are created with `recipient_person_id = null` and
  `team_id = null` for invited emails (db rows INV-889AFDA3-MASTER-01/02). `/finance/me/invoices` matches on `recipient_person_id`, and no code
  was found that links them when the invitee joins, so those players may never see their share on /payments.

## Evidence table

| Journey step | Verified (how, evidence kind) | NOT verified / Blocked (why) |
|---|---|---|
| J13.1 SA finds Invoices (Operations group) and AR dashboard renders | runtime: click path, dom text "TOTAL INVOICED $0.00" | — |
| J13.2 AR "+ New invoice" dialog | runtime: org options `[]`, "Pick an organisation.", no request (MON-4); recipient search by name works (GET /iam/persons 200) | dialog kind/400 path (blocked by empty org) |
| J13.3 /finance/create composer, team + individual | runtime: http 500, db 0 rows (MON-1); individual picker empty (MON-5); no plan/fee schedule (MON-6) | — |
| J13.4 player sees invoice, pays (mock) | — | Blocked: no invoice (MON-1) |
| J13.5 admin sees paid status without reload | — | Blocked (MON-1) |
| J13.6 internal note persists | code-read (MON-18) | Blocked runtime (MON-1) |
| J13.7 refund dialog, over-refund | code-read (MON-9) | Blocked runtime (MON-1) |
| J13.8 wallet credit | — | Blocked (MON-1: needs an invoice detail page) |
| J13.9 player applies wallet credit to 2nd invoice | — | Blocked (MON-1) |
| J13.10 receipt / update card | code-read (MON-18) | Blocked runtime (MON-1) |
| J13.11 overdue view + trigger | runtime: Finance ops → Overdue renders "0 invoices"; db cron.job `sp-daily-overdue-sweep` active; code-read draft exclusion (MON-11); fake QB rows (MON-17) | an actual overdue run (needs a past-due sent invoice; composer forbids past dates; cron runs 06:00) |
| J13.12 org-admin finance parity / isolation | runtime: page renders, composer lists 3 org people, create 500 (MON-1), no detail links (MON-19); no foreign-org invoice numbers visible (0 invoices exist, so weak) | isolation with real rows (no invoices could be created) |
| J14.1 captain finds Dues | runtime: fixture team → empty state + register dead end (MON-16); later run shows J7's master invoice $1,400, 2 shares | — |
| J14.2 admin team invoice reaches dues | runtime: 500 (MON-1); code: bulk invoices never feed /captain/dues (different model) | MON-23 |
| J14.3 even/custom split persist, per-row remind | runtime: 0 mutations, mode resets (MON-8); remind 404 (MON-7) | — |
| J14.4 each player sees share on /payments | db: shares are for J7's invited emails, `recipient_person_id` null | Blocked: no share for staging-player; no creds for the invitees |
| J14.5 remind-all → admin outbox | runtime: 500, db 0 rows, outbox empty (MON-2) | — |
| J14 cover outstanding | — | Not run deliberately: would mock-charge and mark another tester's (J7) shares paid |
| J15.1 OA compose discoverable, UC-19 fields | runtime: Operations → Communications → Compose; missing fields (MON-13) | — |
| J15.2 OA sends in-app broadcast | runtime: 201 `queued:0` of 2, db 0 rows (MON-2) | — |
| J15.3 player receives + mark read in place | runtime: "You're all caught up", db 0 rows | Blocked by MON-2; MON-3 is code-read |
| J15.4 player notification settings persist | runtime: PUT 200, aria-pressed flipped after reload (pass), restored afterwards; no league-announcement category listed | — |
| J15.5 SA outbox + templates | runtime: outbox empty, templates "No templates yet" (catalog fallback, no org.broadcast row) | — |
| J15.6 captain team message | runtime: "Coming soon" (MON-12) | — |
| J15.7 game-change notification | db: 0 games, 0 game.* notifications; code-read (MON-14) | Blocked: no games on staging |
| J16.1 captain adds product | runtime: 201, visible in list without reload, db row (pass); no generate-from-roster | — |
| J16.2 player sees product, orders | runtime: product visible on player-web (pass); no order control (MON-15) | ordering not built |
| J16.3 cleanup | runtime: this run's product removed (db 0) | one product "E2EMVK6YKM5 Home jersey" from an earlier run is still on Staging Skaters (labelled with its tag) |

Unidentified: every app page logs one browser console "Failed to load resource: 400" that is not an `/api/` call (watchErrors only
captures API URLs). Not investigated.

---

## Fix round 25 Oct 2026 (branch `pphl-journey-fixes`, not committed)

Evidence level: **local** = branch code built locally (API + Next dev servers) against the STAGING database and staging
Supabase auth, driven by Playwright from a script; **staging-db** = SQL on staging. The deployed staging apps still run an
older build, so nothing below is verified on the deployed staging URLs yet.

- **MON-4 not reproduced on branch.** Fixed earlier in 86201c6 (dialog removed; "New invoice" is a link to `/finance/create`;
  `orgs.list({ limit: 100 })`). Local browser: link href `/finance/create`, organisation picker lists 33 orgs incl. PPHL Staging.
  Latent: the org list is one page of 100 (33 on staging today).
- **MON-5 not reproduced on branch.** `/finance/create` passes `persons` from `orgAdminPersons.list` (super_admin passes the
  guard). Local API: `GET /org-admin/persons?orgId=<PPHL Staging>` as super_admin → 200, 56 people incl. Staging Player.
  Local browser: picker lists 67 options incl. "Staging Player · staging-player@…", no "No people loaded" hint.
  Latent: the page fans out one persons request per org (33 today); a failed one silently shows that org as empty.
- **MON-9 fixed (local).** One command, `RefundService` (`finance/application/services/refund.service.ts`), reached only
  through `POST /finance/invoices/:id/refund-split` (needs `X-Idempotency-Key`). Invoice row locked; refund limited to what is
  still refundable (and card part to card money); card part through `PaymentProcessor.refund` (mock); wallet part credits
  `wallet_ledger`; invoice `total_cents` and `paid_cents` both drop by the refund (a refund settles that part of the bill, so
  the player is not chased for it); status recomputed; readback; `refund.issued` notification. Removed: `POST /finance/refunds`,
  `POST /finance/invoices/:id/refund`, `POST /finance/invoices/:id/apply-wallet-credit` (no callers; second wallet ledger),
  and `refund` as a record-payment method. `reconcileStatus` subtracts these refunds. Before (local API, branch HEAD):
  5 refunds totalling 29,691 cents accepted on a 12,345-cent invoice, paid stayed 12,345, replay doubled. After: 50.00 wallet
  refund → total/paid 7,345; replay with same key → no new row; 123.45 more → 409; 73.45 to card → 0/0; 0.01 more → 409;
  two parallel 15.00 refunds on 20.00 left → one 201, one 409; void → 409; player → 403. Browser: dialog → "Refunded −$50.00",
  "Paid (after refunds) $73.45", "Refunds (1)" without reload; over-refund button disabled.
- **MON-11 fixed (staging-db + local).** Root cause on top of the draft status (already fixed in 86201c6): `sp_overdue_sweep()`
  aborted on every past-due invoice — escalation level 0 broke `invoice_escalation_level_check`, and the day-1 body read
  `metadata->>'invoiceNumber'` (NULL for admin invoices, `notifications.body` is NOT NULL). Reproduced in a rolled-back
  transaction on staging. Migration `0053_overdue_sweep_fix.sql` (applied to staging with the runner, recorded in
  `manual_migrations`; NOT applied to production). Rolled-back run on staging after: 3 marked overdue, 1 late fee from the fee
  schedule, 4 reminders, 0 failed; second run adds nothing. Drafts: "Send invoice" on the invoice page (local browser: 201,
  banner gone, badge "sent"); `send` refuses non-drafts (409). Org console composer no longer offers "Save as draft".
- **MON-13 fixed in part (local).** Compose has "Part of the organisation" (whole org / league / season / division / team, each a
  dropdown of the org's own entities), audiences Players / Captains / Coaches / Referees / admins, channels Email and In-app
  together. Server checks the target is in the caller's org (foreign team → 404) and resolves recipients there (133 rows from
  17 sends, 0 recipients outside the org, 0 rows with another org id). Browser: division "Open" → 14 queued; player-web inbox
  (fresh context) shows it. **Not built:** schedule for later (no `scheduled_at` model), attachments, SMS (no provider), push
  (no subscribed devices), parents audience.
- **Wallet tab** shows "From INV-…" / "Applied to INV-…" (invoice number from the ledger API), not an id fragment (local browser).
