-- 0057_installment_autocharge_consent.sql
-- MON-27: the daily installment job (sp_installment_auto_charge, 06:00 UTC)
-- charged every scheduled installment that fell due, on any invoice. Team
-- dues shares and admin invoices with a plan are written as scheduled
-- installments, deposit due the same day, for the player to pay. Nobody
-- entered a card or agreed to automatic charges, yet the job recorded a
-- credit_card payment and marked them paid the next morning. Production,
-- 26 Oct: 8 installments on team dues shares charged this way (3 deposits,
-- 5 installments); staging: 44.
--
-- Now the job charges only installments whose payer chose a payment plan
-- at checkout with a card: rows with metadata.autoCharge = true (written
-- by the registration pay step). Every other installment is a due date the
-- payer pays themselves from their Payments page.
--
-- Two more fixes in the same function:
--   * it never charges more than the invoice still owes (the payer may
--     have paid part of it by hand); an installment already covered is
--     marked succeeded with nothing charged;
--   * the invoice is read and updated per row. Before, two installments of
--     one invoice due in the same run both started from the same paid
--     amount, so the second overwrote the first.
-- The paid notice carries a subject and the payer's sign-in email when the
-- invoice has none.
--
-- Defined in full; idempotent (CREATE OR REPLACE). Rollback restores the
-- 0029 definition.

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
  v_amount int;
  v_new_status text;
BEGIN
  FOR v_row IN
    SELECT ins.id AS ins_id,
           ins.invoice_id,
           ins.installment_number,
           ins.amount_cents,
           inv.org_id,
           inv.currency,
           inv.invoice_number,
           inv.recipient_person_id,
           COALESCE(inv.recipient_email, pr.email) AS recipient_email
    FROM installment_schedules ins
    JOIN invoices inv ON inv.id = ins.invoice_id
    LEFT JOIN persons pe ON pe.id = inv.recipient_person_id
    LEFT JOIN profiles pr ON pr.id = pe.user_id
    WHERE ins.due_date <= now()
      AND ins.status = 'scheduled'
      AND inv.status IN ('sent','partial','overdue')
      AND COALESCE((ins.metadata->>'autoCharge')::boolean, false)
    ORDER BY ins.invoice_id, ins.installment_number
  LOOP
    -- What the invoice still owes, read now (an earlier row of this run
    -- may have paid part of it), capped at this installment.
    SELECT GREATEST(0, LEAST(v_row.amount_cents, inv.total_cents - inv.paid_cents))
      INTO v_amount
      FROM invoices inv
     WHERE inv.id = v_row.invoice_id
       FOR UPDATE;

    IF v_amount > 0 THEN
      INSERT INTO payments
        (org_id, invoice_id, amount_cents, currency, method, status,
         received_at, external_provider_id, notes)
      VALUES (
        v_row.org_id, v_row.invoice_id, v_amount, v_row.currency,
        'credit_card', 'succeeded', now(),
        'mock_inst_' || v_row.ins_id::text,
        'Installment ' || v_row.installment_number || ' auto-charged'
      );

      UPDATE invoices
         SET paid_cents = paid_cents + v_amount,
             status = CASE WHEN paid_cents + v_amount >= total_cents THEN 'paid' ELSE 'partial' END,
             paid_at = CASE WHEN paid_cents + v_amount >= total_cents THEN now() ELSE paid_at END,
             updated_at = now()
       WHERE id = v_row.invoice_id
      RETURNING status INTO v_new_status;

      IF v_row.recipient_email IS NOT NULL THEN
        INSERT INTO notifications
          (org_id, idempotency_key, template_code, channel, subject, body,
           recipient_person_id, recipient_email, payload, source_event, status)
        VALUES (
          v_row.org_id,
          'installment-paid-' || v_row.ins_id::text,
          'payment.confirmed',
          'email',
          'Installment paid: ' || v_row.invoice_number,
          'Installment ' || v_row.installment_number || ' of your payment plan for invoice '
            || v_row.invoice_number || ' was charged to your card.',
          v_row.recipient_person_id,
          v_row.recipient_email,
          jsonb_build_object(
            'invoiceId', v_row.invoice_id,
            'invoiceNumber', v_row.invoice_number,
            'installmentNumber', v_row.installment_number,
            'amountCents', v_amount
          ),
          'cron.installment_auto_charge',
          'queued'
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
      END IF;

      v_charged := v_charged + 1;
      IF v_new_status = 'paid' THEN
        v_marked_paid := v_marked_paid + 1;
      END IF;
    END IF;

    UPDATE installment_schedules
       SET status = 'succeeded',
           paid_at = now(),
           charged_at = CASE WHEN v_amount > 0 THEN now() ELSE charged_at END,
           metadata = metadata || jsonb_build_object('chargedCents', v_amount),
           updated_at = now()
     WHERE id = v_row.ins_id;
  END LOOP;

  RETURN QUERY SELECT v_charged, v_marked_paid;
END $func$;

COMMIT;
