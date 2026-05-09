# Deferred integrations — Payment & Invoicing + Registration setup

Tracker for surfaces in the Payment & Invoicing tabs (`/payments`)
and the Registration setup wizard (`/forms/[id]`) where the UI is
**fully built** but real-time data depends on external integrations
or backend workers that ship as separate tickets.

For demo purposes (so stakeholders can walk the flow), the UI falls
back to **mock data** with a visible `// demo` pill. Toggle via the
`NEXT_PUBLIC_PAYMENTS_DEMO` env var (default: `true`). Set to `false`
in production until the corresponding worker is wired.

Each entry below states:
- **Surface** — file or component the user sees
- **Today** — what data the UI reads (real path)
- **Mock** — what we render when real data is empty + `DEMO_MODE`
- **Needed** — the work to make it real
- **Owner** — which worker / external service ships it
- **ETA gate** — what unlocks the work

---

## 1. Card-on-file display (Player invoice tab)

- **Surface:** `apps/superadmin-web/src/app/(admin)/payments/tabs/player-invoice-tab.tsx` — "Pay next installment" block
- **Today:** Reads `payment.metadata.card.{brand,last4,expMonth,expYear}` from the most recent successful payment, falling back to `invoice.metadata.cardOnFile`.
- **Mock:** `Visa ending 4242 · Expires 09/27` (matches the mockup).
- **Needed:** Stripe webhook handler that, on `payment_intent.succeeded`, persists the card payload into `payments.metadata.card` and mirrors `cardOnFile` onto `invoices.metadata` for fast read.
- **Owner:** Stripe webhook ingest worker (Vercel cron / queue handler).
- **ETA gate:** Stripe Connect onboarding + webhook secret per org.

## 2. Upcoming installments timeline (Player invoice tab)

- **Surface:** Player invoice tab → "Payment timeline" list
- **Today:** Reads `invoice.metadata.upcoming: Array<{ label, dueAt, amountCents, status }>`. Source of truth is `installment_schedules` (registration-v2.ts:125).
- **Mock:** Two installments split from `(totalCents - paidCents)` over 30-day intervals.
- **Needed:** A worker that, on registration submit, materialises the player's chosen payment plan into both `installment_schedules` rows AND a denormalised `invoice.metadata.upcoming` array so the UI doesn't need to join through invoice → installments.
- **Owner:** Registration-v2 worker.
- **ETA gate:** Pricing tier with `paymentPlanEnabled = true` selected at checkout.

## 3. Reminder dispatch (Overdue + Dues split)

- **Surface:** `payments/tabs/overdue-tab.tsx` (escalation queue) + `payments/tabs/dues-split-client.tsx` (per-player Remind buttons)
- **Today:** Clicking Remind only stamps `last_reminder_at` (split) or appends to `overdue_reminder_log` (escalation). The actual email/SMS send is decoupled.
- **Mock:** No mock — the timestamp updates honestly.
- **Needed:** A notifications worker that:
  1. Polls `invoice_escalations` where `nextReminderAt <= now()` and `lockSuspended = false`
  2. Renders the active `email_templates` row for the season + event type
  3. Sends via Postmark / Resend / SES, logs success/failure to `overdue_reminder_log`, bumps `remindersSent` on success, and reschedules `nextReminderAt` based on level (1 → +7d, 2 → +3d, 3 → +1d)
- **Owner:** Notifications worker (background job).
- **ETA gate:** Email/SMS provider account + per-org sending domain verification.

## 4. QuickBooks sync indicator + recent events (Overdue + Header)

- **Surface:** `payments-header.tsx` (status pill) + `payments/tabs/overdue-tab.tsx` (Recent sync events list)
- **Today:** Reads `quickbooks_sync_logs` via `finance.qbSyncStatus(orgId)`. Shows "Not connected" when zero rows.
- **Mock:** "Connected · Syncing — 2 min ago" + 3 recent events (payment created, invoice updated, credit memo created) matching the mockup.
- **Needed:**
  1. Intuit OAuth2 onboarding (per-org tokens stored encrypted)
  2. Webhook ingest for QBO events (push side)
  3. Pull-side worker that, on every payment / invoice / refund mutation, enqueues a sync row + posts to QBO and stamps the `qbId` back
