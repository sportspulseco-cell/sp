"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Loader2 } from "lucide-react";
import { Badge, Button } from "@sportspulse/ui";
import type { Refund, RefundType } from "@sportspulse/api-client";
import { finance } from "@/lib/api/browser-api";
import { fmtMoney, fmtDate } from "../lib/format";

const REFUND_TYPES: { value: RefundType; label: string }[] = [
  { value: "full_original", label: "Full refund to original payment method (Stripe)" },
  { value: "partial_original", label: "Partial refund to original payment method (Stripe)" },
  { value: "wallet_credit", label: "Issue as SportsPulse wallet credit" },
  { value: "adjustment", label: "Adjustment (no money movement, audit only)" }
];

/**
 * Issue refund or credit form. Mirrors the mockup line-for-line:
 *   - Refund type (dropdown)
 *   - Refund amount + max refundable hint
 *   - Reason (required, ≥10 chars, audit-trail copy)
 *   - Info banner that updates with the chosen refund type
 *   - Confirm refund / Cancel buttons
 *
 * On submit calls finance.issueRefund. wallet_credit + adjustment land
 * as status=succeeded immediately; original-payment refunds enter
 * status=pending and the worker flips them when Stripe acknowledges.
 */
export function RefundForm({
  invoiceId,
  invoiceNumber,
  paidCents,
  maxRefundableCents,
  currency,
  playerLabel,
  cardOnFileBrand,
  cardOnFileLast4,
  existingRefunds
}: {
  invoiceId: string;
  invoiceNumber: string;
  paidCents: number;
  maxRefundableCents: number;
  currency: string;
  playerLabel: string;
  cardOnFileBrand: string | null;
  cardOnFileLast4: string | null;
  existingRefunds: Refund[];
}) {
  const router = useRouter();
  const [refundType, setRefundType] = useState<RefundType>("full_original");
  const [amountStr, setAmountStr] = useState((maxRefundableCents / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const amountCents = useMemo(() => {
    const parsed = Number.parseFloat(amountStr);
    if (Number.isNaN(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100);
  }, [amountStr]);

  const banner = useMemo(() => {
    switch (refundType) {
      case "full_original":
      case "partial_original":
        return cardOnFileLast4
          ? `Refund will be sent to original payment method (${cardOnFileBrand ?? "Card"} ending ${cardOnFileLast4}). Processing: instant for cards, 5–7 business days for ACH. QuickBooks credit memo will be created automatically.`
          : "Refund will be sent to the original payment method as recorded on the invoice's payments. Processing: instant for cards, 5–7 business days for ACH. QuickBooks credit memo will be created automatically.";
      case "wallet_credit":
        return "Refund will be issued as a SportsPulse wallet credit on the player's account. Wallet credits never expire unless an expiry is set on the entry. No external gateway involved.";
      case "adjustment":
        return "Adjustment-only refund — records the audit row without any money movement. Use when the original payment was never collected (offline write-off).";
    }
  }, [refundType, cardOnFileBrand, cardOnFileLast4]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (reason.trim().length < 10) {
      setError("Reason must be at least 10 characters (audit requirement).");
      return;
    }
    if (amountCents <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    if (amountCents > maxRefundableCents) {
      setError(
        `Amount exceeds maximum refundable (${fmtMoney(maxRefundableCents, currency)}).`
      );
      return;
    }

    setBusy(true);
    try {
      await finance.issueRefund({
        invoiceId,
        refundType,
        amountCents,
        reason: reason.trim()
      });
      setSuccess(true);
      router.refresh();
      setReason("");
    } catch (e2) {
      setError((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="rounded-xl border border-border bg-surface-1 p-6">
        <header className="border-b border-border pb-3">
          <p className="text-[16px] font-semibold tracking-tight text-fg">
            Issue refund or credit
          </p>
          <p className="mt-1 font-mono text-[11px] text-fg-muted">
            {invoiceNumber}
            {playerLabel ? ` · ${playerLabel}` : ""} · {fmtMoney(paidCents, currency)} paid
          </p>
        </header>

        <div className="mt-4 space-y-4">
          <Field
            label="Refund type"
            schemaTag="refunds.refund_type"
            required
          >
            <select
              value={refundType}
              onChange={(e) => setRefundType(e.target.value as RefundType)}
              className="input"
            >
              {REFUND_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Refund amount ($)"
            schemaTag="refunds.amount_cents"
            required
            hint={`Maximum refundable: ${fmtMoney(maxRefundableCents, currency)}`}
          >
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={(maxRefundableCents / 100).toFixed(2)}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="input font-mono"
              required
            />
          </Field>

          <Field
            label="Reason"
            schemaTag="refunds.reason"
            required
            hint="Required — document the reason for this refund (min 10 characters). Stored in audit trail."
          >
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
              placeholder="e.g. season cancelled — full refund per league policy."
              className="input"
              required
            />
            <p className="mt-1 text-right font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              {reason.length}/2000
            </p>
          </Field>

          <div className="flex items-start gap-3 rounded-md border border-blue-500/30 bg-blue-500/10 p-4 text-blue-800 dark:text-blue-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
            <p className="text-[12px]">{banner}</p>
          </div>

          {error ? (
            <p className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
              Refund recorded. Status will flip to succeeded once the gateway acknowledges.
            </p>
          ) : null}

          <div className="flex items-center gap-2 border-t border-border pt-4">
            <Button type="submit" disabled={busy || maxRefundableCents <= 0}>
              {busy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              <span className="font-mono text-[10px] uppercase tracking-widest">
                Confirm refund
              </span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setRefundType("full_original");
                setAmountStr((maxRefundableCents / 100).toFixed(2));
                setReason("");
                setError(null);
              }}
              disabled={busy}
            >
              <span className="font-mono text-[10px] uppercase tracking-widest">
                Cancel
              </span>
            </Button>
          </div>
        </div>
      </section>

      {existingRefunds.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface-1 p-6">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            // Refund history
          </p>
          <ul className="mt-3 divide-y divide-border">
            {existingRefunds.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-fg">
                    {r.refundType.replace(/_/g, " ")} ·{" "}
                    {fmtMoney(r.amountCents, r.currency)}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    {fmtDate(r.createdAt)}
                  </p>
                </div>
                <Badge mono tone={refundTone(r.status)}>
                  {r.status}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <FieldStyle />
    </form>
  );
}

function Field({
  label,
  schemaTag,
  hint,
  required,
  children
}: {
  label: string;
  schemaTag?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="font-mono text-[11px] uppercase tracking-widest text-fg">
          {label}
          {required ? <span className="ml-1 text-rose-500">*</span> : null}
        </label>
        {schemaTag ? (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-accent">
            {schemaTag}
          </span>
        ) : null}
      </div>
      {children}
      {hint ? <p className="text-[11px] text-fg-muted">{hint}</p> : null}
    </div>
  );
}

function FieldStyle() {
  return (
    <style>{`
      .input {
        height: 2.5rem;
        width: 100%;
        border-radius: 0.375rem;
        border: 1px solid var(--border);
        background: var(--surface-1);
        padding: 0 0.75rem;
        color: var(--fg);
        font-size: 13px;
      }
      .input:focus { outline: none; border-color: var(--accent); }
      textarea.input { height: auto; padding: 0.5rem 0.75rem; }
    `}</style>
  );
}

function refundTone(
  status: string
): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "succeeded") return "success";
  if (status === "pending") return "warning";
  if (status === "failed") return "danger";
  if (status === "cancelled") return "neutral";
  return "info";
}
