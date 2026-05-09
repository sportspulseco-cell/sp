import { Users } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import type { TeamInvoiceSplitWithPerson } from "@sportspulse/api-client";
import { finance, leagueMgmt } from "@/lib/api/server-api";
import { fmtMoney } from "../lib/format";
import { DuesSplitClient } from "./dues-split-client";

/**
 * Dues split tab — team total card + per-player tracker.
 *
 * Driven by the team_invoice_splits table. Server fetches splits +
 * the team name; the client component owns the buttons (Remind all
 * unpaid / Cover outstanding / per-row Remind).
 */
export async function DuesSplitTab({
  orgId,
  invoiceId,
  teamId
}: {
  orgId: string;
  invoiceId: string | null;
  teamId: string | null;
}) {
  if (!invoiceId || !teamId) {
    return (
      <EmptyState
        icon={Users}
        title="Pick a team invoice"
        description="The Dues split tab needs both ?invoiceId=… and ?teamId=… in the URL. Open a team invoice from the AR dashboard to set them."
      />
    );
  }

  const [splits, team, invoice] = await Promise.all([
    finance.listSplits({ invoiceId, teamId }).catch(
      () => [] as TeamInvoiceSplitWithPerson[]
    ),
    leagueMgmt.getTeam(teamId).catch(() => null),
    finance.getInvoice(invoiceId).catch(() => null)
  ]);

  if (!invoice) {
    return (
      <EmptyState
        icon={Users}
        title="Invoice not found"
        description="The invoice may have been voided or the link is stale."
      />
    );
  }

  const total = splits.reduce((sum, s) => sum + s.allocatedCents, 0);
  const collected = splits.reduce((sum, s) => sum + s.collectedCents, 0);
  const outstanding = total - collected;
  const paidCount = splits.filter((s) => s.status === "paid").length;
  const unpaidCount = splits.length - paidCount;
  const pct = total > 0 ? Math.round((collected / total) * 100) : 0;
  const currency = invoice.currency;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface-1 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              Team total
            </p>
            <p className="text-[18px] font-semibold tracking-tight text-fg">
              {team?.name ?? "Team"}
            </p>
          </div>
          <p className="font-mono text-[24px] font-semibold tabular-nums text-fg">
            {fmtMoney(total, currency)}
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Metric
            label="Collected"
            value={fmtMoney(collected, currency)}
            sub={`${paidCount} player${paidCount === 1 ? "" : "s"}`}
            tone="success"
          />
          <Metric
            label="Outstanding"
            value={fmtMoney(outstanding, currency)}
            sub={`${unpaidCount} player${unpaidCount === 1 ? "" : "s"}`}
            tone="danger"
          />
        </div>
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-bg-subtle">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 font-mono text-[11px] text-fg-muted">
            {pct}% collected
            {invoice.dueAt
              ? ` · Deadline ${new Date(invoice.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
              : ""}
          </p>
        </div>
      </section>

      {splits.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No splits for this invoice yet"
          description="Use the Cover outstanding control after creating a split row per player. Splits divide an invoice's total across the roster — useful for team dues."
        />
      ) : (
        <DuesSplitClient
          splits={splits}
          currency={currency}
          totalCents={invoice.totalCents}
        />
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone
}: {
  label: string;
  value: string;
  sub: string;
  tone: "success" | "danger";
}) {
  const valueClass =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-300"
      : "text-rose-700 dark:text-rose-300";
  return (
    <div className="rounded-md border border-border bg-bg-subtle p-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </p>
      <p className={`mt-1 text-[18px] font-semibold tracking-tight ${valueClass}`}>
        {value}
      </p>
      <p className="font-mono text-[11px] text-fg-muted">{sub}</p>
    </div>
  );
}
