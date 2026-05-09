import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { fmtRelative } from "./lib/format";
import { DemoBadge } from "./lib/demo-badge";

const TABS: { key: TabKey; label: string }[] = [
  { key: "ar", label: "AR dashboard" },
  { key: "invoice", label: "Player invoice" },
  { key: "split", label: "Dues split" },
  { key: "refund", label: "Refund / credit" },
  { key: "wallet", label: "Wallet" },
  { key: "overdue", label: "Overdue" }
];

export type TabKey =
  | "ar"
  | "invoice"
  | "split"
  | "refund"
  | "wallet"
  | "overdue";

/**
 * Sticky header rendered above every tab. Mirrors the mockup chrome:
 *   - "Payment & invoicing" + org · season subtitle
 *   - Right side: QuickBooks sync status (green when last sync was a
 *     success in the last 24h; amber when stale; red when failures).
 *   - Tab strip with the active tab underlined in accent.
 *
 * `params` is preserved across tab clicks so the current invoice /
 * person / team context follows the admin between tabs.
 */
export function PaymentsHeader({
  active,
  orgName,
  seasonName,
  qbStatus,
  qbIsMock,
  searchParams
}: {
  active: TabKey;
  orgName: string;
  seasonName: string | null;
  qbStatus: {
    connected: boolean;
    lastSyncAt: string | null;
    errorCount24h: number;
  } | null;
  qbIsMock?: boolean;
  searchParams: Record<string, string | undefined>;
}) {
  const qbTone =
    qbStatus?.connected && qbStatus.errorCount24h === 0
      ? "success"
      : qbStatus?.connected
        ? "warning"
        : "neutral";
  const qbLabel = !qbStatus?.connected
    ? "QuickBooks not connected"
    : qbStatus.errorCount24h > 0
      ? `QuickBooks · ${qbStatus.errorCount24h} sync error${qbStatus.errorCount24h === 1 ? "" : "s"}`
      : `QuickBooks synced · ${fmtRelative(qbStatus.lastSyncAt)}`;

  function hrefFor(tab: TabKey): string {
    const sp = new URLSearchParams();
    sp.set("tab", tab);
    for (const [k, v] of Object.entries(searchParams)) {
      if (k !== "tab" && v) sp.set(k, v);
    }
    return `/payments?${sp.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[20px] font-semibold tracking-tight text-fg">
            Payment &amp; invoicing
          </p>
          <p className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
            {orgName}
            {seasonName ? ` · ${seasonName}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest ${
              qbTone === "success"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : qbTone === "warning"
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "bg-fg-muted/10 text-fg-muted"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                qbTone === "success"
                  ? "bg-emerald-500"
                  : qbTone === "warning"
                    ? "bg-amber-500"
                    : "bg-fg-muted"
              }`}
            />
            {qbLabel}
            {qbIsMock ? <DemoBadge label="demo" /> : null}
          </span>
          <button
            type="button"
            aria-label="More"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-fg-muted hover:border-fg-muted hover:text-fg"
          >
            <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <nav className="border-b border-border">
        <ul className="flex flex-wrap gap-0">
          {TABS.map((t) => {
            const isActive = t.key === active;
            return (
              <li key={t.key}>
                <Link
                  href={hrefFor(t.key)}
                  className={`inline-flex items-center px-4 py-2.5 text-[13px] transition-colors ${
                    isActive
                      ? "border-b-2 border-accent text-accent font-medium"
                      : "border-b-2 border-transparent text-fg-muted hover:text-fg"
                  }`}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
