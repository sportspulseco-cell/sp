-- 0053_overdue_sweep_fix.rollback.sql (never auto-applied)
-- Restores the 0027 definition of sp_overdue_sweep() (3-column result).
-- That version aborts on the first past-due invoice (MON-11), so only
-- roll back together with whatever replaces 0053.

DROP FUNCTION IF EXISTS public.sp_overdue_sweep();

CREATE FUNCTION public.sp_overdue_sweep()
RETURNS TABLE(
  invoices_marked_overdue int,
  late_fees_applied int,
  reminders_sent int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $func$
DECLARE
  v_marked int := 0;
  v_lates int := 0;
  v_reminders int := 0;
  v_inv RECORD;
  v_days_past int;
  v_late_fee_cents int := 1000; -- $10 flat — admin can waive
  v_stage int;
  v_channels text[];
  v_chan text;
BEGIN
  FOR v_inv IN
    SELECT i.id, i.org_id, i.recipient_person_id, i.recipient_email,
           i.due_at, i.status, i.total_cents, i.paid_cents,
           i.metadata, i.currency
    FROM invoices i
    WHERE i.due_at IS NOT NULL
      AND i.due_at < now()
      AND i.status IN ('sent','partial','overdue')
      AND i.paid_cents < i.total_cents
  LOOP
    v_days_past := EXTRACT(DAY FROM now() - v_inv.due_at)::int;

    -- Flip to overdue (idempotent)
    IF v_inv.status IN ('sent','partial') THEN
      UPDATE invoices SET status = 'overdue', updated_at = now()
        WHERE id = v_inv.id;
      v_marked := v_marked + 1;
    END IF;

    -- Upsert escalation row
    INSERT INTO invoice_escalations (invoice_id, level, reminders_sent)
    VALUES (v_inv.id, LEAST(GREATEST(v_days_past / 7, 0), 3), 0)
    ON CONFLICT (invoice_id) DO UPDATE
      SET level = LEAST(GREATEST(v_days_past / 7, 0), 3),
          updated_at = now();

    -- Apply late fee once (tracked in metadata)
    IF (v_inv.metadata->>'lateFeeAppliedAt') IS NULL THEN
      INSERT INTO invoice_items (invoice_id, kind, description,
                                 quantity, unit_amount_cents,
                                 amount_cents)
      VALUES (v_inv.id, 'late_fee',
              'Late fee — auto-applied on overdue',
              1, v_late_fee_cents, v_late_fee_cents);
      UPDATE invoices SET
        total_cents = total_cents + v_late_fee_cents,
        metadata = metadata || jsonb_build_object(
          'lateFeeAppliedAt', now()::text,
          'lateFeeAppliedCents', v_late_fee_cents
        ),
        updated_at = now()
      WHERE id = v_inv.id;
      v_lates := v_lates + 1;
    END IF;

    -- Stage 1 (day 1+), 2 (day 7+), 3 (day 14+), 4 (day 21+)
    v_stage := CASE
      WHEN v_days_past >= 21 THEN 4
      WHEN v_days_past >= 14 THEN 3
      WHEN v_days_past >= 7  THEN 2
      WHEN v_days_past >= 1  THEN 1
      ELSE 0
    END;
    IF v_stage = 0 THEN CONTINUE; END IF;

    -- Channels per stage
    v_channels := CASE v_stage
      WHEN 1 THEN ARRAY['email']
      WHEN 2 THEN ARRAY['email','sms']
      WHEN 3 THEN ARRAY['email','sms','in_app']
      ELSE        ARRAY['email','in_app']  -- stage 4 also notifies admin
    END;

    FOREACH v_chan IN ARRAY v_channels
    LOOP
      INSERT INTO notifications
        (org_id, idempotency_key, template_code, channel, body,
         recipient_person_id, recipient_email, payload, source_event, status)
      VALUES (
        v_inv.org_id,
        'overdue-' || v_inv.id::text || '-stage' || v_stage || '-' || v_chan,
        'INVOICE_OVERDUE_STAGE_' || v_stage,
        v_chan,
        CASE v_stage
          WHEN 1 THEN 'Friendly reminder: invoice ' || (v_inv.metadata->>'invoiceNumber') || ' is past due.'
          WHEN 2 THEN 'Reminder: invoice past due 7+ days. Please pay to avoid further action.'
          WHEN 3 THEN 'Urgent: your invoice is 14+ days overdue.'
          ELSE        'FINAL NOTICE: invoice 21+ days overdue. Admin has been notified.'
        END,
        v_inv.recipient_person_id,
        v_inv.recipient_email,
        jsonb_build_object(
          'invoiceId', v_inv.id,
          'daysPastDue', v_days_past,
          'stage', v_stage
        ),
        'cron.overdue_sweep',
        'queued'
      )
      ON CONFLICT (idempotency_key) DO NOTHING;

      INSERT INTO overdue_reminder_log
        (escalation_id, invoice_id, channel, template_code, status, sent_at)
      SELECT e.id, v_inv.id, v_chan,
             'INVOICE_OVERDUE_STAGE_' || v_stage,
             'queued', now()
      FROM invoice_escalations e
      WHERE e.invoice_id = v_inv.id;
      v_reminders := v_reminders + 1;
    END LOOP;

    UPDATE invoice_escalations ie
      SET reminders_sent = ie.reminders_sent + array_length(v_channels, 1),
          last_reminder_at = now()
    WHERE ie.invoice_id = v_inv.id;
  END LOOP;

  RETURN QUERY SELECT v_marked, v_lates, v_reminders;
END $func$;

REVOKE EXECUTE ON FUNCTION public.sp_overdue_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sp_overdue_sweep() TO service_role;
