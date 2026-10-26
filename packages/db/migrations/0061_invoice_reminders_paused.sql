-- 0061_invoice_reminders_paused.sql
-- UC-18 alternative flow "Admin disables auto-reminders for specific
-- invoices" and "notification sent to player (and captain if team dues)".
--   * invoices.auto_reminders_paused: an admin stops (and can resume) the
--     sweep's reminders for one invoice. The invoice is still marked
--     overdue and a configured late fee still applies; only the messages
--     stop. Before, the only control was the escalation's "Suppress",
--     which cleared a suspension flag and never stopped a reminder.
--   * a player's share of team dues (sub_invoice) that goes past due also
--     tells the team's captain, once per share (idempotency key
--     overdue-share-captain-<invoice>), by email, unless reminders are
--     paused or the captain is the payer.
-- Everything else is the 0060 definition. Idempotent: guarded column,
-- CREATE OR REPLACE with the same signature.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS auto_reminders_paused boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.sp_overdue_sweep()
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
  v_fee_total int;
  v_fee_note text;
  v_captain RECORD;
  -- per-invoice counts, added to the totals only if the invoice succeeds
  i_marked int;
  i_late int;
  i_reminders int;
BEGIN
  FOR v_inv IN
    SELECT i.id, i.org_id, i.invoice_number, i.recipient_person_id,
           i.recipient_email, i.due_at, i.status, i.metadata, i.currency,
           i.late_fee_applied_cents, i.auto_reminders_paused, i.invoice_type,
           COALESCE(i.team_id, par.team_id) AS share_team_id,
           CASE WHEN i.late_fee_cents > 0 THEN i.late_fee_cents
                ELSE COALESCE(fs.late_fee_cents, 0) END AS late_fee_cents
    FROM invoices i
    LEFT JOIN fee_schedules fs ON fs.id = i.fee_schedule_id
    LEFT JOIN invoices par ON par.id = i.parent_invoice_id
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

      -- Late fee: once, a full day after the due date.
      v_fee := v_inv.late_fee_cents;
      v_fee_total := v_inv.late_fee_applied_cents;
      IF v_fee > 0 AND v_days_past >= 1
         AND (v_inv.metadata->>'lateFeeAppliedAt') IS NULL THEN
        UPDATE invoices SET
          total_cents = total_cents + v_fee,
          late_fee_applied_cents = late_fee_applied_cents + v_fee,
          metadata = metadata || jsonb_build_object(
            'lateFeeAppliedAt', now()::text,
            'lateFeeAppliedCents', v_fee
          ),
          updated_at = now()
        WHERE id = v_inv.id
          AND (metadata->>'lateFeeAppliedAt') IS NULL;
        GET DIAGNOSTICS v_inserted = ROW_COUNT;
        IF v_inserted > 0 THEN
          INSERT INTO invoice_items (invoice_id, kind, description,
                                     quantity, unit_amount_cents, amount_cents)
          VALUES (v_inv.id, 'late_fee', 'Late fee (not paid by the due date)', 1, v_fee, v_fee);
          v_fee_total := v_fee_total + v_fee;
          i_late := 1;
        END IF;
      END IF;
      v_fee_note := CASE WHEN v_fee_total > 0
        THEN ' A late fee of ' || to_char(v_fee_total / 100.0, 'FM999,999,990.00')
             || ' ' || COALESCE(v_inv.currency, 'USD') || ' has been added.'
        ELSE '' END;

      v_stage := CASE
        WHEN v_days_past >= 21 THEN 4
        WHEN v_days_past >= 14 THEN 3
        WHEN v_days_past >= 7  THEN 2
        WHEN v_days_past >= 1  THEN 1
        ELSE 0
      END;

      -- An admin stopped automatic reminders for this invoice (UC-18
      -- alternative flow): still marked overdue, still charged a
      -- configured late fee, but no reminder and no captain notice.
      IF v_stage > 0 AND NOT v_inv.auto_reminders_paused THEN
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
            END || v_fee_note,
            v_inv.recipient_person_id,
            v_inv.recipient_email,
            jsonb_build_object(
              'invoiceId', v_inv.id,
              'invoiceNumber', v_number,
              'daysPastDue', v_days_past,
              'stage', v_stage,
              'lateFeeCents', v_fee_total
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

        -- A player's share of team dues: the team's captain hears about
        -- it once, when the share first goes past due (UC-18 "and captain
        -- if team dues"; UC-16 "captain pays for missing balance").
        IF v_inv.invoice_type = 'sub_invoice' AND v_inv.share_team_id IS NOT NULL THEN
          SELECT t.name AS team_name, pr.email, cp.id AS person_id,
                 COALESCE(NULLIF(trim(concat_ws(' ', rp.legal_first_name, rp.legal_last_name)), ''),
                          v_inv.recipient_email, 'A player') AS player_name
            INTO v_captain
            FROM teams t
            JOIN profiles pr ON pr.id = t.captain_user_id
            LEFT JOIN persons cp ON cp.user_id = t.captain_user_id
            LEFT JOIN persons rp ON rp.id = v_inv.recipient_person_id
           WHERE t.id = v_inv.share_team_id
           LIMIT 1;
          IF FOUND AND v_captain.email IS NOT NULL
             AND v_captain.email IS DISTINCT FROM v_inv.recipient_email THEN
            INSERT INTO notifications
              (org_id, idempotency_key, template_code, channel, subject, body,
               recipient_person_id, recipient_email, payload, source_event, status)
            VALUES (
              v_inv.org_id,
              'overdue-share-captain-' || v_inv.id::text,
              'TEAM_SHARE_OVERDUE',
              'email',
              v_captain.player_name || '''s share of ' || v_captain.team_name || ' dues is past due',
              v_captain.player_name || '''s share of the ' || v_captain.team_name || ' team dues (invoice '
                || v_number || ') is past due. You can remind them or cover it from Dues.',
              v_captain.person_id,
              v_captain.email,
              jsonb_build_object('invoiceId', v_inv.id, 'invoiceNumber', v_number,
                                 'teamId', v_inv.share_team_id, 'daysPastDue', v_days_past),
              'cron.overdue_sweep',
              'queued'
            )
            ON CONFLICT (idempotency_key) DO NOTHING;
            GET DIAGNOSTICS v_inserted = ROW_COUNT;
            i_reminders := i_reminders + v_inserted;
          END IF;
        END IF;
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
