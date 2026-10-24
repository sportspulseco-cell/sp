"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Info, Loader2, Wallet } from "lucide-react";
import type { InvoiceRefundable } from "@sportspulse/api-client";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/components/finance/money";
import { finance } from "@/lib/api/browser-api";

type RefundKind = "gateway" | "wallet";

function newKey(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `refund-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Issue a refund on one invoice (UC-17, MON-9). The limits come from the
 * server (`refundable`), never from paid_cents on the client. One
 * idempotency key per opening of the dialog, so a double click or a
 * retry after a network error cannot refund twice.
 */
export function RefundDialog({
  open,
  onClose,
  invoiceId,
  invoiceNumber,
  refundable,
  currency,
  suggestedRefundCents,
  suggestedRefundLabel
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  invoiceNumber: string;
  refundable: InvoiceRefundable;
  currency: string;
  /** Optional pro-rated suggestion from caller (e.g. games-remaining). */
  suggestedRefundCents?: number;
  /** Free-text explainer for how the suggestion was computed. */
  suggestedRefundLabel?: string;
}) {
  const router = useRouter();
  const defaultKind: RefundKind = refundable.cardCents > 0 ? "gateway" : "wallet";
  const maxFor = (k: RefundKind) =>
    k === "gateway" ? refundable.cardCents : refundable.totalCents;
  const startAmount = (k: RefundKind) =>
    (
      (suggestedRefundCents != null
        ? Math.min(suggestedRefundCents, maxFor(k))
        : maxFor(k)) / 100
    ).toFixed(2);

  const [kind, setKind] = useState<RefundKind>(defaultKind);
  const [amount, setAmount] = useState<string>(startAmount(defaultKind));
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idemKey, setIdemKey] = useState<string>(newKey);

  // Reset each time the dialog opens; a new opening is a new refund.
  useEffect(() => {
    if (open) {
      setKind(defaultKind);
      setAmount(startAmount(defaultKind));
      setReason("");
      setError(null);
      setIdemKey(newKey());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refundable.cardCents, refundable.totalCents, suggestedRefundCents]);

  const max = maxFor(kind);
  const amountCents = Math.round(parseFloat(amount || "0") * 100);
  const exceedsMax = amountCents > max;
  const valid = amountCents > 0 && !exceedsMax && reason.trim().length >= 10;

  function pick(k: RefundKind) {
    setKind(k);
    if (amountCents > maxFor(k)) setAmount((maxFor(k) / 100).toFixed(2));
  }

  async function submit() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await finance.refundSplit(
        invoiceId,
        {
          cardAmountCents: kind === "gateway" ? amountCents : 0,
          walletAmountCents: kind === "wallet" ? amountCents : 0,
          reason: reason.trim()
        },
        idemKey
      );
      onClose();
      router.refresh();
    } catch (e) {
      // The key stays the same on retry: if the first attempt did land,
      // the server returns it instead of refunding again.
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Issue refund: ${invoiceNumber}`}
      description="Give back part or all of what was paid. The refunded amount comes off the invoice, so the player is not asked for it again."
    >
      <div className="space-y-4 text-[13px]">
        {/* Refund destination */}
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Refund to
          </p>
          <div className="grid grid-cols-2 gap-2">
            <KindButton
              icon={CreditCard}
              title="Card"
              subtitle={
                refundable.cardCents > 0
                  ? `Up to ${formatMoney(refundable.cardCents, currency)} paid by card`
                  : "No card payment on this invoice"
              }
              active={kind === "gateway"}
              disabled={refundable.cardCents === 0}
              onClick={() => pick("gateway")}
            />
            <KindButton
              icon={Wallet}
              title="Wallet credit"
              subtitle="Player can spend it on another invoice"
              active={kind === "wallet"}
              onClick={() => pick("wallet")}
            />
          </div>
        </div>

        {/* Amount */}
        <label className="block space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Refund amount
          </span>
          <div className="flex h-10 items-center gap-2 rounded-md border border-border bg-bg px-3 focus-within:border-accent">
            <span className="text-fg-muted">$</span>
            <input
              type="number"
              min={0}
              max={max / 100}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 bg-transparent text-fg outline-none"
            />
          </div>
          <p
            className={
              "text-[11px] " +
              (exceedsMax
                ? "text-rose-600 dark:text-rose-400"
                : "text-fg-muted")
            }
          >
            Max refundable{kind === "gateway" ? " to card" : ""}:{" "}
            {formatMoney(max, currency)}
            {refundable.refundedCents > 0
              ? ` (${formatMoney(refundable.refundedCents, currency)} already refunded)`
              : ""}
          </p>
        </label>

        {/* Pro-rated suggestion */}
        {suggestedRefundCents != null && (
          <div className="rounded-md border border-border bg-bg-subtle/60 p-3 text-[12px] text-fg-muted">
            <p className="font-mono text-fg">
              Pro-rated:{" "}
              <span className="text-accent">
                {formatMoney(suggestedRefundCents, currency)}
              </span>
            </p>
            {suggestedRefundLabel && (
              <p className="mt-1">{suggestedRefundLabel}</p>
            )}
            <p className="mt-1">
              Using override:{" "}
              <span className="text-fg">{formatMoney(amountCents, currency)}</span>
            </p>
          </div>
        )}

        {/* Reason */}
        <label className="block space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Reason <span className="text-rose-500">*</span> (min 10 chars)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Player dropped mid-season, pro-rated refund with admin override"
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-fg focus:border-accent focus:outline-none"
          />
        </label>

        {/* Info banner */}
        <div className="flex items-start gap-2 rounded-md border border-border bg-bg-subtle/40 px-3 py-2 text-[12px] text-fg-muted">
          <Info className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          {kind === "gateway" ? (
            <span>
              Sent back through the payment processor. While the league is
              testing, payments run on a test processor and no real card is
              refunded. The player gets a refund notice.
            </span>
          ) : (
            <span>
              Added to the player&apos;s SportsPulse wallet for this
              organisation right away. The player gets a refund notice.
            </span>
          )}
        </div>

        {error && (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </div>

      <DialogActions>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!valid || busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            `Issue refund of ${formatMoney(amountCents, currency)}`
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function KindButton({
  icon: Icon,
  title,
  subtitle,
  active,
  disabled,
  onClick
}: {
  icon: typeof CreditCard;
  title: string;
  subtitle: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={[
        "flex flex-col items-start gap-1 rounded-md border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "border-accent bg-accent/5"
          : "border-border bg-bg hover:border-fg-muted"
      ].join(" ")}
    >
      <span className="flex items-center gap-2 text-[13px] font-medium text-fg">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        {title}
      </span>
      <span className="text-[11px] text-fg-muted">{subtitle}</span>
    </button>
  );
}
