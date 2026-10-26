-- 0060_invoice_late_fee.rollback.sql (never auto-applied)
-- Restores the 0053 definition of sp_overdue_sweep() (late fee from the
-- fee schedule only) and drops invoices.late_fee_cents. Late fees the
-- 0060 sweep already added stay on their invoices.

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_late_fee_cents_check;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS late_fee_cents;

DROP FUNCTION IF EXISTS public.sp_overdue_sweep();

CREATE FUNCTION public.sp_overdue_sweep()
RETURNS TABLE(
  invoices_marked_overdue int,
  late_fees_applied int,
  reminders_sent int,
  invoices_failed int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $func$
-- The RETURNS TABLE names (reminders_sent, ...) are also column names.
#variable_conflict use_column
DECLARE
  v_marked int := 0;
  v_lates int := 0;
  v_reminders int := 0;
  v_failed int := 0;
  v_inv RECORD;
  v_days_past int;
  v_stage int;
  v_channels text[];
  v_chan text;
  v_esc_id uuid;
  v_inserted int;
  v_number text;
  v_fee int;
  -- per-invoice counts, added to the totals only if the invoice succeeds
  i_marked int;
  i_late int;
  i_reminders int;
BEGIN
  FOR v_inv IN
    SELECT i.id, i.org_id, i.invoice_number, i.recipient_person_id,
           i.recipient_email, i.due_at, i.status, i.metadata,
           COALESCE(fs.late_fee_cents, 0) AS schedule_late_fee_cents
    FROM invoices i
    LEFT JOIN fee_schedules fs ON fs.id = i.fee_schedule_id
    WHERE i.due_at IS NOT NULL
      AND i.due_at < now()
      AND i.status IN ('sent','partial','overdue')
      AND i.paid_cents < i.total_cents
    ORDER BY i.due_at
  LOOP
    i_marked := 0;
    i_late := 0;
    i_reminders := 0;
    BEGIN
      v_days_past := GREATEST(EXTRACT(DAY FROM now() - v_inv.due_at)::int, 0);
      v_number := COALESCE(
        NULLIF(v_inv.invoice_number, ''),
        v_inv.metadata->>'invoiceNumber',
        'your invoice'
      );

      IF v_inv.status IN ('sent','partial') THEN
        UPDATE invoices SET status = 'overdue', updated_at = now()
          WHERE id = v_inv.id;
        i_marked := 1;
      END IF;

      INSERT INTO invoice_escalations (invoice_id, level, reminders_sent)
      VALUES (v_inv.id, LEAST(GREATEST(v_days_past / 7, 1), 3), 0)
      ON CONFLICT (invoice_id) DO UPDATE
        SET level = GREATEST(invoice_escalations.level, EXCLUDED.level),
            updated_at = now()
      RETURNING id INTO v_esc_id;

      v_fee := v_inv.schedule_late_fee_cents;
      IF v_fee > 0 AND (v_inv.metadata->>'lateFeeAppliedAt') IS NULL THEN
        INSERT INTO invoice_items (invoice_id, kind, description,
                                   quantity, unit_amount_cents, amount_cents)
        VALUES (v_inv.id, 'late_fee', 'Late fee (overdue)', 1, v_fee, v_fee);
        UPDATE invoices SET
          total_cents = total_cents + v_fee,
          late_fee_applied_cents = late_fee_applied_cents + v_fee,
          metadata = metadata || jsonb_build_object(
            'lateFeeAppliedAt', now()::text,
            'lateFeeAppliedCents', v_fee
          ),
          updated_at = now()
        WHERE id = v_inv.id;
        i_late := 1;
      END IF;

      v_stage := CASE
        WHEN v_days_past >= 21 THEN 4
        WHEN v_days_past >= 14 THEN 3
        WHEN v_days_past >= 7  THEN 2
        WHEN v_days_past >= 1  THEN 1
        ELSE 0
      END;

      IF v_stage > 0 THEN
        v_channels := CASE v_stage
          WHEN 1 THEN ARRAY['email']
          WHEN 2 THEN ARRAY['email']
          ELSE        ARRAY['email','in_app']
        END;

        FOREACH v_chan IN ARRAY v_channels
        LOOP
          INSERT INTO notifications
            (org_id, idempotency_key, template_code, channel, subject, body,
             recipient_person_id, recipient_email, payload, source_event, status)
          VALUES (
            v_inv.org_id,
            'overdue-' || v_inv.id::text || '-stage' || v_stage || '-' || v_chan,
            'INVOICE_OVERDUE_STAGE_' || v_stage,
            v_chan,
            CASE v_stage
              WHEN 1 THEN 'Invoice ' || v_number || ' is past due'
              WHEN 2 THEN 'Invoice ' || v_number || ' is 7 days past due'
              WHEN 3 THEN 'Invoice ' || v_number || ' is 14 days past due'
              ELSE        'Final notice: invoice ' || v_number || ' is 21 days past due'
            END,
            CASE v_stage
              WHEN 1 THEN 'Friendly reminder: invoice ' || v_number || ' is past due. Please pay it to keep things running smoothly.'
              WHEN 2 THEN 'Reminder: invoice ' || v_number || ' is 7 or more days past due. Please pay it to avoid further action.'
              WHEN 3 THEN 'Urgent: invoice ' || v_number || ' is 14 or more days past due. Continued non-payment may affect your eligibility.'
              ELSE        'Final notice: invoice ' || v_number || ' is 21 or more days past due. Your league admin has been told.'
            END,
            v_inv.recipient_person_id,
            v_inv.recipient_email,
            jsonb_build_object(
              'invoiceId', v_inv.id,
              'invoiceNumber', v_number,
              'daysPastDue', v_days_past,
              'stage', v_stage
            ),
            'cron.overdue_sweep',
            'queued'
          )
          ON CONFLICT (idempotency_key) DO NOTHING;
          GET DIAGNOSTICS v_inserted = ROW_COUNT;

          IF v_inserted > 0 THEN
            INSERT INTO overdue_reminder_log
              (escalation_id, invoice_id, channel, template_code, status, sent_at)
            VALUES (v_esc_id, v_inv.id, v_chan,
                    'INVOICE_OVERDUE_STAGE_' || v_stage, 'queued', now());
            UPDATE invoice_escalations
              SET reminders_sent = reminders_sent + 1,
                  last_reminder_at = now(),
                  updated_at = now()
            WHERE id = v_esc_id;
            i_reminders := i_reminders + 1;
          END IF;
        END LOOP;
      END IF;

      v_marked := v_marked + i_marked;
      v_lates := v_lates + i_late;
      v_reminders := v_reminders + i_reminders;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      RAISE WARNING 'sp_overdue_sweep: invoice % (%) skipped: % (%)',
        v_inv.id, v_inv.invoice_number, SQLERRM, SQLSTATE;
    END;
  END LOOP;

  RETURN QUERY SELECT v_marked, v_lates, v_reminders, v_failed;
END $func$;

REVOKE EXECUTE ON FUNCTION public.sp_overdue_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sp_overdue_sweep() TO service_role;
