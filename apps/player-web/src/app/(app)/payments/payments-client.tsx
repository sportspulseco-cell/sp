"use client";

import { useState } from "react";
import {
  AlertOctagon,
  CheckCircle2,
  CreditCard,
  Download,
  Loader2,
  RefreshCw,
  Wallet as WalletIcon
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
  const [updateCardTarget, setUpdateCardTarget] = useState<Invoice | null>(null);
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
  const walletCurrency = wallet.accounts[0]?.currency ?? "USD";
  const open = invoices.items.filter(
    (i) => i.status !== "void" && i.totalCents > i.paidCents
  );
  const closed = invoices.items.filter(
    (i) => i.status === "paid" || i.status === "void"
  );
  const nextUnpaidInvoice = open[0];

  return (
    <div className="space-y-6">
      {flash && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {flash}
        </p>
      )}

      {/* Wallet card — mock 3 */}
      <section className="flex items-center justify-between rounded-xl border border-sky-400/40 bg-sky-50/60 px-5 py-4 dark:border-sky-700/40 dark:bg-sky-950/30">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/15 ring-1 ring-sky-500/40">
            <WalletIcon className="h-5 w-5 text-sky-600 dark:text-sky-400" strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              Wallet balance
            </p>
            <p className="font-mono text-[20px] font-semibold tabular-nums text-fg">
              {fmt(totalBalance, walletCurrency)}
            </p>
          </div>
        </div>
        <Button
          disabled={!nextUnpaidInvoice || totalBalance === 0}
          onClick={() => nextUnpaidInvoice && setPayTarget(nextUnpaidInvoice)}
        >
          Apply to next payment
        </Button>
      </section>

      {/* Open invoices — mock 3 */}
      {open.length > 0 && (
        <section className="space-y-3">
          {open.map((inv) => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              onPay={() => setPayTarget(inv)}
              onRetry={(ins) => setRetryTarget({ inv, ins })}
              onUpdateCard={() => setUpdateCardTarget(inv)}
            />
          ))}
        </section>
      )}

      {/* Closed / paid history */}
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

      <UpdateCardDialog
        invoice={updateCardTarget}
        onClose={() => setUpdateCardTarget(null)}
        onSaved={() => {
          setUpdateCardTarget(null);
          setFlash("Card updated — wired to Stripe element in next sprint.");
        }}
      />
    </div>
  );
}

