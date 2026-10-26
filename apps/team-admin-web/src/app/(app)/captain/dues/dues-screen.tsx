"use client";

import { DATE_FORMATS, centsToAmountInput, formatCalendarDate, formatMoney } from "@sportspulse/kernel";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CircleDollarSign,
  Download,
  Loader2
} from "lucide-react";
import { Alert, Badge, Button, Eyebrow } from "@sportspulse/ui";
import { finance } from "@/lib/api/browser-api";

type Breakdown = Awaited<ReturnType<typeof finance.captainDuesBreakdown>>;
type SubInvoice = Breakdown["subInvoices"][number];

type SplitMode = "even" | "custom";


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
  // Reopens in the mode the captain last saved (MON-8: the split used to
  // live only in this component, so a reload showed the even split).
  const [splitMode, setSplitMode] = useState<SplitMode>(initial.splitMethod ?? "even");
  const [includeCaptain, setIncludeCaptain] = useState(true);
  // Per-row custom amount overrides (cents), keyed by sub-invoice id.
  // Seeded from backend totals so editing starts from the current value.
  const [customSplits, setCustomSplits] = useState<Record<string, number>>(
    () => Object.fromEntries(initial.subInvoices.map((s) => [s.id, s.totalCents]))
  );
  useEffect(() => {
    setCustomSplits((prev) => {
      const next = { ...prev };
      for (const s of data.subInvoices) {
        if (next[s.id] === undefined) next[s.id] = s.totalCents;
      }
      return next;
    });
  }, [data.subInvoices]);

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

  // The amount the shares must add up to: the team fee on the master
  // invoice (the server checks the same number).
  const targetCents = data.masterTotalCents || data.totalCents;

  // "Include captain" only shapes the even split; a custom split lists
  // every share because the server needs an amount for each one.
  const visibleRows = useMemo(() => {
    if (includeCaptain || splitMode === "custom") return data.subInvoices;
    return data.subInvoices.filter((r) => !r.isCaptain);
  }, [data.subInvoices, includeCaptain, splitMode]);

  // Even-split share: total divided over visible rows. Remainder cents
  // go to the first row so the splits sum exactly to the master total.
  const evenShares = useMemo(() => {
    const n = visibleRows.length;
    if (n === 0) return {} as Record<string, number>;
    const base = Math.floor(targetCents / n);
    const remainder = targetCents - base * n;
    const out: Record<string, number> = {};
    visibleRows.forEach((r, i) => {
      out[r.id] = base + (i === 0 ? remainder : 0);
    });
    return out;
  }, [visibleRows, targetCents]);

  function displayedSplit(id: string, fallbackCents: number): number {
    if (splitMode === "even") return evenShares[id] ?? 0;
    return customSplits[id] ?? fallbackCents;
  }

  function setCustomSplitFor(id: string, cents: number) {
    setCustomSplits((prev) => ({ ...prev, [id]: Math.max(0, cents) }));
  }

  const customSum = data.subInvoices.reduce(
    (sum, s) => sum + (customSplits[s.id] ?? s.totalCents),
    0
  );
  const customBalanced = customSum === targetCents;

  async function saveSplit() {
    setBusy("split");
    setError(null);
    try {
      const next =
        splitMode === "even"
          ? await finance.captainDuesSetSplit(teamId, { invoiceId: data.masterInvoiceId ?? undefined, method: "even", includeCaptain })
          : await finance.captainDuesSetSplit(teamId, {
              invoiceId: data.masterInvoiceId ?? undefined,
              method: "custom",
              amounts: data.subInvoices.map((s) => ({
                invoiceId: s.id,
                amountCents: customSplits[s.id] ?? s.totalCents
              }))
            });
      // Readback: the table now shows what the server stored.
      setData(next);
      setCustomSplits(Object.fromEntries(next.subInvoices.map((s) => [s.id, s.totalCents])));
      setFlash(
        splitMode === "even"
          ? "Split saved: the team fee is shared evenly."
          : "Custom split saved."
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    try {
      const next = await finance.captainDuesBreakdown(teamId, data.masterInvoiceId ?? undefined);
      setData(next);
    } catch (e) {
      console.error(e);
    }
  }

  // Another team invoice (MON-23): division-entry fee or one an admin sent.
  async function openInvoice(id: string) {
    setBusy("open");
    setError(null);
    setFlash(null);
    try {
      const next = await finance.captainDuesBreakdown(teamId, id);
      setData(next);
      setSplitMode(next.splitMethod ?? "even");
      setCustomSplits(Object.fromEntries(next.subInvoices.map((s) => [s.id, s.totalCents])));
      setFirstCustom({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // First split of a team invoice with no shares yet: one invoice per player.
  const [firstCustom, setFirstCustom] = useState<Record<string, number>>({});
  const firstPayers = data.candidates.filter((c) => includeCaptain || !c.isCaptain);
  const firstEven = useMemo(() => {
    const n = firstPayers.length;
    const out: Record<string, number> = {};
    if (n === 0) return out;
    const base = Math.floor(targetCents / n);
    const remainder = targetCents - base * n;
    firstPayers.forEach((c, i) => (out[c.personId] = base + (i === 0 ? remainder : 0)));
    return out;
  }, [firstPayers, targetCents]);
  const firstCustomSum = data.candidates.reduce((a, c) => a + (firstCustom[c.personId] ?? 0), 0);

  async function createSplit() {
    setBusy("split");
    setError(null);
    try {
      const next =
        splitMode === "even"
          ? await finance.captainDuesSetSplit(teamId, {
              invoiceId: data.masterInvoiceId ?? undefined,
              method: "even",
              includeCaptain
            })
          : await finance.captainDuesSetSplit(teamId, {
              invoiceId: data.masterInvoiceId ?? undefined,
              method: "custom",
              personAmounts: data.candidates
                .map((c) => ({ personId: c.personId, amountCents: firstCustom[c.personId] ?? 0 }))
                .filter((x) => x.amountCents > 0)
            });
      setData(next);
      setCustomSplits(Object.fromEntries(next.subInvoices.map((s) => [s.id, s.totalCents])));
      setFlash(
        `Split sent: ${next.subInvoices.length} player${next.subInvoices.length === 1 ? "" : "s"} got an invoice for their share.`
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remindAll() {
    setBusy("remind");
    setError(null);
    try {
      const res = await finance.captainDuesRemindAll(teamId, data.masterInvoiceId ?? undefined);
      setFlash(
        res.queued > 0
          ? `Queued ${res.queued} payment reminder${res.queued === 1 ? "" : "s"}.`
          : "Nothing to remind. Everyone is paid up."
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
        `Charge your card ${formatMoney(outstanding, currency)} to cover all unpaid sub-invoices?`
      )
    )
      return;
    setBusy("cover");
    setError(null);
    try {
      const res = await finance.captainDuesCoverOutstanding(teamId, {
        mockOutcome: "succeeded",
        invoiceId: data.masterInvoiceId ?? undefined
      });
      setFlash(
        res.charged > 0
          ? `Charged ${formatMoney(res.charged, currency)}, covering ${res.covered} player${res.covered === 1 ? "" : "s"}.`
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
      await finance.captainDuesRemindOne(teamId, sub.id, data.masterInvoiceId ?? undefined);
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
          formatMoney(r.totalCents, r.currency),
          formatMoney(r.paidCents, r.currency),
          rowStatusFor(r),
          r.dueAt ? new Date(r.dueAt).toLocaleDateString("en-CA") : "—"
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
              Team dues: {data.teamName ?? "Team"}
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
          <div className="flex flex-col items-end gap-1.5">
            {data.masters.length > 1 ? (
              <label className="flex items-center gap-1.5 text-[12px] text-fg-muted">
                Team invoice
                <select
                  value={data.masterInvoiceId ?? ""}
                  onChange={(e) => void openInvoice(e.target.value)}
                  disabled={busy !== null}
                  className="h-8 max-w-[22rem] rounded-md border border-border bg-bg px-2 text-fg focus:border-accent focus:outline-none"
                >
                  {data.masters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} · {m.invoiceNumber} · {formatMoney(m.totalCents, currency)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {data.masterInvoiceNumber && (
              <p className="font-mono text-[11px] text-fg-muted">
                Team invoice: <span className="text-fg">{data.masterInvoiceNumber}</span>
                {data.masterKind === "team_invoice" && data.masterLabel ? ` · ${data.masterLabel}` : ""}
              </p>
            )}
          </div>
        </header>

        {/* Collected gauge — mock 4 */}
        <div className="px-5 py-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                Collected
              </p>
              <p className="mt-1 font-mono text-[26px] font-semibold tabular-nums text-fg">
                {formatMoney(data.collectedCents, currency)}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
                of {formatMoney(data.totalCents, currency)} total
              </p>
              {data.thresholdCents > 0 && (
                <p className="mt-0.5 font-mono text-[11px] text-fg-muted">
                  Confirms at {formatMoney(data.thresholdCents, currency)}
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
                title={`Threshold ${formatMoney(data.thresholdCents, currency)}`}
                className="absolute -top-1 h-4 w-px bg-[var(--success)]"
                style={{ left: `${thresholdPct}%` }}
              />
            )}
          </div>

          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-muted">
            <span>{pct}% collected</span>
            <span aria-hidden>·</span>
            {thresholdReached ? (
              <span className="text-[var(--tint-emerald-fg)]">
                Confirmation threshold reached ✓
              </span>
            ) : (
              data.thresholdCents > 0 && (
                <span>
                  {formatMoney(
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
                Cover outstanding ({formatMoney(outstanding, currency)})
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
        <Alert tone="success" role="status">
          {flash}
        </Alert>
      )}
      {error && (
        <Alert tone="error">
          {error}
        </Alert>
      )}

      {data.subInvoices.length === 0 ? (
        <section className="rounded-2xl border border-border bg-surface-1">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
            <Eyebrow>Split the team fee</Eyebrow>
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
              {splitMode === "even" ? (
                <label className="inline-flex items-center gap-1.5 text-fg-muted">
                  <input
                    type="checkbox"
                    checked={includeCaptain}
                    onChange={(e) => setIncludeCaptain(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
                  />
                  Include captain
                </label>
              ) : (
                <span className={firstCustomSum === targetCents ? "text-fg-muted" : "font-medium text-[var(--tint-rose-fg)]"}>
                  {formatMoney(firstCustomSum, currency)} of {formatMoney(targetCents, currency)}
                </span>
              )}
              <Button
                size="sm"
                onClick={createSplit}
                disabled={
                  busy !== null ||
                  data.candidates.length === 0 ||
                  (splitMode === "even" ? firstPayers.length === 0 : firstCustomSum !== targetCents)
                }
              >
                {busy === "split" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Split and send invoices
              </Button>
            </div>
          </header>
          {data.candidates.length === 0 ? (
            <p className="px-5 py-6 text-center text-[13px] text-fg-muted">
              Nobody is on the roster yet. Invite your players, then split the team fee.
            </p>
          ) : (
            <>
              <p className="px-5 pt-4 text-[12px] text-fg-muted">
                Your league sent the team one invoice for {formatMoney(targetCents, currency)}. Split it and each
                player gets their own invoice for their share; they pay it in the player app.
              </p>
              <table className="mt-2 w-full text-[13px]">
                <thead className="bg-bg-subtle/40 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                  <tr>
                    <th className="px-5 py-2 text-left">Player</th>
                    <th className="px-5 py-2 text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.candidates.map((c) => {
                    const cents =
                      splitMode === "even" ? firstEven[c.personId] ?? 0 : firstCustom[c.personId] ?? 0;
                    return (
                      <tr key={c.personId}>
                        <td className="px-5 py-3">
                          <p className="font-medium text-fg">{c.name}</p>
                          {c.isCaptain ? (
                            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Captain</p>
                          ) : null}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            aria-label={`Share for ${c.name}`}
                            readOnly={splitMode === "even"}
                            value={centsToAmountInput(cents)}
                            onChange={(e) => {
                              const dollars = parseFloat(e.target.value);
                              setFirstCustom((prev) => ({
                                ...prev,
                                [c.personId]: Number.isFinite(dollars) ? Math.max(0, Math.round(dollars * 100)) : 0
                              }));
                            }}
                            className={[
                              "h-8 w-24 rounded-md border border-border bg-bg px-2 text-right font-mono tabular-nums text-fg focus:border-accent focus:outline-none",
                              splitMode === "even" && "cursor-not-allowed opacity-70"
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </section>
      ) : null}

      {/* Per-player breakdown — mock 4 */}
      <section className={data.subInvoices.length === 0 ? "hidden" : "rounded-2xl border border-border bg-surface-1"}>
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
            {splitMode === "even" ? (
              <label className="inline-flex items-center gap-1.5 text-fg-muted">
                <input
                  type="checkbox"
                  checked={includeCaptain}
                  onChange={(e) => setIncludeCaptain(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
                />
                Include captain
              </label>
            ) : (
              <span
                className={
                  customBalanced ? "text-fg-muted" : "font-medium text-[var(--tint-rose-fg)]"
                }
              >
                {formatMoney(customSum, currency)} of {formatMoney(targetCents, currency)}
                {customBalanced
                  ? ""
                  : customSum > targetCents
                    ? ` · ${formatMoney(customSum - targetCents, currency)} too much`
                    : ` · ${formatMoney(targetCents - customSum, currency)} left to assign`}
              </span>
            )}
            <Button
              size="sm"
              onClick={saveSplit}
              disabled={busy !== null || (splitMode === "custom" && !customBalanced)}
            >
              {busy === "split" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save split
            </Button>
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
                  splitCents={displayedSplit(s.id, s.totalCents)}
                  onSplitChange={(cents) => setCustomSplitFor(s.id, cents)}
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
  splitCents,
  onSplitChange,
  busy,
  onRemind
}: {
  sub: SubInvoice;
  currency: string;
  splitDisabled: boolean;
  splitCents: number;
  onSplitChange: (cents: number) => void;
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
          step="0.01"
          min={0}
          readOnly={splitDisabled}
          value={centsToAmountInput(splitCents)}
          onChange={(e) => {
            const dollars = parseFloat(e.target.value);
            if (Number.isFinite(dollars)) {
              onSplitChange(Math.round(dollars * 100));
            } else {
              onSplitChange(0);
            }
          }}
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
                  ? "h-full bg-[var(--success)]"
                  : partial
                    ? "h-full bg-[var(--warning)]"
                    : "h-full bg-fg-muted/40"
              }
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono text-[12px] tabular-nums text-fg-muted">
            {formatMoney(sub.paidCents, currency)}
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
              ? "font-mono text-[12px] text-[var(--tint-rose-fg)]"
              : "font-mono text-[12px] text-fg-muted"
          }
        >
          {sub.dueAt ? formatCalendarDate(sub.dueAt, DATE_FORMATS.monthDay) : "—"}
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
