"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Gavel, Loader2, X } from "lucide-react";
import { Badge, Button, Eyebrow, Field, Input } from "@sportspulse/ui";
import { orgAdminRefundAssessments } from "@/lib/api/browser-api";

type Status =
  | "pending"
  | "resolved_refund"
  | "resolved_no_refund"
  | "void"
  | "all";

type Decision = "refund" | "no_refund" | "void";

interface Item {
  id: string;
  orgId: string;
  teamId: string;
  teamName: string;
  seasonId: string;
  seasonName: string;
  personId: string;
  personFirstName: string | null;
  personLastName: string | null;
  invoiceId: string | null;
  sourceEvent: string;
  paidCents: number;
  currency: string;
  status: string;
  decisionNotes: string | null;
  refundAmountCents: number;
  resolvedAt: string | null;
  createdAt: string;
}

function fmt(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency
  }).format(cents / 100);
}

function statusTone(s: string): "warning" | "success" | "neutral" | "danger" {
  switch (s) {
    case "pending":
      return "warning";
    case "resolved_refund":
      return "success";
    case "resolved_no_refund":
      return "neutral";
    case "void":
      return "danger";
    default:
      return "neutral";
  }
}

const TABS: Array<{ value: Status; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "resolved_refund", label: "Refunded" },
  { value: "resolved_no_refund", label: "Declined" },
  { value: "void", label: "Voided" },
  { value: "all", label: "All" }
];

export function DisputesScreen({
  orgId,
  status,
  initialItems
}: {
  orgId: string;
  status: Status;
  initialItems: Item[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  function changeTab(next: Status) {
    const url = next === "pending" ? "/disputes" : `/disputes?status=${next}`;
    startTransition(() => router.replace(url));
  }

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-1.5 border-b border-border pb-3">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => changeTab(t.value)}
            className={
              "rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest transition-colors " +
              (status === t.value
                ? "bg-fg text-bg"
                : "text-fg-muted hover:bg-surface-2 hover:text-fg")
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {initialItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-1 px-5 py-8">
          <div className="flex items-start gap-3">
            <Gavel className="h-5 w-5 text-fg-muted" strokeWidth={1.75} />
            <div>
              <p className="text-[13px] font-medium text-fg">
                {status === "pending"
                  ? "No pending disputes — nice."
                  : "No items match this filter."}
              </p>
              <p className="mt-1 text-[12px] text-fg-muted">
                {status === "pending"
                  ? "When a player gets dropped from a paid roster or a team's division application is rejected, a row will queue here for you to adjudicate."
                  : "Try a different tab."}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {initialItems.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-border bg-surface-1 p-4"
            >
              <DisputeRow
                item={item}
                isResolving={resolvingId === item.id}
                onOpenResolve={() => setResolvingId(item.id)}
                onCloseResolve={() => setResolvingId(null)}
                onResolved={() => {
                  setResolvingId(null);
                  startTransition(() => router.refresh());
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DisputeRow({
  item,
  isResolving,
  onOpenResolve,
  onCloseResolve,
  onResolved
}: {
  item: Item;
  isResolving: boolean;
  onOpenResolve: () => void;
  onCloseResolve: () => void;
  onResolved: () => void;
}) {
  const playerName =
    [item.personFirstName, item.personLastName].filter(Boolean).join(" ") ||
    item.personId.slice(0, 8);
  const isPending = item.status === "pending";

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>// {item.sourceEvent.replace(/_/g, " ")}</Eyebrow>
          <p className="mt-1 text-sm font-medium text-fg">{playerName}</p>
          <p className="text-[12px] text-fg-muted">
            {item.teamName} · {item.seasonName}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge mono tone={statusTone(item.status)}>
            {item.status.replace(/_/g, " ")}
          </Badge>
          <p className="font-mono text-xs tabular-nums text-fg">
            paid {fmt(item.paidCents, item.currency)}
          </p>
          {item.refundAmountCents > 0 ? (
            <p className="font-mono text-[11px] tabular-nums text-emerald-600 dark:text-emerald-300">
              refund {fmt(item.refundAmountCents, item.currency)}
            </p>
          ) : null}
        </div>
      </header>

      {item.decisionNotes ? (
        <div className="rounded-md border border-border bg-surface-2/40 px-3 py-2 text-[12px] text-fg-muted">
          {item.decisionNotes}
        </div>
      ) : null}

      {isPending ? (
        isResolving ? (
          <ResolveForm
            item={item}
            onCancel={onCloseResolve}
            onResolved={onResolved}
          />
        ) : (
          <div className="flex justify-end">
            <Button size="sm" onClick={onOpenResolve}>
              Resolve
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}

function ResolveForm({
  item,
  onCancel,
  onResolved
}: {
  item: Item;
  onCancel: () => void;
  onResolved: () => void;
}) {
  const [decision, setDecision] = useState<Decision>("refund");
  const [refundDollars, setRefundDollars] = useState(
    (item.paidCents / 100).toFixed(2)
  );
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (notes.trim().length < 10) {
      setError("Add decision notes (at least 10 characters).");
      return;
    }
    let refundAmountCents: number | undefined;
    if (decision === "refund") {
      const dollars = Number(refundDollars);
      if (!Number.isFinite(dollars) || dollars <= 0) {
        setError("Refund amount must be a positive number.");
        return;
      }
      refundAmountCents = Math.round(dollars * 100);
      if (refundAmountCents > item.paidCents) {
        setError("Refund amount can't exceed the amount paid.");
        return;
      }
    }
    setBusy(true);
    try {
      await orgAdminRefundAssessments.resolve(item.id, {
        decision,
        refundAmountCents,
        decisionNotes: notes.trim()
      });
      onResolved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-bg-subtle p-4">
      <div className="mb-3 flex items-center justify-between">
        <Eyebrow>// Adjudicate</Eyebrow>
        <button
          type="button"
          onClick={onCancel}
          className="text-fg-muted hover:text-fg"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      <div className="space-y-3">
        <Field label="Decision">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { v: "refund", label: "Refund" },
                { v: "no_refund", label: "No refund" },
                { v: "void", label: "Void" }
              ] as const
            ).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setDecision(opt.v)}
                disabled={busy}
                className={
                  "rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors " +
                  (decision === opt.v
                    ? "border-accent bg-accent/10 text-fg"
                    : "border-border text-fg-muted hover:border-border-strong hover:text-fg")
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        {decision === "refund" ? (
          <Field
            label="Refund amount"
            hint={`Max ${fmt(item.paidCents, item.currency)} (amount the player paid).`}
          >
            <Input
              value={refundDollars}
              inputMode="decimal"
              disabled={busy}
              onChange={(e) => setRefundDollars(e.target.value)}
            />
          </Field>
        ) : null}

        <Field
          label="Decision notes"
          hint="Why this outcome. Visible in audit + on the assessment record."
        >
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            disabled={busy}
            className="flex w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="e.g. Player was dropped at week 3; pro-rating returns 60% of paid dues per policy."
          />
        </Field>

        {error ? (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-600 dark:text-red-300">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            ) : null}
            Submit decision
          </Button>
        </div>
      </div>
    </div>
  );
}
