"use client";

import { useState } from "react";
import {
  AlertOctagon,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  Mail,
  Wallet
} from "lucide-react";
import { Badge, Button, Eyebrow } from "@sportspulse/ui";
import { finance } from "@/lib/api/browser-api";

type Breakdown = Awaited<ReturnType<typeof finance.captainDuesBreakdown>>;
type SubInvoice = Breakdown["subInvoices"][number];

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
  const [busy, setBusy] = useState<"remind" | "cover" | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currency = data.subInvoices[0]?.currency ?? "USD";
  const outstanding = data.totalCents - data.collectedCents;
  const pct = data.totalCents
    ? Math.min(100, Math.round((data.collectedCents / data.totalCents) * 100))
    : 0;
  const unpaid = data.subInvoices.filter((s) => s.paidCents < s.totalCents);

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

  return (
    <div className="space-y-6">
      {/* Collection progress hero */}
      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <Eyebrow>// collection progress</Eyebrow>
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <span className="text-3xl font-semibold tabular-nums text-fg">
            {fmt(data.collectedCents, currency)}
          </span>
          <span className="font-mono text-[12px] uppercase tracking-widest text-fg-muted">
            of {fmt(data.totalCents, currency)} ({pct}%)
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-subtle">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-[12px] text-fg-muted">
          {unpaid.length} player{unpaid.length === 1 ? "" : "s"} outstanding ·{" "}
          {fmt(outstanding, currency)} remaining
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={remindAll}
            disabled={busy !== null || unpaid.length === 0}
          >
            {busy === "remind" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
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
            Cover outstanding
          </Button>
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

      {/* Per-player breakdown */}
      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <Eyebrow>// per-player breakdown</Eyebrow>
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {data.subInvoices.length} sub-invoice{data.subInvoices.length === 1 ? "" : "s"}
          </span>
        </header>
        <ul className="divide-y divide-border">
          {data.subInvoices.map((s) => (
            <PlayerRow key={s.id} sub={s} currency={currency} />
          ))}
          {data.subInvoices.length === 0 && (
            <li className="px-5 py-6 text-center text-[13px] text-fg-muted">
              No sub-invoices on file.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function PlayerRow({
  sub,
  currency
}: {
  sub: SubInvoice;
  currency: string;
}) {
  const owe = Math.max(0, sub.totalCents - sub.paidCents);
  const fullyPaid = owe === 0;
  const Icon = fullyPaid
    ? CheckCircle2
    : sub.paidCents > 0
      ? Wallet
      : AlertOctagon;
  return (
    <li className="grid grid-cols-1 gap-2 px-5 py-3 md:grid-cols-4 md:items-center">
      <div className="flex items-center gap-2">
        <Icon
          className={
            fullyPaid
              ? "h-4 w-4 text-emerald-600"
              : sub.paidCents > 0
                ? "h-4 w-4 text-amber-600"
                : "h-4 w-4 text-rose-600"
          }
        />
        <span className="font-medium text-fg">
          {sub.playerName ?? sub.recipientEmail ?? sub.id.slice(0, 8)}
        </span>
      </div>
      <div className="text-[12px] text-fg-muted">{sub.invoiceNumber}</div>
      <div className="font-mono tabular-nums text-[13px]">
        {fmt(sub.paidCents, currency)} / {fmt(sub.totalCents, currency)}
      </div>
      <div className="text-right">
        <Badge
          tone={
            fullyPaid
              ? "success"
              : sub.paidCents > 0
                ? "warning"
                : "danger"
          }
          mono
        >
          {fullyPaid ? "paid" : sub.paidCents > 0 ? "partial" : "unpaid"}
        </Badge>
      </div>
    </li>
  );
}
