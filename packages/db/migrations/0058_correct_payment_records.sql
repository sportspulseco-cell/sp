-- 0058_correct_payment_records.sql
-- Data corrections for two payment bugs fixed in code (26 Oct 2026).
--
-- MON-27: until 0057 the daily installment job charged every scheduled
-- installment that fell due, on any invoice, and recorded a credit_card
-- payment that never happened (no card, no consent). Production: 8 such
-- payments on 3 team dues invoices from May (orgs "PPHL" and "18 May 2026
-- Test"); their "installment paid" notices were never sent. Staging: 44.
--   1. Each such payment is marked failed with the reason (kept as history,
--      not deleted).
--   2. Its unsent "installment paid" notice is withdrawn.
--   3. Each invoice touched is recomputed from its real payments (less
--      refunds that reduced the invoice), the same rule as the finance
--      repository, and its plan rows follow the money: rows the real
--      payments cover are paid, the rest are due again.
--   4. Restoring these balances must not by itself send collection email
--      about old invoices. For exactly these invoices, if they are past due,
--      the overdue sweep's final-notice rows are recorded as not sent, with
--      the reason, so the sweep skips them. They stay overdue in Finance for
--      an admin to remind or void.
--
-- MON-26: until fb9ad45 a registration paid by card was marked paid with no
-- payment row, so it could not be refunded to the card. Registration
-- invoices paid an amount above zero by the mock card get the card payment
-- they should have had. Production has none (its one such invoice is a $0
-- registration, correctly without a payment).
--
-- Idempotent: every step selects only rows not yet corrected. Rollback in
-- 0058_correct_payment_records.rollback.sql.

BEGIN;

-- 1. Charges made without consent -> failed, with the reason.
UPDATE payments p
   SET status = 'failed',
       notes = COALESCE(p.notes || ' ', '') ||
         '[Reversed 26 Oct 2026 (MON-27): recorded by the installment job without the payer''s consent; no money moved.]',
       metadata = COALESCE(p.metadata, '{}'::jsonb) ||
         jsonb_build_object('reversedBy', 'MON-27', 'reversedAt', now()::text)
  FROM installment_schedules ins
 WHERE p.external_provider_id = 'mock_inst_' || ins.id::text
   AND p.status = 'succeeded'
   AND NOT COALESCE((ins.metadata->>'autoCharge')::boolean, false);

-- 2. Their unsent "installment paid" notices are withdrawn.
UPDATE notifications n
   SET status = 'failed',
       last_error = 'Withdrawn (MON-27): the charge it reports was reversed.',
       updated_at = now()
  FROM installment_schedules ins
  JOIN payments p ON p.external_provider_id = 'mock_inst_' || ins.id::text
 WHERE n.idempotency_key = 'installment-paid-' || ins.id::text
   AND n.status = 'queued'
   AND p.metadata->>'reversedBy' = 'MON-27';

-- 3a. Invoices touched: paid amount and status from their real payments.
WITH touched AS (
  SELECT DISTINCT p.invoice_id FROM payments p WHERE p.metadata->>'reversedBy' = 'MON-27'
), amounts AS (
  SELECT t.invoice_id,
         GREATEST(0,
           COALESCE((SELECT SUM(p.amount_cents) FROM payments p
                      WHERE p.invoice_id = t.invoice_id AND p.status = 'succeeded'), 0)
         - COALESCE((SELECT SUM(r.amount_cents) FROM refunds r
                      WHERE r.invoice_id = t.invoice_id
                        AND r.status IN ('succeeded', 'pending')
                        AND COALESCE((r.metadata->>'invoiceAdjusted')::boolean, false)), 0)
         ) AS paid_cents
    FROM touched t
)
UPDATE invoices i
   SET paid_cents = a.paid_cents,
       status = CASE
         WHEN i.status = 'void' THEN 'void'
         WHEN a.paid_cents >= i.total_cents AND i.total_cents > 0 THEN 'paid'
         WHEN a.paid_cents > 0 THEN 'partial'
         WHEN i.due_at IS NOT NULL AND i.due_at < now() THEN 'overdue'
         WHEN i.issued_at IS NOT NULL THEN 'sent'
         ELSE i.status
       END,
       paid_at = CASE WHEN a.paid_cents >= i.total_cents AND i.total_cents > 0 THEN i.paid_at ELSE NULL END,
       updated_at = now()
  FROM amounts a
 WHERE i.id = a.invoice_id
   AND (i.paid_cents IS DISTINCT FROM a.paid_cents);

-- 3b. Their plan rows follow the money, earliest first.
WITH touched AS (
  SELECT DISTINCT p.invoice_id FROM payments p WHERE p.metadata->>'reversedBy' = 'MON-27'
), plan AS (
  SELECT ins.id, ins.status,
         SUM(ins.amount_cents) OVER (PARTITION BY ins.invoice_id ORDER BY ins.installment_number) AS upto,
         i.paid_cents
    FROM installment_schedules ins
    JOIN touched t ON t.invoice_id = ins.invoice_id
    JOIN invoices i ON i.id = ins.invoice_id
   WHERE ins.status <> 'cancelled'
)
UPDATE installment_schedules s
   SET status = CASE WHEN plan.upto <= plan.paid_cents THEN 'succeeded' ELSE 'scheduled' END,
       paid_at = CASE WHEN plan.upto <= plan.paid_cents THEN s.paid_at ELSE NULL END,
       charged_at = CASE WHEN plan.upto <= plan.paid_cents THEN s.charged_at ELSE NULL END,
       metadata = s.metadata || jsonb_build_object('correctedBy', 'MON-27'),
       updated_at = now()
  FROM plan
 WHERE s.id = plan.id
   AND s.status IS DISTINCT FROM (CASE WHEN plan.upto <= plan.paid_cents THEN 'succeeded' ELSE 'scheduled' END);

-- 4. No automatic final notice caused by this correction.
INSERT INTO notifications
  (org_id, idempotency_key, template_code, channel, subject, body,
   recipient_person_id, recipient_email, payload, source_event, status, last_error)
SELECT i.org_id,
       'overdue-' || i.id::text || '-stage4-' || ch.channel,
       'INVOICE_OVERDUE_STAGE_4',
       ch.channel,
       'Final notice: invoice ' || i.invoice_number || ' is 21 days past due',
       'Not sent: the balance was restored by a data correction (MON-27) on 26 Oct 2026; an admin decides whether to remind or void.',
       i.recipient_person_id,
       i.recipient_email,
       jsonb_build_object('invoiceId', i.id, 'invoiceNumber', i.invoice_number, 'correction', 'MON-27'),
       'correction.mon27',
       'failed',
       'Not sent: balance restored by correction MON-27; admin to decide.'
  FROM invoices i
 CROSS JOIN (VALUES ('email'), ('in_app')) AS ch(channel)
 WHERE i.id IN (SELECT DISTINCT p.invoice_id FROM payments p WHERE p.metadata->>'reversedBy' = 'MON-27')
   AND i.status IN ('sent', 'partial', 'overdue')
   AND i.due_at IS NOT NULL AND i.due_at < now() - interval '21 days'
ON CONFLICT (idempotency_key) DO NOTHING;

-- 5. MON-26: card-paid registration invoices get their card payment.
INSERT INTO payments
  (org_id, invoice_id, amount_cents, currency, method, status, received_at,
   external_provider_id, notes, metadata)
SELECT i.org_id, i.id, i.paid_cents, i.currency, 'credit_card', 'succeeded',
       COALESCE(i.paid_at, i.issued_at, i.created_at),
       'mock_backfill_' || i.id::text,
       'Card payment recorded on 26 Oct 2026 (MON-26): the registration was paid by card but no payment row was written.',
       jsonb_build_object('source', 'card', 'backfill', 'MON-26', 'registrationId', i.registration_id)
  FROM invoices i
 WHERE i.registration_id IS NOT NULL
   AND i.status = 'paid'
   AND i.paid_cents > 0
   AND i.metadata ? 'mockStripe'
   AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = i.id);

COMMIT;
