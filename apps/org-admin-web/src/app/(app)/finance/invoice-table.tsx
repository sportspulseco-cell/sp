"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { Badge, Button, Eyebrow, Field, Input } from "@sportspulse/ui";
import type { Invoice } from "@sportspulse/api-client";
import { orgAdminFinance } from "@/lib/api/browser-api";

type Method =
  | "cash"
  | "check"
  | "credit_card"
  | "etransfer"
  | "bank_transfer"
  | "manual";

const METHOD_OPTIONS: Array<{ value: Method; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "etransfer", label: "e-Transfer" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "credit_card", label: "Credit card" },
  { value: "manual", label: "Other" }
];

function fmt(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency
  }).format(cents / 100);
}

function statusTone(s: string): "success" | "warning" | "danger" | "neutral" | "info" {
  if (s === "paid") return "success";
  if (s === "overdue") return "danger";
  if (s === "void") return "neutral";
  if (s === "partially_paid") return "warning";
  return "info";
}

export function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (invoices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-1 px-5 py-6 text-[13px] text-fg-muted">
        No invoices to show yet. Once your seasons start collecting dues, the
        rows will land here.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <Eyebrow>// Invoices</Eyebrow>
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {invoices.length} loaded
        </span>
      </header>
      <ul className="divide-y divide-border">
        {invoices.map((inv) => (
          <li key={inv.id} className="px-5 py-3">
            <InvoiceRow
              invoice={inv}
              isOpen={openId === inv.id}
              onOpen={() => setOpenId(inv.id)}
              onClose={() => setOpenId(null)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function InvoiceRow({
  invoice,
  isOpen,
  onOpen,
  onClose
}: {
  invoice: Invoice;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const remaining = Math.max(0, invoice.totalCents - invoice.paidCents);
  const canRecord = invoice.status !== "void" && remaining > 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-fg-muted">
            {invoice.id.slice(0, 8)}
          </p>
          <p className="text-[12px] text-fg-muted">
            {fmt(invoice.totalCents, invoice.currency)} total ·{" "}
            <span className="text-fg">
              {fmt(invoice.paidCents, invoice.currency)} paid
            </span>
            {remaining > 0 ? (
              <>
                {" "}· {fmt(remaining, invoice.currency)} due
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge mono tone={statusTone(invoice.status as string)}>
            {(invoice.status as string).replace(/_/g, " ")}
          </Badge>
          {canRecord ? (
            isOpen ? (
              <Button size="sm" variant="outline" onClick={onClose}>
                <X className="h-3 w-3" strokeWidth={2} />
              </Button>
            ) : (
              <Button size="sm" onClick={onOpen}>
                Record payment
              </Button>
            )
          ) : null}
        </div>
      </div>
      {isOpen ? (
        <div className="mt-3">
          <RecordPaymentForm
            invoiceId={invoice.id}
            currency={invoice.currency}
            remainingCents={remaining}
            onDone={onClose}
          />
        </div>
      ) : null}
    </>
  );
}

function RecordPaymentForm({
  invoiceId,
  currency,
  remainingCents,
  onDone
}: {
  invoiceId: string;
  currency: string;
  remainingCents: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState((remainingCents / 100).toFixed(2));
  const [method, setMethod] = useState<Method>("etransfer");
  const [receivedAt, setReceivedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    const cents = Math.round(dollars * 100);
    if (cents > remainingCents) {
      setError(`Amount can't exceed ${fmt(remainingCents, currency)}.`);
      return;
    }
    setBusy(true);
    try {
      await orgAdminFinance.recordPayment(invoiceId, {
        amountCents: cents,
        method,
        receivedAt: receivedAt
          ? new Date(receivedAt).toISOString()
          : undefined,
        notes: notes.trim() || undefined
      });
      onDone();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-bg-subtle p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Amount"
          hint={`Up to ${fmt(remainingCents, currency)} remaining.`}
        >
          <Input
            value={amount}
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
          />
        </Field>
        <Field label="Method">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as Method)}
            disabled={busy}
            className="flex h-9 w-full rounded-md border border-border bg-surface-1 px-3 text-sm text-fg focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50"
          >
            {METHOD_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Received on" hint="Leave blank for now.">
          <Input
            type="date"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
            disabled={busy}
          />
        </Field>
        <Field label="Notes (optional)">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Check #1024"
            disabled={busy}
            maxLength={200}
          />
        </Field>
      </div>
      {error ? (
        <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-600 dark:text-red-300">
          {error}
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : null}
          Record payment
        </Button>
      </div>
    </div>
  );
}
