-- 0029_finance_cron_extras.sql
-- Payments & Invoicing — Phase 11 + 13 schedulers.
-- Installment auto-charge (daily) + wallet credit expiry (nightly).

BEGIN;

-- ----------------------------------------------------------------
-- 1. Installment auto-charge (daily 06:00 UTC)
-- ----------------------------------------------------------------
-- For every scheduled installment whose due_date has passed and
-- whose parent invoice is not paid/void, charge it. Mock outcome:
-- always succeeds (real Stripe replaces this later). Each charge
-- writes a payments row + advances invoice paid_cents.
-- ----------------------------------------------------------------

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

-- ----------------------------------------------------------------
-- 2. Wallet credit expiry (nightly 02:00 UTC)
-- ----------------------------------------------------------------
-- For every wallet_transactions row of type='credit_issued' that's
-- past its expires_at AND has no matching 'expired' row, debit the
-- wallet (clamped at zero) and insert the expiry row. Idempotent
-- via metadata.source_transaction_id match in the NOT EXISTS check.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sp_wallet_expire_credits()
RETURNS TABLE(expired int, debited_cents int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $func$
DECLARE
  v_expired int := 0;
  v_debited int := 0;
  v_row RECORD;
  v_debit_amount int;
BEGIN
  FOR v_row IN
    SELECT wt.id AS source_id, wt.wallet_id, wt.amount_cents, wt.expires_at,
           wa.balance_cents
    FROM wallet_transactions wt
    JOIN wallet_accounts wa ON wa.id = wt.wallet_id
    WHERE wt.type = 'credit_issued'
      AND wt.expires_at IS NOT NULL
      AND wt.expires_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM wallet_transactions wt2
        WHERE wt2.wallet_id = wt.wallet_id
          AND wt2.type = 'expired'
          AND wt2.metadata->>'source_transaction_id' = wt.id::text
      )
  LOOP
    v_debit_amount := LEAST(v_row.balance_cents, v_row.amount_cents);
    IF v_debit_amount > 0 THEN
      UPDATE wallet_accounts
      SET balance_cents = balance_cents - v_debit_amount,
          updated_at = now()
      WHERE id = v_row.wallet_id;
    END IF;
    INSERT INTO wallet_transactions
      (wallet_id, type, amount_cents, reason, metadata)
    VALUES (
      v_row.wallet_id,
      'expired',
      v_debit_amount,
      CASE
        WHEN v_debit_amount < v_row.amount_cents THEN 'Credit expired (partial)'
        ELSE 'Credit expired'
      END,
      jsonb_build_object('source_transaction_id', v_row.source_id::text)
    );
    v_expired := v_expired + 1;
    v_debited := v_debited + v_debit_amount;
  END LOOP;
  RETURN QUERY SELECT v_expired, v_debited;
END $func$;

-- ----------------------------------------------------------------
-- Schedules
-- ----------------------------------------------------------------
SELECT cron.schedule(
  'sp-installment-auto-charge',
  '0 6 * * *',
  $cron$ SELECT public.sp_installment_auto_charge(); $cron$
);

SELECT cron.schedule(
  'sp-wallet-expire-credits',
  '0 2 * * *',
  $cron$ SELECT public.sp_wallet_expire_credits(); $cron$
);

COMMIT;
