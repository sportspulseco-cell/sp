# Payment & Invoicing — testing guide

How to exercise the 6-tab Payment & Invoicing surface
([apps/superadmin-web/src/app/(admin)/payments](apps/superadmin-web/src/app/(admin)/payments))
end-to-end. Covers prerequisites, seeding, walkthroughs per tab, and
which surfaces are mocked for now (see
[deferred-integrations.md](./deferred-integrations.md)).

---

## 1. Prerequisites — apply the migrations

The new tables (`team_invoice_splits`, `refunds`, `wallet_accounts`,
`wallet_ledger`, `invoice_escalations`, `overdue_reminder_log`,
`quickbooks_sync_logs`, `pricing_tier_divisions`) ship in
**migrations 0017 + 0018**. They are committed but not auto-applied
per repo policy.

### Local dev

```bash
# From repo root
pnpm --filter @sportspulse/db migrate

# Or apply specific files
psql "$DATABASE_URL" -f packages/db/migrations/0017_payment_invoicing_extensions.sql
psql "$DATABASE_URL" -f packages/db/migrations/0018_registration_setup.sql
```

### Remote (Supabase)

```
mcp__supabase__apply_migration with name="0017_payment_invoicing_extensions"
mcp__supabase__apply_migration with name="0018_registration_setup"
```

The migrations are **additive + idempotent** — re-applying is safe.

### Verify

```sql
\d+ team_invoice_splits
\d+ refunds
\d+ wallet_accounts
\d+ wallet_ledger
\d+ invoice_escalations
\d+ overdue_reminder_log
\d+ quickbooks_sync_logs
\d+ pricing_tier_divisions
```

All eight tables should exist with FKs and CHECK constraints.

---

## 2. Get to the page

1. Sign in as a super-admin at `/sign-in`.
2. Sidebar → **Operations** → **Payment & invoicing** → opens
   `/payments?tab=ar`.

