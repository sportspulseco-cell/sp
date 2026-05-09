import { AlertTriangle, ExternalLink } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import type {
  InvoiceEscalationWithInvoice,
  QuickbooksSyncStatus
} from "@sportspulse/api-client";
import { finance } from "@/lib/api/server-api";
import { fmtMoney, fmtDate, daysPastDue, fmtRelative } from "../lib/format";
import { DEMO_MODE, mockQbSyncStatus } from "../lib/mock-data";
import { DemoBadge } from "../lib/demo-badge";
import { OverdueRowActions } from "./overdue-row-actions";

/**
 * Overdue tab — escalation queue + QuickBooks sync footer.
 *
 * Each row renders one invoice_escalations row joined to its invoice.
 * Severity = level (1 gentle / 2 firm / 3 legal). Action buttons live
 * in OverdueRowActions (client) and call finance.patchEscalation /
 * finance.recordPayment under the hood.
 */
export async function OverdueTab({ orgId }: { orgId: string }) {
  const [escalations, realQb] = await Promise.all([
    finance
      .listEscalations({ orgId })
      .catch(() => [] as InvoiceEscalationWithInvoice[]),
    finance.qbSyncStatus(orgId).catch(
      (): QuickbooksSyncStatus => ({
        connected: false,
        lastSyncAt: null,
        errorCount24h: 0,
        recentEvents: []
      })
    )
  ]);
  // Mockup-data fallback for the QB section. Removable once the
  // Intuit OAuth + sync worker lands — see doc/deferred-integrations.md.
  const qbStatus =
    realQb.recentEvents.length > 0
      ? realQb
      : DEMO_MODE
        ? mockQbSyncStatus(orgId)
        : realQb;
  const qbIsMock = DEMO_MODE && realQb.recentEvents.length === 0;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div>
            <p className="text-[14px] font-semibold tracking-tight text-fg">
              Overdue escalation queue
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-fg-muted">
              {escalations.length} invoice{escalations.length === 1 ? "" : "s"} ·
              automated reminders {qbStatus.connected ? "active" : "manual"}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
          >
            Job status
          </button>
        </header>
        {escalations.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="No overdue invoices"
            description="When an invoice's due date passes without full payment, an escalation row is created and surfaces here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {escalations.map((e) => (
              <EscalationRow key={e.id} escalation={e} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <p className="text-[14px] font-semibold tracking-tight text-fg">
              QuickBooks sync status
              {qbIsMock ? <DemoBadge label="demo" /> : null}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  qbStatus.connected
                    ? qbStatus.errorCount24h === 0
                      ? "bg-emerald-500"
                      : "bg-amber-500"
                    : "bg-fg-muted"
                }`}
              />
              <p className="font-mono text-[11px] text-fg-muted">
                {qbStatus.connected
                  ? qbStatus.errorCount24h === 0
                    ? "Connected · Syncing"
                    : `Connected · ${qbStatus.errorCount24h} sync error${qbStatus.errorCount24h === 1 ? "" : "s"} (last 24h)`
                  : "Not connected — Intuit OAuth integration ships separately"}
                {qbStatus.lastSyncAt
                  ? ` · Last sync: ${fmtRelative(qbStatus.lastSyncAt)}`
                  : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
            View in QB
          </button>
        </header>

        <div className="mt-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Recent sync events
          </p>
          {qbStatus.recentEvents.length === 0 ? (
            <p className="mt-2 text-[12px] text-fg-muted">
              No sync events yet. Events land here once the QuickBooks
              worker is connected and starts pushing invoices, payments,
              refunds, and credit memos.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {qbStatus.recentEvents.map((ev) => (
                <li
                  key={ev.id}
                  className="flex items-center justify-between gap-3 font-mono text-[11px]"
                >
                  <span className="text-fg-muted">
                    {ev.summary ??
                      `${ev.action} ${ev.entityType.replace(/_/g, " ")}`}
                    {ev.qbId ? ` · ${ev.qbId}` : ""}
                  </span>
                  <span
                    className={
                      ev.status === "succeeded"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : ev.status === "failed"
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-fg-muted"
                    }
                  >
                    {ev.status === "succeeded" ? "✓" : ev.status === "failed" ? "✗" : "·"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function EscalationRow({
  escalation
}: {
  escalation: InvoiceEscalationWithInvoice;
}) {
  const e = escalation;
  const inv = e.invoice;
  const dpd = daysPastDue(inv.dueAt);
  const outstanding = inv.totalCents - inv.paidCents;
  const severity = e.lockSuspended
    ? "amber"
    : e.level >= 2 || dpd > 30
      ? "red"
      : "amber";
  // Mockup row 1 has a soft red wash + red "!" badge ("admin follow-up
  // required"); row 2 has a yellow wash + amber "!" badge.
  const rowBgClass =
    severity === "red"
      ? "bg-rose-500/5 hover:bg-rose-500/10"
      : "bg-amber-500/5 hover:bg-amber-500/10";
  const iconBoxClass =
    severity === "red"
      ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
      : "bg-amber-500/15 text-amber-700 dark:text-amber-300";

  // Late fee → derived from invoice metadata when the worker has stamped
  // it. Fallback: assume the difference between outstanding and the
  // round invoice total is the fee (covers the mockup's "$3,925 incl.
  // late fee" subtitle when amount > original balance).
  const md = inv as unknown as { metadata?: { lateFeeCents?: number } };
  const lateFeeCents = md.metadata?.lateFeeCents ?? 0;
  const grossOutstanding = outstanding + lateFeeCents;

  return (
    <li className={`px-5 py-3 transition-colors ${rowBgClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-[12px] font-bold ${iconBoxClass}`}
            aria-hidden="true"
          >
            !
          </span>
          <div className="space-y-1">
            <p className="text-[13px] font-medium text-fg">
              {inv.invoiceNumber}
              {inv.dueAt ? ` · due ${fmtDate(inv.dueAt)}` : ""}
            </p>
            <p className="font-mono text-[11px] text-fg-muted">
              {fmtMoney(outstanding, inv.currency)} ·{" "}
              {dpd > 0 ? `${dpd} days past due` : "due now"} · Reminder{" "}
              {e.remindersSent} sent
              {lateFeeCents > 0
                ? ` · Late fee ${fmtMoney(lateFeeCents, inv.currency)} applied`
                : ""}
              {e.lockSuspended ? " · Auto-suspension flag active" : ""}
              {e.level >= 2 ? " · Admin follow-up required" : ""}
              {e.extendedDueAt
                ? ` · Extended to ${fmtDate(e.extendedDueAt)}`
                : ""}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-[14px] font-semibold tabular-nums text-fg">
            {fmtMoney(grossOutstanding, inv.currency)}
          </p>
          {lateFeeCents > 0 ? (
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              incl. late fee
            </p>
          ) : null}
        </div>
      </div>
      <OverdueRowActions escalation={e} />
    </li>
  );
}
