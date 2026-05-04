"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Receipt } from "lucide-react";
import { finance } from "@/lib/api/browser-api";
import type { PaymentMethod } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const METHODS: PaymentMethod[] = [
  "cash",
  "check",
  "etransfer",
  "bank_transfer",
  "credit_card",
  "manual"
];

export function RecordPaymentForm({
  invoiceId,
  orgId,
  currency,
  defaultAmountCents
}: {
  invoiceId: string;
  orgId: string;
  currency: string;
  defaultAmountCents: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState((defaultAmountCents / 100).toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const cents = Math.round(parseFloat(amount) * 100);
      if (!Number.isFinite(cents) || cents <= 0)
        throw new Error("Amount must be > 0");
      await finance.recordPayment(invoiceId, {
        orgId,
        amountCents: cents,
        currency,
        method,
        status: "succeeded",
        notes: notes || null
      });
      setNotes("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Amount" htmlFor="pay-amount">
        <Input
          id="pay-amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <Field label="Method" htmlFor="pay-method">
        <Select
          id="pay-method"
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Notes"
        htmlFor="pay-notes"
        hint="Reference number, check #, etc. Optional."
      >
        <Input
          id="pay-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Check #1234 / etransfer ref"
        />
      </Field>

      {error ? (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Recording…
          </>
        ) : (
          <>
            <Receipt className="mr-2 h-4 w-4" /> Record payment
          </>
        )}
      </Button>
    </form>
  );
}