The header should show:
- **Payment & invoicing** title
- Org name (subtitle)
- Right side: a green QuickBooks pill — `// demo` badge if
  `quickbooks_sync_logs` is empty (default — see
  [deferred-integrations.md #4](./deferred-integrations.md))

If you see "No organisation in scope", create or select one via
**Organizations** in the sidebar first.

---

## 3. Seed minimum test data

You need at least **one invoice**, ideally with line items + payments.
Two paths:

### Path A — through the UI (recommended)

1. Sidebar → **Setup** → **Org setup** → walk the 4-step wizard
   (Organisation → League → Season → Divisions). Click **Publish league**.
2. Sidebar → **Compliance** → **Forms** → click into the new form,
   walk the **Registration setup** wizard. Add 1+ pricing tier in the
   Pricing section, assign all divisions in the Divisions section,
   publish a form version in Form builder.
3. Sidebar → **Compliance** → **Registrations** → either trigger a
   submission via the public funnel (`/registration/{seasonSlug}`) or
   create one manually via the API.
4. The registration creates an invoice; it now appears on the
   AR dashboard.

### Path B — direct SQL (faster for a single test cycle)

Replace `<orgId>` and `<personId>` with real UUIDs from your DB:

```sql
-- 1) Invoice
INSERT INTO invoices (
  org_id, invoice_number, recipient_person_id, currency,
  subtotal_cents, total_cents, paid_cents,
  status, issued_at, due_at
) VALUES (
  '<orgId>', 'INV-2025-08841', '<personId>', 'USD',
  485000, 436500, 100000,
  'partial', now(), now() + interval '24 days'
) RETURNING id;

-- 2) Line items (use the returned invoice id)
INSERT INTO invoice_items (invoice_id, kind, description, quantity, unit_amount_cents, amount_cents) VALUES
  ('<invoiceId>', 'registration_fee', 'Full season registration (AHL)', 1, 485000, 485000),
  ('<invoiceId>', 'discount', 'Discount code EARLYBIRD10 (10%)', 1, -48500, -48500),
  ('<invoiceId>', 'late_fee', 'Late fee (waived)', 1, 0, 0);

-- 3) Deposit payment
INSERT INTO payments (org_id, invoice_id, amount_cents, currency, method, status, received_at, notes)
VALUES ('<orgId>', '<invoiceId>', 100000, 'USD', 'credit_card', 'succeeded', now() - interval '5 days', 'Deposit paid');
```

Refresh `/payments` — the invoice should appear in **AR dashboard**
under "Recent invoices".

---

## 4. Walk each tab

### 4.1 AR dashboard (`?tab=ar`)

- 4 KPI tiles populated: Outstanding / Collected / Overdue / Drafts
- 5 aging buckets (Current / 1–30 / 31–60 / 61–90 / 90+) bucket the
  invoice by `due_at`
- Recent invoices list — click "Open" → switches to Player invoice tab

**Expected:** numbers match what you seeded.

### 4.2 Player invoice (`?tab=invoice&invoiceId=<id>`)

- Top card "Your invoice" with line items, totals, payment timeline
- Status pill matches `invoices.status` (Partial = blue/info, Paid =
  green, Overdue = red)
- "Pay next installment" card shows blue banner + **Pay now** button
  (disabled — Stripe Checkout integration is deferred, see
  [deferred #1](./deferred-integrations.md))
- Card-on-file line: shows real card if Stripe webhook persisted one,
  else "Visa ending 4242 · 09/27" with `// demo card` badge
- Upcoming installments: from `invoice.metadata.upcoming` if present,
  else synthesised 2-installment plan with `// demo upcoming` badge

**Test:** Verify that adding a real `invoice.metadata.cardOnFile`
makes the demo badge disappear:

```sql
UPDATE invoices SET metadata = '{"cardOnFile":{"brand":"Mastercard","last4":"7777","expMonth":11,"expYear":2028}}'::jsonb WHERE id = '<invoiceId>';
```

### 4.3 Dues split (`?tab=split&invoiceId=<id>&teamId=<id>`)

- Requires both `invoiceId` AND `teamId` on the URL
- "Team total · {teamName}" card with Collected / Outstanding rows
- "Player payment tracker" rows — one per `team_invoice_splits` row
- Row shape: avatar / name [Captain pill if applicable] / amount /
  progress / status pill / Remind button (only on non-paid)

**Seed splits:**

```sql
-- Equal-split a $58,200 invoice across 20 players (each gets $2,910)
-- Replace <invoiceId>, <teamId>, and use 20 real person UUIDs.
INSERT INTO team_invoice_splits (invoice_id, team_id, player_person_id, allocated_cents, collected_cents, status)
VALUES
  ('<invoiceId>', '<teamId>', '<personId1>', 291000, 291000, 'paid'),
  ('<invoiceId>', '<teamId>', '<personId2>', 291000, 145500, 'partial'),
  ('<invoiceId>', '<teamId>', '<personId3>', 291000, 0, 'pending'),
  ('<invoiceId>', '<teamId>', '<personId4>', 291000, 0, 'overdue');
-- ... etc up to 20
```

Or use the SDK directly:

```ts
await finance.createSplitsBatchEqual({
  invoiceId, teamId,
  playerPersonIds: ["<id1>", "<id2>", ...]
});
```

**Test:** click **Remind** on an unpaid row → check
`team_invoice_splits.last_reminder_at` updated. Click **Cover
outstanding** → demo alert appears (action is gated to demo mode
until the admin-funded coverage spec lands; see
[deferred #5](./deferred-integrations.md)).

### 4.4 Refund / credit (`?tab=refund&invoiceId=<id>`)

- Form fields: Refund type / amount / reason (≥10 chars)
- Submit:
  - `wallet_credit` → creates a `wallet_accounts` row if missing,
    bumps balance, appends `wallet_ledger` entry — all in one tx
  - `adjustment` → records the row at `status=succeeded` with no money
    movement
  - `full_original` / `partial_original` → records at
    `status=pending`; flips to `succeeded` once the (deferred) Stripe
    worker round-trips
- "Refund history" panel below shows past refunds

**Test:** issue a `wallet_credit` refund, then switch to Wallet tab —
the balance should reflect the new credit and the ledger has a row.

### 4.5 Wallet (`?tab=wallet&personId=<id>`)

- Blue gradient card on top with current balance + "Never expires"
  (or expiry date) on the right
- Below the gradient: ledger entries inline in the same card
- Bottom: **Issue wallet credit (admin)** form

**Test:** issue a credit (`amountCents=10000`, reason ≥10 chars) →
balance bumps + new `credit_issued` ledger entry appears at the top
of the list. Verify atomicity:

```sql
SELECT balance_cents, (SELECT SUM(amount_cents) FROM wallet_ledger WHERE wallet_id = w.id) AS ledger_sum
FROM wallet_accounts w WHERE person_id = '<personId>';
-- balance_cents should match ledger_sum
```

### 4.6 Overdue (`?tab=overdue`)

- Each row: red `!` icon (severe) or amber `!` icon (moderate) on the
  left, invoice details + reminder count, total $ + "incl. late fee"
  subtitle on the right
- Action buttons: Mark paid / Message / Extend / Suppress (or Mark
  paid / Waive flag for `lock_suspended=true` rows)
- QB sync footer shows recent events; `// demo` badge until Intuit
  OAuth ships ([deferred #4](./deferred-integrations.md))

**Seed an escalation:**

```sql
INSERT INTO invoice_escalations (
  invoice_id, level, reminders_sent, last_reminder_at, lock_suspended
) VALUES
  ('<invoiceId>', 2, 4, now() - interval '3 days', false);
```

Plus: bump `invoices.due_at` into the past so the row shows "X days
past due":

```sql
UPDATE invoices SET due_at = now() - interval '21 days', status = 'overdue', metadata = jsonb_set(metadata, '{lateFeeCents}', '2500') WHERE id = '<invoiceId>';
```

**Test actions:**
- **Mark paid** → stamps `last_action_kind = 'mark_paid'` on the
  escalation. Actual payment recording happens on the Player invoice
  tab — clicking the link below the actions should jump there.
- **Extend** → prompts for a date, patches `extended_due_at`
- **Waive flag** (visible only when `lock_suspended=true`) → sets
  `lock_suspended=false`, stamps `flag_waived_at` + `flag_waived_by_user_id`

---

## 5. Toggle the demo badges off

Once a worker from the deferred list ships, set:

```bash
NEXT_PUBLIC_PAYMENTS_DEMO=false
```

…and restart the dev server. The mock fallbacks disappear and the
surfaces show real (often empty) state honestly.

You can also toggle per-deployment in `vercel.json` if you want
production to be honest while staging keeps the demo on.

---

## 6. Common smoke checks

| What you expect | Where to verify |
|---|---|
| Migration applied cleanly | `\dt` should list 8 new tables; CHECK constraints visible via `\d+ <table>` |
| Refund balance integrity | `wallet_accounts.balance_cents = SUM(wallet_ledger.amount_cents)` for each wallet |
| Escalation row created on overdue | When invoice `due_at < now() AND status='overdue'`, an `invoice_escalations` row should exist (worker-managed, manually seed for now) |
| Audit interceptor records every mutation | `audit_log` table should have rows for refund issuance, wallet credit, splits create / patch, escalation patch |
| Status pills match data | Player invoice "Partial" = info (blue); "Paid" = success (green); "Overdue" = danger (red) |

---

## 7. What's mocked and why

See [deferred-integrations.md](./deferred-integrations.md) for the
full backlog. Quick summary:

| Feature | Mocked because | Removable when |
|---|---|---|
| Card on file display | Stripe webhook ingest worker not wired | Worker stamps `payments.metadata.card` |
| Upcoming installments | Registration-v2 worker not wired | Worker materialises `installment_schedules` + denormalises onto `invoice.metadata.upcoming` |
| QuickBooks sync indicator | Intuit OAuth not done | First successful QB push lands a `quickbooks_sync_logs` row |
| Pay now button | Stripe Checkout flow not wired | Stripe Connect onboarding + Checkout session creator |
| Cover outstanding | Admin-funded coverage spec not signed | Spec sign-off |
| Reminder dispatch (email/SMS) | Notifications worker not wired | Worker reads `invoice_escalations.next_reminder_at` and sends |

Each mocked surface in the UI carries a small `// demo` pill (top
right of the value) so reviewers can tell at a glance.
