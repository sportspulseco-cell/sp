"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  CircleDollarSign,
  Download,
  Loader2
} from "lucide-react";
import { Badge, Button, Eyebrow } from "@sportspulse/ui";
import { finance } from "@/lib/api/browser-api";

type Breakdown = Awaited<ReturnType<typeof finance.captainDuesBreakdown>>;
type SubInvoice = Breakdown["subInvoices"][number];

type SplitMode = "even" | "custom";

function fmt(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency
  }).format(cents / 100);
}

export function DuesScreen({
  teamId,
  initial
}: {
  teamId: string;
  initial: Breakdown;
}) {
  const [data, setData] = useState<Breakdown>(initial);
  const [busy, setBusy] = useState<"remind" | "cover" | string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>("even");
  const [includeCaptain, setIncludeCaptain] = useState(true);

  const currency = data.subInvoices[0]?.currency ?? "USD";
  const outstanding = Math.max(0, data.totalCents - data.collectedCents);
  const pct = data.totalCents
    ? Math.min(100, Math.round((data.collectedCents / data.totalCents) * 100))
    : 0;
  const unpaid = data.subInvoices.filter((s) => s.paidCents < s.totalCents);
  const thresholdPct =
    data.totalCents > 0
      ? Math.min(100, Math.round((data.thresholdCents / data.totalCents) * 100))
      : 0;
  const thresholdReached = data.collectedCents >= data.thresholdCents && data.thresholdCents > 0;

  const visibleRows = useMemo(() => {
    if (includeCaptain) return data.subInvoices;
    return data.subInvoices.filter((r) => !r.isCaptain);
  }, [data.subInvoices, includeCaptain]);

  async function refresh() {
    try {
      const next = await finance.captainDuesBreakdown(teamId);
      setData(next);
    } catch (e) {
      console.error(e);
    }
  }

  async function remindAll() {
    setBusy("remind");
    setError(null);
    try {
      const res = await finance.captainDuesRemindAll(teamId);
      setFlash(
        res.queued > 0
          ? `Queued ${res.queued} payment reminder${res.queued === 1 ? "" : "s"}.`
          : "Nothing to remind — everyone is paid up."
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function coverOutstanding() {
    if (
      !confirm(
        `Charge your card ${fmt(outstanding, currency)} to cover all unpaid sub-invoices?`
      )
    )
      return;
    setBusy("cover");
    setError(null);
    try {
      const res = await finance.captainDuesCoverOutstanding(teamId, {
        mockOutcome: "succeeded"
      });
      setFlash(
        res.charged > 0
          ? `Charged ${fmt(res.charged, currency)} — covered ${res.covered} player${res.covered === 1 ? "" : "s"}.`
          : "Nothing outstanding."
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remindOne(sub: SubInvoice) {
    setBusy(sub.id);
    setError(null);
    try {
      await finance.remindSplit(sub.id);
      setFlash(`Reminded ${sub.playerName ?? "player"}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function exportCsv() {
    const rows: string[] = [
      ["Player", "Invoice #", "Split", "Collected", "Status", "Due"].join(",")
    ];
    for (const r of data.subInvoices) {
      rows.push(
        [
          escapeCsv(r.playerName ?? r.recipientEmail ?? r.id),
          r.invoiceNumber,
          fmt(r.totalCents, r.currency),
          fmt(r.paidCents, r.currency),
          rowStatusFor(r),
          r.dueAt ? new Date(r.dueAt).toLocaleDateString() : "—"
        ].join(",")
      );
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `team-dues-${data.teamName ?? "team"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-surface-1">
        {/* Header — mock 4 */}
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-[16px] font-semibold tracking-tight text-fg">
              Team dues — {data.teamName ?? "Team"}
              {data.seasonName && (
                <span className="ml-1 text-fg-muted">· {data.seasonName}</span>
              )}
            </h2>
            {data.divisionName && (
              <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                {data.divisionName}
              </p>
            )}
          </div>
          {data.masterInvoiceNumber && (
            <p className="font-mono text-[11px] text-fg-muted">
              Master invoice:{" "}
              <span className="text-fg">{data.masterInvoiceNumber}</span>
            </p>
          )}
        </header>

        {/* Collected gauge — mock 4 */}
        <div className="px-5 py-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                Collected
              </p>
              <p className="mt-1 font-mono text-[26px] font-semibold tabular-nums text-fg">
                {fmt(data.collectedCents, currency)}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
                of {fmt(data.totalCents, currency)} total
              </p>
              {data.thresholdCents > 0 && (
                <p className="mt-0.5 font-mono text-[11px] text-fg-muted">
                  Confirms at {fmt(data.thresholdCents, currency)}
                </p>
              )}
            </div>
          </div>

          {/* Progress bar with threshold marker */}
          <div className="relative mt-3 h-2 overflow-visible rounded-full bg-bg-subtle">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${pct}%` }}
            />
            {data.thresholdCents > 0 && thresholdPct > 0 && thresholdPct < 100 && (
              <span
                aria-label="confirmation threshold"
                title={`Threshold ${fmt(data.thresholdCents, currency)}`}
                className="absolute -top-1 h-4 w-px bg-emerald-500"
                style={{ left: `${thresholdPct}%` }}
              />
            )}
          </div>

          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-muted">
            <span>{pct}% collected</span>
            <span aria-hidden>·</span>
            {thresholdReached ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                Confirmation threshold reached ✓
              </span>
            ) : (
              data.thresholdCents > 0 && (
                <span>
                  {fmt(
                    Math.max(0, data.thresholdCents - data.collectedCents),
                    currency
                  )}{" "}
                  to confirmation
                </span>
              )
            )}
            <span aria-hidden>·</span>
            <span>
              {unpaid.length} player{unpaid.length === 1 ? "" : "s"} outstanding
            </span>
          </p>

          {/* Actions row — mock 4 */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={remindAll}
                disabled={busy !== null || unpaid.length === 0}
              >
                {busy === "remind" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Bell className="mr-2 h-4 w-4" />
                )}
                Remind all unpaid
              </Button>
              <Button
                onClick={coverOutstanding}
                disabled={busy !== null || outstanding === 0}
              >
                {busy === "cover" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CircleDollarSign className="mr-2 h-4 w-4" />
                )}
                Cover outstanding ({fmt(outstanding, currency)})
              </Button>
            </div>
            <Button variant="ghost" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </section>

      {flash && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {flash}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}

      {/* Per-player breakdown — mock 4 */}
      <section className="rounded-2xl border border-border bg-surface-1">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <Eyebrow>Player splits</Eyebrow>
          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            <label className="flex items-center gap-1.5 text-fg-muted">
              Split:
              <select
                value={splitMode}
                onChange={(e) => setSplitMode(e.target.value as SplitMode)}
                className="h-8 rounded-md border border-border bg-bg px-2 text-fg focus:border-accent focus:outline-none"
              >
                <option value="even">Even split</option>
                <option value="custom">Custom split</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-1.5 text-fg-muted">
              <input
                type="checkbox"
                checked={includeCaptain}
                onChange={(e) => setIncludeCaptain(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
              />
              Include captain
            </label>
          </div>
        </header>

        <table className="w-full text-[13px]">
          <thead className="bg-bg-subtle/40 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            <tr>
              <th className="px-5 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-right">Split</th>
              <th className="px-3 py-2 text-left">Progress</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Due date</th>
              <th className="px-5 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-6 text-center text-fg-muted"
                >
                  No sub-invoices on file.
                </td>
              </tr>
            ) : (
              visibleRows.map((s) => (
                <PlayerRow
                  key={s.id}
                  sub={s}
                  currency={currency}
                  splitDisabled={splitMode !== "custom"}
                  busy={busy === s.id}
                  onRemind={() => remindOne(s)}
                />
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function PlayerRow({
  sub,
  currency,
  splitDisabled,
  busy,
  onRemind
}: {
  sub: SubInvoice;
  currency: string;
  splitDisabled: boolean;
  busy: boolean;
  onRemind: () => void;
}) {
  const owe = Math.max(0, sub.totalCents - sub.paidCents);
  const fullyPaid = owe === 0;
  const partial = !fullyPaid && sub.paidCents > 0;
  const overdue = sub.isOverdue;
  const pct = sub.totalCents
    ? Math.min(100, Math.round((sub.paidCents / sub.totalCents) * 100))
    : 0;

  const initials = (sub.playerName ?? sub.recipientEmail ?? "??")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <tr>
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 font-mono text-[11px] font-semibold uppercase text-accent">
            {initials}
          </span>
          <div>
            <p className="font-medium text-fg">
              {sub.playerName ?? "—"}
            </p>
            {sub.isCaptain && (
              <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                Captain
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <input
          type="number"
          readOnly={splitDisabled}
          value={(sub.totalCents / 100).toFixed(2)}
          className={[
            "h-8 w-24 rounded-md border border-border bg-bg px-2 text-right font-mono tabular-nums text-fg focus:border-accent focus:outline-none",
            splitDisabled && "cursor-not-allowed opacity-70"
          ]
            .filter(Boolean)
            .join(" ")}
        />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="h-1 w-24 overflow-hidden rounded-full bg-border">
            <div
              className={
                fullyPaid
                  ? "h-full bg-emerald-500"
                  : partial
                    ? "h-full bg-amber-500"
                    : "h-full bg-fg-muted/40"
              }
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono text-[12px] tabular-nums text-fg-muted">
            {fmt(sub.paidCents, currency)}
          </span>
        </div>
      </td>
      <td className="px-3 py-3">
        <Badge
          tone={
            fullyPaid
              ? "success"
              : overdue
                ? "danger"
                : partial
                  ? "warning"
                  : "neutral"
          }
          mono
        >
          {rowStatusFor(sub)}
        </Badge>
      </td>
      <td className="px-3 py-3">
        <span
          className={
            overdue
              ? "font-mono text-[12px] text-rose-600 dark:text-rose-400"
              : "font-mono text-[12px] text-fg-muted"
          }
        >
          {sub.dueAt
            ? new Date(sub.dueAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric"
              })
            : "—"}
        </span>
      </td>
      <td className="px-5 py-3 text-right">
        {fullyPaid ? (
          <span className="text-fg-muted">—</span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemind}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Remind"
            )}
          </Button>
        )}
      </td>
    </tr>
  );
}

function rowStatusFor(sub: SubInvoice): string {
  const owe = Math.max(0, sub.totalCents - sub.paidCents);
  if (owe === 0) return "Paid";
  if (sub.isOverdue) return "Overdue";
  if (sub.paidCents > 0) return "Partial";
  return "Unpaid";
}

function escapeCsv(s: string): string {
  if (s.includes(",") || s.includes("\"")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
