"use client";

/**
 * Balances per team and per player (FR-3.1.1) and CSV exports for
 * accounting (FR-3.1.4), shared by superadmin-web /finance and
 * org-admin-web /finance. The consuming app passes its SDK call; the API
 * scopes every number to the caller (org or league admin) the same way as
 * the invoice list, so the files match the screen.
 */
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@sportspulse/ui";
import { formatMoney } from "@sportspulse/kernel";

export type FinanceExportKind = "invoices" | "payments" | "refunds" | "aging" | "team_balances" | "player_balances";

export interface FinanceBalances {
  teams: Array<{ teamId: string; teamName: string; openInvoices: number; billedCents: number; paidCents: number; outstandingCents: number; overdueCents: number }>;
  players: Array<{ personId: string; name: string | null; email: string | null; openInvoices: number; outstandingCents: number; overdueCents: number }>;
}

export interface FinanceReportsPanelProps {
  balances: FinanceBalances;
  currency?: string;
  /** The invoice list's current filters, so the invoice export is the rows on screen. */
  filters?: { orgId?: string; status?: string; billingScope?: string; search?: string };
  exportReport: (q: { kind: FinanceExportKind; orgId?: string; status?: string; billingScope?: string; search?: string }) => Promise<{ filename: string; csv: string; rowCount: number }>;
}

const EXPORTS: Array<{ kind: FinanceExportKind; label: string }> = [
  { kind: "invoices", label: "Invoices" },
  { kind: "payments", label: "Payments" },
  { kind: "refunds", label: "Refunds" },
  { kind: "aging", label: "AR aging" },
  { kind: "team_balances", label: "Team balances" },
  { kind: "player_balances", label: "Player balances" }
];

function saveFile(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FinanceReportsPanel({ balances, currency = "USD", filters, exportReport }: FinanceReportsPanelProps) {
  const [busy, setBusy] = useState<FinanceExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run(kind: FinanceExportKind) {
    setBusy(kind);
    setError(null);
    setDone(null);
    try {
      const q = kind === "invoices" ? { kind, ...filters } : { kind, orgId: filters?.orgId };
      const res = await exportReport(q);
      saveFile(res.filename, res.csv);
      setDone(`${res.filename}: ${res.rowCount} row${res.rowCount === 1 ? "" : "s"}.`);
    } catch (e) {
      setError(`Could not export: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const topTeams = balances.teams.slice(0, 10);
  const topPlayers = balances.players.slice(0, 10);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-5" aria-label="Balances and exports">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold tracking-tight text-fg">Balances</p>
          <p className="text-[12px] text-fg-muted">What each team and player still owes on open invoices.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXPORTS.map((e) => (
            <Button key={e.kind} type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run(e.kind)}>
              {busy === e.kind ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />}
              {e.label} CSV
            </Button>
          ))}
        </div>
      </div>
      {error ? <p className="text-[12px] text-[var(--tint-rose-fg)]">{error}</p> : null}
      {done ? <p className="text-[12px] text-fg-muted">Downloaded {done}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <BalanceTable
          title="By team"
          empty="No team owes anything."
          head={["Team", "Open", "Outstanding", "Overdue"]}
          rows={topTeams.map((t) => [t.teamName, String(t.openInvoices), formatMoney(t.outstandingCents, currency), formatMoney(t.overdueCents, currency)])}
          more={balances.teams.length - topTeams.length}
        />
        <BalanceTable
          title="By player"
          empty="No player owes anything."
          head={["Player", "Open", "Outstanding", "Overdue"]}
          rows={topPlayers.map((p) => [p.name ?? p.email ?? "Unknown", String(p.openInvoices), formatMoney(p.outstandingCents, currency), formatMoney(p.overdueCents, currency)])}
          more={balances.players.length - topPlayers.length}
        />
      </div>
    </section>
  );
}

function BalanceTable({ title, head, rows, empty, more }: { title: string; head: string[]; rows: string[][]; empty: string; more: number }) {
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[12px] text-fg-muted">{empty}</p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-fg-muted">
              {head.map((h, i) => (
                <th key={h} className={`pb-1 font-medium ${i > 0 ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={`py-1.5 ${j > 0 ? "text-right font-mono tabular-nums" : "text-fg"}`}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {more > 0 ? <p className="mt-1 text-[11px] text-fg-muted">And {more} more in the CSV.</p> : null}
    </div>
  );
}