- **Owner:** Brand-new QuickBooks integration module (`apps/superadmin-api/src/modules/quickbooks/`).
- **ETA gate:** Intuit developer app + per-org consent flow.

## 5. Cover outstanding (Dues split)

- **Surface:** `payments/tabs/dues-split-client.tsx` — "Cover outstanding" button
- **Today:** Disabled with a tooltip.
- **Mock:** Demo-mode flow shows a confirmation dialog and emits a console message ("would cover $X across N players").
- **Needed:** A spec for admin-funded coverage:
  - Where does the money come from (org Stripe account vs ad-hoc)?
  - What ledger entry records it (a payment row with `method=admin_coverage`)?
  - How does it interact with refund flow if the player later pays back?
- **Owner:** Product spec required before engineering.
- **ETA gate:** Spec sign-off.

## 6. PDF / media-release upload (Form builder section)

- **Surface:** `forms/[id]/sections/form-builder-client.tsx` + the existing `<FormBuilder>`
- **Today:** Toggles persist on `seasons.config.requireLiabilityWaiver` etc. — real "upload signed PDF" not wired.
- **Mock:** None (stays honest).
- **Needed:** Supabase Storage bucket (`compliance-uploads/`) + signed-URL endpoint + a small `<FileUpload>` UI primitive. Player-side waiver signing flow.
- **Owner:** Compliance module follow-up.
- **ETA gate:** Storage bucket created + RLS policy.

## 7. Email-template attachment upload (Email templates section)

- **Surface:** `email-templates-tab.tsx` rows have an "Attach PDF" picker.
- **Today:** Stores a path string on `email_templates.attachmentPath` but no upload endpoint backs it.
- **Mock:** None.
- **Needed:** Same Storage wiring as #6.
- **Owner:** Same.
- **ETA gate:** Same.

## 8. Per-tier email templates (Registration setup → Email templates)

- **Surface:** Email templates section
- **Today:** Templates are keyed `(seasonId, eventType, registrationTypeFilter)` — no per-tier override.
- **Mock:** None — UI honestly only exposes per-event-type rows.
- **Needed:** Mockup ⑦ shows tabs for "On payment / On approved / On rejected / Payment reminder". Already supported. Per-tier override would need a `pricingTierId` column on `email_templates` — not in mockup, deferred.
- **Owner:** Future spec.

## 9. Real-time KPI refresh (AR dashboard)

- **Surface:** `payments/tabs/ar-dashboard-tab.tsx`
- **Today:** Server-rendered on each request (`force-dynamic`). Refresh on navigation.
- **Mock:** None.
- **Needed:** Optional websocket / SSE channel for live updates. Not blocking.
- **Owner:** Future polish.

## 10. Player-side payment surface (`/player`)

- **Surface:** `apps/player-web/src/app/(app)/payments/page.tsx`
- **Today:** Player's view of invoices is on `/payments` in the player app — separate from the admin Payment & Invoicing tabs. Stripe Checkout / portal redirect not wired.
- **Mock:** Separate tracker — see this app's own `// TODO` in the Pay-now block.
- **Needed:** Stripe Checkout session creation + customer portal redirect.
- **Owner:** Player-web payments feature.
- **ETA gate:** Same as #1.

---

## Removing the demo badge

Each mocked surface renders a small `// demo` pill via the
`<DemoBadge>` helper in
`apps/superadmin-web/src/app/(admin)/payments/lib/mock-data.ts`. To
disable mocks for a real environment, set:

```bash
NEXT_PUBLIC_PAYMENTS_DEMO=false
```

The component fallbacks then show the real (often empty) state and
`<DemoBadge>` returns null.

When a worker from the table above ships, delete the corresponding
`mock*` function and remove its call site in the relevant tab. The
badge disappears automatically once real data flows.
