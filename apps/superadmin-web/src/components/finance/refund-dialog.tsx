"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Info, Loader2, Wallet } from "lucide-react";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/components/finance/money";
import { finance } from "@/lib/api/browser-api";

type RefundKind = "gateway" | "wallet";

export function RefundDialog({
  open,
  onClose,
  invoiceId,
  invoiceNumber,
  paidCents,
  currency,
  suggestedRefundCents,
  suggestedRefundLabel
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  invoiceNumber: string;
  paidCents: number;
  currency: string;
  /** Optional pro-rated suggestion from caller (e.g. games-remaining). */
  suggestedRefundCents?: number;
  /** Free-text explainer for how the suggestion was computed. */
  suggestedRefundLabel?: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<RefundKind>("gateway");
  const [amount, setAmount] = useState<string>(
    suggestedRefundCents
      ? (suggestedRefundCents / 100).toFixed(2)
      : (paidCents / 100).toFixed(2)
  );
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state each time the dialog opens.
  useEffect(() => {
    if (open) {
      setKind("gateway");
      setAmount(
        suggestedRefundCents
          ? (suggestedRefundCents / 100).toFixed(2)
          : (paidCents / 100).toFixed(2)
      );
      setReason("");
      setError(null);
    }
  }, [open, paidCents, suggestedRefundCents]);

  const amountCents = Math.round(parseFloat(amount || "0") * 100);
  const exceedsMax = amountCents > paidCents;
  const valid =
    amountCents > 0 && amountCents <= paidCents && reason.trim().length >= 10;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await finance.refundSplit(invoiceId, {
        cardAmountCents: kind === "gateway" ? amountCents : 0,
        walletAmountCents: kind === "wallet" ? amountCents : 0,
        reason: reason.trim(),
        currency
      });
      onClose();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Issue refund — ${invoiceNumber}`}
      description="Refund a portion or all of the collected amount. Reason is required and shown in the audit log."
    >
      <div className="space-y-4 text-[13px]">
        {/* Refund type toggle */}
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Refund type
          </p>
          <div className="grid grid-cols-2 gap-2">
            <KindButton
              icon={CreditCard}
              title="Gateway refund"
              subtitle="Back to original card"
              active={kind === "gateway"}
              onClick={() => setKind("gateway")}
            />
            <KindButton
              icon={Wallet}
              title="Wallet credit"
              subtitle="Instant — stays in SportsPulse"
              active={kind === "wallet"}
              onClick={() => setKind("wallet")}
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
              max={paidCents / 100}
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
            Max refundable: {formatMoney(paidCents, currency)} (amount paid)
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
              Gateway refunds to card take 5–7 business days. The player will
              receive an email confirmation.
            </span>
          ) : (
            <span>
              Wallet credit is instant and stays in SportsPulse for future
              registrations or fees. No bank-side delay.
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
  onClick
}: {
  icon: typeof CreditCard;
  title: string;
  subtitle: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex flex-col items-start gap-1 rounded-md border p-3 text-left transition",
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
