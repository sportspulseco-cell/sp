"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Badge, Button } from "@sportspulse/ui";
import type { TeamInvoiceSplitWithPerson } from "@sportspulse/api-client";
import { finance } from "@/lib/api/browser-api";
import { fmtMoney, fullName, initials } from "../lib/format";
import { DEMO_MODE, mockCoverOutstandingPreview } from "../lib/mock-data";
import { DemoBadge } from "../lib/demo-badge";

/**
 * Per-player payment tracker. Mirrors the mockup's list:
 *   [JK] Johnny Kula [Captain]   $2,910 [progress] [status] [Remind]
 *
 * Only renders the unpaid/partial/overdue rows with a Remind action;
 * paid rows show the green Paid badge and no action.
 *
 * "Remind all unpaid" stamps last_reminder_at on each unpaid split via
 * one POST per row (the worker fans out the actual notifications).
 * "Cover outstanding" is a placeholder — wiring it requires a real
 * ledger move (admin pays the rest from org funds), out of scope here.
 */
export function DuesSplitClient({
  splits,
  currency,
  totalCents
}: {
  splits: TeamInvoiceSplitWithPerson[];
  currency: string;
  totalCents: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"none" | "all">("none");
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const equalShare = splits.length > 0 ? Math.round(totalCents / splits.length) : 0;

  async function remindAll() {
    setBusy("all");
    setError(null);
    try {
      const unpaid = splits.filter((s) => s.status !== "paid");
      await Promise.all(unpaid.map((s) => finance.remindSplit(s.id)));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("none");
    }
  }

  async function remindOne(id: string) {
    setBusyRow(id);
    setError(null);
    try {
      await finance.remindSplit(id);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyRow(null);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface-1">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <p className="text-[14px] font-semibold tracking-tight text-fg">
            Player payment tracker
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-fg-muted">
            Equal split · {fmtMoney(equalShare, currency)} per player
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={remindAll}
            disabled={busy === "all"}
          >
            {busy === "all" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            <span className="font-mono text-[10px] uppercase tracking-widest">
              Remind all unpaid
            </span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!DEMO_MODE}
            title={
              DEMO_MODE
                ? "Demo flow — preview the coverage amount + player count without writing anything"
                : "Coming soon — requires admin-funded coverage flow (see doc/deferred-integrations.md)"
            }
            onClick={() => {
              if (!DEMO_MODE) return;
              const preview = mockCoverOutstandingPreview(splits);
              window.alert(
                `Demo preview\n\nWould cover ${fmtMoney(preview.coveredCents, currency)} across ${preview.players} player${preview.players === 1 ? "" : "s"}.\n\nWiring requires the admin-funded coverage spec — see doc/deferred-integrations.md.`
              );
            }}
          >
            <span className="font-mono text-[10px] uppercase tracking-widest">
              Cover outstanding
            </span>
            {DEMO_MODE ? <DemoBadge label="demo" /> : null}
          </Button>
        </div>
      </header>

      {error ? (
        <div className="border-b border-border bg-rose-500/10 px-5 py-2 text-[12px] text-rose-700 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <ul className="divide-y divide-border">
        {splits.map((s) => {
          const name = fullName(
            s.player.legalFirstName,
            s.player.legalLastName,
            s.player.preferredName
          );
          const ini = initials(
            s.player.legalFirstName,
            s.player.legalLastName,
            s.player.preferredName
          );
          const pct =
            s.allocatedCents > 0
              ? Math.round((s.collectedCents / s.allocatedCents) * 100)
              : 0;
          const tone =
            s.status === "paid"
              ? "success"
              : s.status === "partial"
                ? "info"
                : s.status === "overdue"
                  ? "danger"
                  : "warning";
          const showRemind = s.status !== "paid";
          return (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-3 px-5 py-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-subtle font-mono text-[11px] font-semibold text-fg">
                {ini}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] text-fg truncate">{name}</p>
                  {s.isCaptain ? <Badge mono tone="success">Captain</Badge> : null}
                </div>
              </div>
              <p className="font-mono text-[13px] tabular-nums text-fg">
                {fmtMoney(s.allocatedCents, currency)}
              </p>
              <div className="hidden h-2 w-32 overflow-hidden rounded-full bg-bg-subtle sm:block">
                <div
                  className={`h-full ${
                    s.status === "paid"
                      ? "bg-emerald-500"
                      : s.status === "partial"
                        ? "bg-blue-500"
                        : s.status === "overdue"
                          ? "bg-rose-500"
                          : "bg-amber-500"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <Badge mono tone={tone}>
                {s.status}
              </Badge>
              {showRemind ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remindOne(s.id)}
                  disabled={busyRow === s.id}
                >
                  {busyRow === s.id ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : null}
                  <span className="font-mono text-[10px] uppercase tracking-widest">
                    Remind
                  </span>
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
