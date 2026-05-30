# Avario Invoicing — team-side billing

URL: `/Invoicing/Invoicing.aspx`. Page title: "Invoices".

Where **the league bills teams** for their schedule usage. Opposite
side of the ledger from Payment (which is league-paid-facility).

## Left-nav

### Create Invoices
- **Quickbooks** — push invoices into QuickBooks (accounting software)
- **Email** — email PDF invoices directly to team managers
- **Manual** — create one-off invoices outside the auto-generation

### Maintain Invoices
- **Invoices** (current view) — list / filter all invoices
- **Payments** — team-side payments received

## Filters

- Date Range
- Team(s)
- **Status** — `Open` (default) · `Paid` · `Voided`
- Invoice #
- **Sent To Contact** — Yes/No (has the team manager received it)
- **Sent To Finance** — Yes/No (has finance/AR received it)
- Excel export

## Grid columns

`Invoice # · Team · Status · Due Date · Hours · SubTotal · Taxes ·
Total · Payments · Balance`

Empty for this season ("No Invoices To Display").

## Key observations

- **Three invoice-creation channels**: QuickBooks API push, direct
  email, manual override. Each can produce an invoice; the lifecycle
  is unified.
- **Hours** is a first-class invoice field (not derived) — invoices
  bill for ice-time consumed.
- **Taxes** is tracked separately from SubTotal — multi-jurisdiction
  ready.
- **Sent To Contact** + **Sent To Finance** are distinct flags. A
  league's billing department and the team manager are different
  audiences; the same invoice can have two send statuses.

## SportsPulse equivalence

SportsPulse already has an `invoices` table (used for registration
billing). For league-usage billing we extend rather than duplicate:

- Add `invoice_type` enum: `registration` (existing) /
  `season_usage` (new — Avario equivalent)
- Add `hours_total` numeric — ice-time consumed
- Add `tax_cents`, `tax_jurisdiction` columns
- Add `sent_to_contact_at`, `sent_to_finance_at` timestamps
- Adapter: `IntegrationsAdapter.publishToQuickbooks(invoice)` (similar
  to schedule publish path)
- Auto-generation: scheduled monthly job that walks each team's
  events for the period, computes hours × team's hourly rate, drafts
  an invoice (Open status), optionally auto-sends if season config
  says so
