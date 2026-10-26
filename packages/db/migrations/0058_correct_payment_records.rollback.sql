-- 0058_correct_payment_records.rollback.sql
-- Puts back what 0058 changed: the reversed installment charges count as
-- paid again, their notices return to the queue, the correction's
-- final-notice rows and the backfilled registration card payments are
-- removed, and the touched invoices and plan rows are recomputed.

BEGIN;

UPDATE payments
   SET status = 'succeeded',
       metadata = metadata - 'reversedBy' - 'reversedAt'
 WHERE metadata->>'reversedBy' = 'MON-27';

UPDATE notifications
   SET status = 'queued', last_error = NULL, updated_at = now()
 WHERE last_error = 'Withdrawn (MON-27): the charge it reports was reversed.';

DELETE FROM notifications WHERE source_event = 'correction.mon27';

DELETE FROM payments WHERE metadata->>'backfill' = 'MON-26';

WITH touched AS (
  SELECT DISTINCT ins.invoice_id FROM installment_schedules ins WHERE ins.metadata->>'correctedBy' = 'MON-27'
), amounts AS (
  SELECT t.invoice_id,
         COALESCE((SELECT SUM(p.amount_cents) FROM payments p
                    WHERE p.invoice_id = t.invoice_id AND p.status = 'succeeded'), 0) AS paid_cents
    FROM touched t
)
UPDATE invoices i
   SET paid_cents = a.paid_cents,
       status = CASE
         WHEN i.status = 'void' THEN 'void'
         WHEN a.paid_cents >= i.total_cents AND i.total_cents > 0 THEN 'paid'
         WHEN a.paid_cents > 0 THEN 'partial'
         WHEN i.due_at IS NOT NULL AND i.due_at < now() THEN 'overdue'
         ELSE 'sent'
       END,
       updated_at = now()
  FROM amounts a
 WHERE i.id = a.invoice_id;

UPDATE installment_schedules ins
   SET status = 'succeeded', metadata = ins.metadata - 'correctedBy', updated_at = now()
 WHERE ins.metadata->>'correctedBy' = 'MON-27'
   AND EXISTS (SELECT 1 FROM payments p WHERE p.external_provider_id = 'mock_inst_' || ins.id::text AND p.status = 'succeeded');

UPDATE installment_schedules
   SET metadata = metadata - 'correctedBy'
 WHERE metadata->>'correctedBy' = 'MON-27';

COMMIT;
