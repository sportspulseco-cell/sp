-- 0057_installment_autocharge_consent.rollback.sql
-- Restores sp_installment_auto_charge as defined in 0029 (charges every
-- due scheduled installment, whatever the payer agreed to).

BEGIN;

CREATE OR REPLACE FUNCTION public.sp_installment_auto_charge()
RETURNS TABLE(charged int, marked_paid int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $func$
DECLARE
  v_charged int := 0;
  v_marked_paid int := 0;
  v_row RECORD;
  v_new_paid int;
  v_new_status text;
BEGIN
  FOR v_row IN
    SELECT ins.id AS ins_id,
           ins.invoice_id,
           ins.installment_number,
           ins.amount_cents,
           inv.org_id,
           inv.currency,
           inv.total_cents,
           inv.paid_cents,
           inv.recipient_person_id,
           inv.recipient_email
    FROM installment_schedules ins
    JOIN invoices inv ON inv.id = ins.invoice_id
    WHERE ins.due_date <= now()
      AND ins.status = 'scheduled'
      AND inv.status IN ('sent','partial','overdue')
  LOOP
    -- Record the payment
    INSERT INTO payments
      (org_id, invoice_id, amount_cents, currency, method, status,
       received_at, external_provider_id, notes)
    VALUES (
      v_row.org_id, v_row.invoice_id, v_row.amount_cents, v_row.currency,
      'credit_card', 'succeeded', now(),
      'mock_inst_' || v_row.ins_id::text,
      'Installment ' || v_row.installment_number || ' auto-charged'
    );

    -- Advance invoice
    v_new_paid := v_row.paid_cents + v_row.amount_cents;
    v_new_status := CASE
      WHEN v_new_paid >= v_row.total_cents THEN 'paid'
      ELSE 'partial'
    END;
    UPDATE invoices
    SET paid_cents = v_new_paid,
        status = v_new_status,
        paid_at = CASE WHEN v_new_status = 'paid' THEN now() ELSE paid_at END,
        updated_at = now()
    WHERE id = v_row.invoice_id;

    -- Mark installment succeeded
    UPDATE installment_schedules
    SET status = 'succeeded',
        paid_at = now(),
        charged_at = now(),
        updated_at = now()
    WHERE id = v_row.ins_id;

    -- Notification (idempotent per installment)
    INSERT INTO notifications
      (org_id, idempotency_key, template_code, channel, body,
       recipient_person_id, recipient_email, payload, source_event, status)
    VALUES (
      v_row.org_id,
      'installment-paid-' || v_row.ins_id::text,
      'payment.confirmed',
      'email',
      'Installment ' || v_row.installment_number || ' auto-charged successfully.',
      v_row.recipient_person_id,
      v_row.recipient_email,
      jsonb_build_object(
        'invoiceId', v_row.invoice_id,
        'installmentNumber', v_row.installment_number,
        'amountCents', v_row.amount_cents
      ),
      'cron.installment_auto_charge',
      'queued'
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    v_charged := v_charged + 1;
    IF v_new_status = 'paid' THEN
      v_marked_paid := v_marked_paid + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_charged, v_marked_paid;
END $func$;

COMMIT;
