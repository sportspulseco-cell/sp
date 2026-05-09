"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@sportspulse/ui";
import { finance } from "@/lib/api/browser-api";

/**
 * Issue wallet credit form. Mirrors the mockup's "Issue wallet credit
 * (admin)" card: player display + amount + optional expiry + reason
 * (audit-required) + footer note + Issue credit button.
 *
 * Mutation calls finance.issueWalletCredit which creates the wallet
 * row if missing, bumps the balance, and appends a credit_issued
 * ledger entry — all in one DB transaction.
 */
export function WalletForm({
  personId,
  orgId,
  defaultCurrency
}: {
  personId: string;
  orgId: string;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [amountStr, setAmountStr] = useState("100.00");
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const cents = Math.round(Number.parseFloat(amountStr) * 100);
    if (Number.isNaN(cents) || cents <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    if (reason.trim().length < 10) {
      setError("Reason must be at least 10 characters (audit requirement).");
      return;
    }
    setBusy(true);
    try {
      await finance.issueWalletCredit({
        personId,
        orgId,
        amountCents: cents,
        currency: defaultCurrency,
        expiresAt: expiresAt ? new Date(expiresAt + "T00:00:00").toISOString() : null,
        reason: reason.trim()
      });
      setSuccess(true);
      setReason("");
      router.refresh();
    } catch (e2) {
      setError((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-border bg-surface-1 p-6"
    >
      <header className="border-b border-border pb-3">
        <p className="text-[16px] font-semibold tracking-tight text-fg">
          Issue wallet credit (admin)
        </p>
      </header>

      <Field label="Player" schemaTag="wallet_accounts.person_id">
        <input
          type="text"
          value={personId}
          readOnly
          disabled
          className="input cursor-not-allowed bg-bg-subtle font-mono text-fg-muted"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Credit amount ($)"
          schemaTag="wallet_ledger.amount_cents"
          required
        >
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className="input font-mono"
            required
          />
        </Field>
        <Field
          label="Expires (optional)"
          schemaTag="wallet_ledger.expires_at"
        >
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="input"
          />
        </Field>
      </div>

      <Field
        label="Reason"
        schemaTag="wallet_ledger.reason"
        required
        hint="Internal note — explain why this credit is being issued. Stored in audit trail."
      >
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
          placeholder="e.g. season carry-over from Spring 2025"
          className="input"
          required
        />
      </Field>

      <p className="text-[12px] text-fg-muted">
        Credit is applied atomically. Wallet balance can never go below
        $0.00. Player notified immediately via email and push.
      </p>

      {error ? (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
          Credit issued. The ledger entry is appended above and the balance reflects the new total.
        </p>
      ) : null}

      <div className="flex items-center border-t border-border pt-4">
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          <span className="font-mono text-[10px] uppercase tracking-widest">
            Issue credit
          </span>
        </Button>
      </div>

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
