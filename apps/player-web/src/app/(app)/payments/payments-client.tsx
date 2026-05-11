"use client";

import { useState } from "react";
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  RefreshCw,
  Wallet
} from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  Eyebrow
} from "@sportspulse/ui";
import { finance } from "@/lib/api/browser-api";

type Wallet = Awaited<ReturnType<typeof finance.myWallet>>;
type Invoices = Awaited<ReturnType<typeof finance.myInvoices>>;
type Invoice = Invoices["items"][number];
type Installment = Invoice["installments"][number];

function fmt(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency
  }).format(cents / 100);
}

export function PaymentsClient({
  initial
}: {
  initial: { wallet: Wallet; invoices: Invoices };
}) {
  const [wallet, setWallet] = useState<Wallet>(initial.wallet);
  const [invoices, setInvoices] = useState<Invoices>(initial.invoices);
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);
  const [retryTarget, setRetryTarget] = useState<{
    inv: Invoice;
    ins: Installment;
  } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function refresh() {
    try {
      const [w, i] = await Promise.all([
        finance.myWallet(),
        finance.myInvoices()
      ]);
      setWallet(w);
      setInvoices(i);
    } catch (e) {
      console.error(e);
    }
  }

  const totalBalance = wallet.accounts.reduce(
    (a, w) => a + w.balanceCents,
    0
  );
  const open = invoices.items.filter(
    (i) => i.status !== "void" && i.totalCents > i.paidCents
  );
  const closed = invoices.items.filter(
    (i) => i.status === "paid" || i.status === "void"
  );

  return (
    <div className="space-y-6">
      {flash && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {flash}
        </p>
      )}

      {/* Wallet card */}
      {wallet.accounts.length > 0 && (
        <section className="rounded-2xl bg-gradient-to-br from-[#0C447C] to-[#185FA5] p-6 text-white">
          <Eyebrow className="text-white/70">// wallet credit</Eyebrow>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[28px] font-semibold tabular-nums">
                {fmt(totalBalance, wallet.accounts[0]?.currency ?? "USD")}
              </p>
              <p className="mt-1 text-[12px] text-white/70">
                Available across {wallet.accounts.length} account
                {wallet.accounts.length === 1 ? "" : "s"}. Apply to any
                outstanding invoice.
              </p>
            </div>
            <Wallet className="h-8 w-8 text-white/60" strokeWidth={1.5} />
          </div>
        </section>
      )}

      {/* Open invoices */}
      {open.length > 0 && (
        <section className="space-y-3">
          <Eyebrow>// open invoices</Eyebrow>
          {open.map((inv) => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              wallet={wallet}
              onPay={() => setPayTarget(inv)}
              onRetry={(ins) => setRetryTarget({ inv, ins })}
            />
          ))}
        </section>
      )}

      {/* Closed invoices */}
      {closed.length > 0 && (
        <section className="space-y-3">
          <Eyebrow>// history</Eyebrow>
          <div className="rounded-xl border border-border bg-surface-1">
            <ul className="divide-y divide-border">
              {closed.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between px-5 py-3 text-[13px]">
                  <span className="font-mono text-fg">{inv.invoiceNumber}</span>
                  <span className="font-mono tabular-nums text-fg-muted">
                    {fmt(inv.totalCents, inv.currency)}
                  </span>
                  <Badge tone={inv.status === "paid" ? "success" : "neutral"} mono>
                    {inv.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <PayDialog
        invoice={payTarget}
        wallet={wallet}
        onClose={() => setPayTarget(null)}
        onPaid={async (msg) => {
          setPayTarget(null);
          setFlash(msg);
          await refresh();
        }}
      />

      <RetryDialog
        target={retryTarget}
        onClose={() => setRetryTarget(null)}
        onResult={async (msg) => {
          setRetryTarget(null);
          setFlash(msg);
          await refresh();
        }}
      />
    </div>
  );
}

function InvoiceCard({
  invoice,
  wallet: _wallet,
  onPay,
  onRetry
}: {
  invoice: Invoice;
  wallet: Wallet;
  onPay: () => void;
  onRetry: (ins: Installment) => void;
}) {
  const outstanding = Math.max(0, invoice.totalCents - invoice.paidCents);
  const overdue = invoice.status === "overdue";
  const failedInstallments = invoice.installments.filter(
    (i) => i.status === "failed"
  );

  return (
    <div className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <p className="font-mono text-[12px] text-fg">{invoice.invoiceNumber}</p>
          {invoice.dueAt && (
            <p className="text-[11px] text-fg-muted">
              Due {new Date(invoice.dueAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <Badge tone={overdue ? "danger" : invoice.status === "partial" ? "warning" : "info"} mono>
          {invoice.status}
        </Badge>
      </header>

      <div className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-2 md:items-center">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            outstanding
          </p>
          <p className="mt-1 font-mono text-[22px] font-semibold tabular-nums text-fg">
            {fmt(outstanding, invoice.currency)}
          </p>
          <p className="mt-1 text-[12px] text-fg-muted">
            {fmt(invoice.paidCents, invoice.currency)} paid of{" "}
            {fmt(invoice.totalCents, invoice.currency)}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {outstanding > 0 && (
            <Button onClick={onPay}>
              <CreditCard className="mr-2 h-4 w-4" /> Pay
            </Button>
          )}
        </div>
      </div>

      {failedInstallments.length > 0 && (
        <div className="border-t border-border bg-rose-500/5 px-5 py-3">
          <div className="flex items-center gap-2 text-[12px] text-rose-700 dark:text-rose-300">
            <AlertOctagon className="h-4 w-4" />
            <span className="font-medium">
              {failedInstallments.length} failed installment
              {failedInstallments.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {failedInstallments.map((ins) => (
              <li
                key={ins.id}
                className="flex items-center justify-between text-[12px]"
              >
                <span className="text-fg">
                  Installment {ins.installmentNumber}:{" "}
                  {fmt(ins.amountCents, invoice.currency)} ·{" "}
                  <span className="text-rose-600 dark:text-rose-400">
                    {ins.lastError ?? "card declined"}
                  </span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => onRetry(ins)}>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {invoice.installments.length > 0 && (
        <div className="border-t border-border px-5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            // installment timeline
          </p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {invoice.installments.map((ins) => {
              const Icon =
                ins.status === "succeeded"
                  ? CheckCircle2
                  : ins.status === "failed"
                    ? AlertOctagon
                    : Clock;
              return (
                <li
                  key={ins.id}
                  className="flex items-center gap-1.5 text-[12px]"
                >
                  <Icon
                    className={
                      ins.status === "succeeded"
                        ? "h-3.5 w-3.5 text-emerald-600"
                        : ins.status === "failed"
                          ? "h-3.5 w-3.5 text-rose-600"
                          : "h-3.5 w-3.5 text-fg-muted"
                    }
                  />
                  <span className="text-fg">
                    #{ins.installmentNumber} · {fmt(ins.amountCents, invoice.currency)}
                  </span>
                  {ins.dueDate && (
                    <span className="font-mono text-[10px] text-fg-muted">
                      {new Date(ins.dueDate).toLocaleDateString()}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function PayDialog({
  invoice,
  wallet,
  onClose,
  onPaid
}: {
  invoice: Invoice | null;
  wallet: Wallet;
  onClose: () => void;
  onPaid: (msg: string) => void;
}) {
  const [walletAmount, setWalletAmount] = useState<string>("");
  const [mockOutcome, setMockOutcome] = useState<"succeeded" | "failed">(
    "succeeded"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!invoice) return null;

  const outstanding = Math.max(0, invoice.totalCents - invoice.paidCents);
  const walletForOrg = wallet.accounts.find(
    (a) => a.orgId === invoice.orgId && a.currency === invoice.currency
  );
  const walletAvailable = walletForOrg?.balanceCents ?? 0;
  const walletParsed = Math.round(parseFloat(walletAmount || "0") * 100);
  const walletApplied = Number.isFinite(walletParsed)
    ? Math.max(0, Math.min(walletParsed, walletAvailable, outstanding))
    : 0;
  const cardCharge = outstanding - walletApplied;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await finance.payInvoice(invoice!.id, {
        walletAmountCents: walletApplied || undefined,
        cardAmountCents: cardCharge || undefined,
        mockOutcome
      });
      const parts: string[] = [];
      if (res.walletApplied > 0)
        parts.push(`${fmt(res.walletApplied, invoice!.currency)} from wallet`);
      if (res.cardCharged > 0)
        parts.push(`${fmt(res.cardCharged, invoice!.currency)} to card`);
      onPaid(`Paid ${parts.join(" + ")}. Invoice is ${res.status}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={true}
      onClose={onClose}
      title={`Pay ${invoice.invoiceNumber}`}
      description={`${fmt(outstanding, invoice.currency)} outstanding. Apply wallet credit, charge a card, or split.`}
      size="lg"
    >
      <div className="space-y-3">
        {walletAvailable > 0 ? (
          <label className="grid gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              From wallet (max {fmt(Math.min(walletAvailable, outstanding), invoice.currency)})
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              max={Math.min(walletAvailable, outstanding) / 100}
              value={walletAmount}
              onChange={(e) => setWalletAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
            />
          </label>
        ) : (
          <p className="rounded-md border border-dashed border-border bg-bg-subtle p-3 text-[12px] text-fg-muted">
            No wallet credit available for this org.
          </p>
        )}

        <div className="rounded-md border border-border bg-bg-subtle p-3 text-[13px]">
          <div className="flex items-center justify-between">
            <span className="text-fg-muted">Wallet:</span>
            <span className="font-mono tabular-nums text-fg">
              {fmt(walletApplied, invoice.currency)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-fg-muted">Card:</span>
            <span className="font-mono tabular-nums text-fg">
              {fmt(cardCharge, invoice.currency)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2 font-medium">
            <span>Total</span>
            <span className="font-mono tabular-nums">
              {fmt(walletApplied + cardCharge, invoice.currency)}
            </span>
          </div>
        </div>

        {cardCharge > 0 && (
          <label className="grid gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              Mock card outcome (Stripe wires later)
            </span>
            <select
              value={mockOutcome}
              onChange={(e) =>
                setMockOutcome(e.target.value as "succeeded" | "failed")
              }
              className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg"
            >
              <option value="succeeded">Succeeds</option>
              <option value="failed">Fails (test decline path)</option>
            </select>
          </label>
        )}

        {error && (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">
            {error}
          </p>
        )}

        <DialogActions>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={busy || walletApplied + cardCharge !== outstanding}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pay now"}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}

function RetryDialog({
  target,
  onClose,
  onResult
}: {
  target: { inv: Invoice; ins: Installment } | null;
  onClose: () => void;
  onResult: (msg: string) => void;
}) {
  const [mockOutcome, setMockOutcome] = useState<"succeeded" | "failed">(
    "succeeded"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!target) return null;

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const res = await finance.retryInstallment(target!.ins.id, {
        mockOutcome
      });
      if (res.status === "succeeded") {
        onResult(
          `Installment #${target!.ins.installmentNumber} paid (${fmt(target!.ins.amountCents, target!.inv.currency)}).`
        );
      } else {
        onResult(`Retry failed: ${res.message ?? "card declined"}`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={true}
      onClose={onClose}
      title={`Retry installment #${target.ins.installmentNumber}`}
      description={`${fmt(target.ins.amountCents, target.inv.currency)} — previous attempt declined. Update card details below (UI stub — real Stripe element lands when @stripe/stripe-js is wired).`}
    >
      <div className="space-y-3">
        <div className="rounded-md border border-dashed border-border bg-bg-subtle p-3 text-[12px] text-fg-muted">
          <p className="font-medium text-fg">Card on file</p>
          <p>•••• 4242 (mock) · update via Stripe element (next sprint)</p>
        </div>

        <label className="grid gap-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Mock outcome
          </span>
          <select
            value={mockOutcome}
            onChange={(e) =>
              setMockOutcome(e.target.value as "succeeded" | "failed")
            }
            className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg"
          >
            <option value="succeeded">Card succeeds</option>
            <option value="failed">Card declines again</option>
          </select>
        </label>

        {error && (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">
            {error}
          </p>
        )}

        <DialogActions>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={retry} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="mr-2 h-4 w-4" /> Retry charge</>}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}
