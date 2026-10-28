"use client";

import { centsToAmountInput } from "@sportspulse/kernel";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Loader2 } from "lucide-react";
import { Alert, Badge, Button, Select, Input } from "@sportspulse/ui";
import type { InvoiceRefundable, Refund } from "@sportspulse/api-client";
import { finance } from "@/lib/api/browser-api";
import { fmtMoney, fmtDate } from "../lib/format";

type Destination = "card" | "wallet";

function newKey(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `refund-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Issue refund or credit form (Payments > Refund tab). Same command as
 * the invoice page's Issue refund dialog: finance.refundSplit, which
 * refunds through the payment processor or credits the wallet, lowers
 * the invoice total and paid amount, and refuses anything above what is
 * still refundable (MON-9). Limits come from the server.
 *
 * "Adjustment (audit only)" was removed: it wrote a refund row with no
 * money movement and no effect on the invoice.
 */
export function RefundForm({
  invoiceId,
  invoiceNumber,
  paidCents,
  refundable,
  currency,
  playerLabel,
  cardOnFileBrand,
  cardOnFileLast4,
  existingRefunds
}: {
  invoiceId: string;
  invoiceNumber: string;
  paidCents: number;
  refundable: InvoiceRefundable;
  currency: string;
  playerLabel: string;
  cardOnFileBrand: string | null;
  cardOnFileLast4: string | null;
  existingRefunds: Refund[];
}) {
  const router = useRouter();
  const defaultDest: Destination = refundable.cardCents > 0 ? "card" : "wallet";
  const maxFor = (d: Destination) =>
    d === "card" ? refundable.cardCents : refundable.totalCents;
  const [dest, setDest] = useState<Destination>(defaultDest);
  const [amountStr, setAmountStr] = useState(centsToAmountInput(maxFor(defaultDest)));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // One key per refund attempt; kept across retries, renewed after success.
  const [idemKey, setIdemKey] = useState<string>(newKey);
  const maxRefundableCents = maxFor(dest);

  const amountCents = useMemo(() => {
    const parsed = Number.parseFloat(amountStr);
    if (Number.isNaN(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100);
  }, [amountStr]);

  const banner = useMemo(() => {
    if (dest === "card") {
      const card = cardOnFileLast4
        ? `${cardOnFileBrand ?? "Card"} ending ${cardOnFileLast4}`
        : "the card the invoice was paid with";
      return `Sent back to ${card} through the payment processor. While the league is testing, payments run on a test processor and no real card is refunded. The player gets a refund notice.`;
    }
    return "Added to the player's SportsPulse wallet for this organization right away. The player gets a refund notice.";
  }, [dest, cardOnFileBrand, cardOnFileLast4]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
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
      const res = await finance.refundSplit(
        invoiceId,
        {
          cardAmountCents: dest === "card" ? amountCents : 0,
          walletAmountCents: dest === "wallet" ? amountCents : 0,
          reason: reason.trim()
        },
        idemKey
      );
      setSuccess(
        `Refunded ${fmtMoney(amountCents, currency)}. ${res.invoiceNumber} now shows ${fmtMoney(res.paidCents, currency)} paid.`
      );
      setIdemKey(newKey());
      setReason("");
      router.refresh();
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
            {refundable.refundedCents > 0
              ? ` · ${fmtMoney(refundable.refundedCents, currency)} refunded`
              : ""}
          </p>
        </header>

        <div className="mt-4 space-y-4">
          <Field label="Refund to" required>
            <Select
              value={dest}
              onChange={(e) => {
                const d = e.target.value as Destination;
                setDest(d);
                if (amountCents > maxFor(d)) setAmountStr(centsToAmountInput(maxFor(d)));
              }}
            >
              <option value="card" disabled={refundable.cardCents === 0}>
                {refundable.cardCents > 0
                  ? "The card it was paid with"
                  : "The card it was paid with (no card payment on this invoice)"}
              </option>
              <option value="wallet">SportsPulse wallet credit</option>
            </Select>
          </Field>

          <Field
            label="Refund amount ($)"
            required
            hint={`Maximum refundable: ${fmtMoney(maxRefundableCents, currency)}`}
          >
            <Input
              type="number"
              min="0.01"
              step="0.01"
              max={centsToAmountInput(maxRefundableCents)}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              required
              className="font-mono"
            />
          </Field>

          <Field
            label="Reason"
            required
            hint="Required. Document the reason for this refund (min 10 characters). Stored in audit trail."
          >
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
              placeholder="e.g. season cancelled, full refund per league policy."
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
            <Alert tone="error">
              {error}
            </Alert>
          ) : null}
          {success ? (
            <Alert tone="success" role="status">
              {success}
            </Alert>
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
                setDest(defaultDest);
                setAmountStr(centsToAmountInput(maxFor(defaultDest)));
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
            Refund history
          </p>
          <ul className="mt-3 divide-y divide-border">
            {existingRefunds.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-fg">
                    {r.refundType === "wallet_credit"
                      ? "wallet credit"
                      : r.refundType === "adjustment"
                        ? "adjustment"
                        : "to card"}{" "}
                    · {fmtMoney(r.amountCents, r.currency)}
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
  hint,
  required,
  children
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="font-mono text-[11px] uppercase tracking-widest text-fg">
        {label}
        {required ? <span className="ml-1 text-rose-500">*</span> : null}
      </label>
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