function InvoiceCard({
  invoice,
  onPay,
  onRetry,
  onUpdateCard
}: {
  invoice: Invoice;
  onPay: () => void;
  onRetry: (ins: Installment) => void;
  onUpdateCard: () => void;
}) {
  const outstanding = Math.max(0, invoice.totalCents - invoice.paidCents);
  const overdue = invoice.status === "overdue";
  const failedInstallments = invoice.installments.filter(
    (i) => i.status === "failed"
  );
  const oldestFailed = failedInstallments[0];

  return (
    <div className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-start justify-between gap-3 px-5 py-4">
        <div>
          <p className="text-[15px] font-semibold tracking-tight text-fg">
            {invoiceTitleFor(invoice)}
          </p>
          <p className="font-mono text-[11px] text-fg-muted">
            {invoice.invoiceNumber}
            {invoice.teamName && (
              <>
                <span className="px-1.5 text-fg-muted/40">·</span>
                <TeamLink
                  teamId={invoice.teamId}
                  teamName={invoice.teamName}
                />
              </>
            )}
          </p>
        </div>
        <StatusBadge status={invoice.status} />
      </header>

      {oldestFailed && (
        <div className="mx-5 mb-3 flex items-start gap-2 rounded-md border border-rose-400/40 bg-rose-50/70 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300">
          <AlertOctagon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span>
            Your{" "}
            {oldestFailed.dueDate
              ? new Date(oldestFailed.dueDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric"
                })
              : `installment #${oldestFailed.installmentNumber}`}{" "}
            payment of {fmt(oldestFailed.amountCents, invoice.currency)} failed.
            Update your card and retry.
          </span>
        </div>
      )}

      {/* Line items breakdown — mock 3 */}
      <dl className="space-y-1 border-t border-border px-5 py-3 text-[13px]">
        <BreakdownRow
          label="Registration fee"
          value={fmt(invoice.subtotalCents, invoice.currency)}
        />
        {invoice.walletCreditAppliedCents > 0 && (
          <BreakdownRow
            label="Wallet credit applied"
            value={"−" + fmt(invoice.walletCreditAppliedCents, invoice.currency)}
            tone="emerald"
          />
        )}
        {invoice.lateFeeAppliedCents > 0 && (
          <BreakdownRow
            label="Late fee"
            value={"+" + fmt(invoice.lateFeeAppliedCents, invoice.currency)}
            tone="rose"
          />
        )}
        <BreakdownRow
          label="Outstanding"
          value={fmt(outstanding, invoice.currency)}
          emphasis
        />
      </dl>

      {/* Payment plan dot timeline — mock 3 */}
      {invoice.installments.length > 0 && (
        <div className="border-t border-border px-5 py-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Payment plan
          </p>
          <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {invoice.installments.map((ins, idx) => {
              const total = invoice.installments.length;
              const isLast = idx === total - 1;
              return (
                <li key={ins.id} className="relative flex flex-col items-center text-center">
                  <InstallmentDot status={ins.status} label={installmentLabel(ins, idx)} />
                  {!isLast && (
                    <span
                      aria-hidden
                      className="absolute right-0 top-3 hidden h-px w-1/2 -translate-y-1/2 bg-border sm:block"
                      style={{ right: "-25%" }}
                    />
                  )}
                  <div className="mt-2 space-y-0.5">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                      {installmentLabel(ins, idx)}
                    </p>
                    <p
                      className={[
                        "font-mono text-[12px] font-semibold tabular-nums",
                        ins.status === "succeeded"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : ins.status === "failed"
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-fg"
                      ].join(" ")}
                    >
                      {fmt(ins.amountCents, invoice.currency)}
                    </p>
                    <p className="text-[10px] text-fg-muted">
                      {ins.status === "failed"
                        ? "Failed"
                        : ins.dueDate
                          ? new Date(ins.dueDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric"
                            })
                          : "Pending"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Actions — mock 3 */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-bg-subtle/40 px-5 py-3">
        {oldestFailed ? (
          <Button onClick={() => onRetry(oldestFailed)}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" strokeWidth={1.75} />
            Retry now
          </Button>
        ) : outstanding > 0 ? (
          <Button onClick={onPay}>
            <CreditCard className="mr-2 h-3.5 w-3.5" strokeWidth={1.75} />
            Pay {fmt(outstanding, invoice.currency)}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onUpdateCard}>
          <CreditCard className="mr-2 h-3.5 w-3.5" strokeWidth={1.75} />
          Update card
        </Button>
        {invoice.paidCents > 0 && (
          <Button
            variant="ghost"
            onClick={() => downloadReceipt(invoice)}
          >
            <Download className="mr-2 h-3.5 w-3.5" strokeWidth={1.75} />
            Download receipt
          </Button>
        )}
      </div>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  tone,
  emphasis
}: {
  label: string;
  value: string;
  tone?: "emerald" | "rose";
  emphasis?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-center justify-between",
        emphasis && "mt-1 border-t border-border pt-2 text-[14px] font-semibold"
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={emphasis ? "text-fg" : "text-fg-muted"}>{label}</span>
      <span
        className={[
          "font-mono tabular-nums",
          tone === "emerald" && "text-emerald-600 dark:text-emerald-400",
          tone === "rose" && "text-rose-600 dark:text-rose-400",
          !tone && (emphasis ? "text-fg" : "text-fg")
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function InstallmentDot({
  status,
  label
}: {
  status: string;
  label: string;
}) {
  if (status === "succeeded") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-700 ring-1 ring-emerald-500/40 dark:text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/20 text-rose-700 ring-1 ring-rose-500/40 dark:text-rose-300">
        <AlertOctagon className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
    );
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-[10px] font-medium text-fg-muted">
      {label.replace(/^(Deposit|Install\.\s?)/, "")}
    </span>
  );
}

function installmentLabel(ins: Installment, idx: number) {
  if (idx === 0) return "Deposit";
  return `Install. ${idx}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { tone: "info" | "success" | "warning" | "danger" | "neutral"; label: string }
  > = {
    paid: { tone: "success", label: "Paid" },
    partial: { tone: "warning", label: "Partial" },
    overdue: { tone: "danger", label: "Overdue" },
    sent: { tone: "info", label: "Sent" },
    draft: { tone: "neutral", label: "Draft" },
    void: { tone: "neutral", label: "Void" }
  };
  const entry = map[status] ?? { tone: "neutral" as const, label: status };
  return (
    <Badge tone={entry.tone} mono>
      {entry.label}
    </Badge>
  );
}

/**
 * Renders the invoice's team as a link to the team-admin captain
 * dues page (where the captain can chase outstanding sub-invoices).
 * Non-captain players get a no-op label — the link target requires
 * captain access. Server-side scope check would belong here too, but
 * the link target's own guard handles that. P3-2 / audit §1.3.
 */
function TeamLink({
  teamId,
  teamName
}: {
  teamId: string | null;
  teamName: string;
}) {
  if (!teamId) return <span className="text-fg-muted">{teamName}</span>;
  const teamAdminBase =
    process.env.NEXT_PUBLIC_TEAM_ADMIN_URL ?? "https://sp-team-admin.vercel.app";
  return (
    <a
      href={`${teamAdminBase}/captain/dues`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-fg-muted underline-offset-2 hover:text-fg hover:underline"
      title="Open captain dues in team-admin (captains only)"
    >
      {teamName}
    </a>
  );
}

function invoiceTitleFor(inv: Invoice): string {
  switch (inv.invoiceType) {
    case "registration":
    case "sub_invoice":
      return "Registration";
    case "team_dues":
      return "Team dues";
    case "referee_payroll":
      return "Officiating fee";
    default:
      return inv.invoiceType.replace(/_/g, " ");
  }
}

function downloadReceipt(inv: Invoice) {
  // Receipt endpoint not wired yet; surface a placeholder.
  const win = window.open("", "_blank");
  win?.document.write(
    `<pre style="font: 14px monospace; padding: 24px">
SportsPulse — Receipt

Invoice: ${inv.invoiceNumber}
Paid:    ${fmt(inv.paidCents, inv.currency)}
Total:   ${fmt(inv.totalCents, inv.currency)}
Status:  ${inv.status}

Real PDF receipt wires in the next sprint.
</pre>`
  );
}

// ---------------------------------------------------------------------
// Dialogs (Pay / Retry / Update card)
// ---------------------------------------------------------------------
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
              From wallet (max{" "}
              {fmt(
                Math.min(walletAvailable, outstanding),
                invoice.currency
              )})
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
      description={`${fmt(target.ins.amountCents, target.inv.currency)} — previous attempt declined.`}
    >
      <div className="space-y-3">
        {target.inv.cardOnFile && (
          <div className="rounded-md border border-border bg-bg-subtle p-3 text-[12px]">
            <p className="font-medium text-fg">Card on file</p>
            <p className="text-fg-muted">
              {target.inv.cardOnFile.brand} ····{" "}
              {target.inv.cardOnFile.last4}
            </p>
          </div>
        )}

        <label className="grid gap-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Mock outcome (Stripe wires later)
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

function UpdateCardDialog({
  invoice,
  onClose,
  onSaved
}: {
  invoice: Invoice | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!invoice) return null;
  return (
    <Dialog
      open={true}
      onClose={onClose}
      title="Update card on file"
      description="Stripe Elements wire in the next sprint. For now this is a stub — captain still won't see your card details."
    >
      <div className="space-y-3 text-[13px]">
        <div className="rounded-md border border-dashed border-border bg-bg-subtle p-4 text-fg-muted">
          <p className="text-fg">Card number</p>
          <p className="mt-1 font-mono">•••• •••• •••• 4242</p>
          <p className="mt-3 text-fg">Expiration</p>
          <p className="mt-1 font-mono">12/28</p>
        </div>
        <p className="text-fg-muted text-[12px]">
          Replacement card data is held inside Stripe and never touches our
          servers. We only store the brand + last 4.
        </p>
      </div>
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onSaved}>Save card</Button>
      </DialogActions>
    </Dialog>
  );
}
