"use client";

import { DATE_FORMATS, centsToAmountInput, formatCalendarDate, formatMoney } from "@sportspulse/kernel";
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
  Eyebrow,
  useLocalDate,
  Alert
} from "@sportspulse/ui";
import { finance } from "@/lib/api/browser-api";

type Wallet = Awaited<ReturnType<typeof finance.myWallet>>;
type Invoices = Awaited<ReturnType<typeof finance.myInvoices>>;
type Invoice = Invoices["items"][number];
type Installment = Invoice["installments"][number];


export function PaymentsClient({
  initial
}: {
  initial: { wallet: Wallet; invoices: Invoices };
}) {
  const localDate = useLocalDate();
  const [wallet, setWallet] = useState<Wallet>(initial.wallet);
  const [invoices, setInvoices] = useState<Invoices>(initial.invoices);
  const [payTarget, setPayTarget] = useState<{ invoice: Invoice; presetCents: number } | null>(null);
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
        <Alert tone="success" role="status">
          {flash}
        </Alert>
      )}

      {/* Wallet card — mock 3 */}
      <section className="flex items-center justify-between rounded-xl border border-[var(--tint-cyan-fg)]/30 bg-[var(--tint-cyan-bg)] px-5 py-4 dark:bg-[var(--tint-cyan-bg)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--tint-cyan-bg)] ring-1 ring-[var(--tint-cyan-fg)]/40">
            <WalletIcon className="h-5 w-5 text-[var(--tint-cyan-fg)]" strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              Wallet balance
            </p>
            <p className="font-mono text-[20px] font-semibold tabular-nums text-fg">
              {formatMoney(totalBalance, walletCurrency)}
            </p>
          </div>
        </div>
        <Button
          disabled={!nextUnpaidInvoice || totalBalance === 0}
          onClick={() =>
            nextUnpaidInvoice &&
            setPayTarget({ invoice: nextUnpaidInvoice, presetCents: nextUnpaidInvoice.payRange.minCents })
          }
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
              onPay={(presetCents) => setPayTarget({ invoice: inv, presetCents })}
              onRetry={(ins) => setRetryTarget({ inv, ins })}
              onUpdateCard={() => setUpdateCardTarget(inv)}
            />
          ))}
        </section>
      )}

      {/* Closed / paid history */}
      {closed.length > 0 && (
        <section className="space-y-3">
          <Eyebrow>history</Eyebrow>
          <div className="rounded-xl border border-border bg-surface-1">
            <ul className="divide-y divide-border">
              {closed.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between px-5 py-3 text-[13px]">
                  <span className="font-mono text-fg">{inv.invoiceNumber}</span>
                  <span className="font-mono tabular-nums text-fg-muted">
                    {formatMoney(inv.totalCents, inv.currency)}
                    {(inv.refundedCents ?? 0) > 0
                      ? ` (${formatMoney(inv.refundedCents, inv.currency)} refunded)`
                      : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge status={inv.status} />
                    {inv.paidCents > 0 ? (
                      <Button variant="ghost" size="sm" onClick={() => downloadReceipt(inv, localDate)}>
                        <Download className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
                        Receipt
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <PayDialog
        key={payTarget ? `${payTarget.invoice.id}-${payTarget.presetCents}` : "none"}
        invoice={payTarget?.invoice ?? null}
        presetCents={payTarget?.presetCents ?? 0}
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
  onPay: (presetCents: number) => void;
  onRetry: (ins: Installment) => void;
  onUpdateCard: () => void;
}) {
  const localDate = useLocalDate();
  const outstanding = Math.max(0, invoice.totalCents - invoice.paidCents);
  const range = invoice.payRange;
  // On a payment plan the player can pay the next installment instead of everything.
  const nextOnly = range.nextInstallment !== null && range.minCents > 0 && range.minCents < range.maxCents;
  const hasLateFeeLine = invoice.lines.some((l) => l.kind === "late_fee");
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
            {invoice.title}
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
        <Alert tone="error" className="mx-5 mb-3 flex items-start gap-2">
          <AlertOctagon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span>
            Your{" "}
            {oldestFailed.dueDate
              ? formatCalendarDate(oldestFailed.dueDate, DATE_FORMATS.monthDay)
              : `installment #${oldestFailed.installmentNumber}`}{" "}
            payment of {formatMoney(oldestFailed.amountCents, invoice.currency)} failed.
            Update your card and retry.
          </span>
        </Alert>
      )}

      {/* Line items breakdown — mock 3 */}
      <dl className="space-y-1 border-t border-border px-5 py-3 text-[13px]">
        {invoice.lines.length > 0 ? (
          invoice.lines.map((l, i) => (
            <BreakdownRow
              key={i}
              label={l.quantity > 1 ? `${l.label} × ${l.quantity}` : l.label}
              value={
                l.amountCents < 0
                  ? "−" + formatMoney(-l.amountCents, invoice.currency)
                  : formatMoney(l.amountCents, invoice.currency)
              }
              tone={l.kind === "late_fee" ? "rose" : l.amountCents < 0 ? "emerald" : undefined}
            />
          ))
        ) : (
          <BreakdownRow
            label={invoice.title}
            value={formatMoney(invoice.subtotalCents, invoice.currency)}
          />
        )}
        {invoice.walletCreditAppliedCents > 0 && (
          <BreakdownRow
            label="Wallet credit applied"
            value={"−" + formatMoney(invoice.walletCreditAppliedCents, invoice.currency)}
            tone="emerald"
          />
        )}
        {invoice.lateFeeAppliedCents > 0 && !hasLateFeeLine && (
          <BreakdownRow
            label="Late fee"
            value={"+" + formatMoney(invoice.lateFeeAppliedCents, invoice.currency)}
            tone="rose"
          />
        )}
        {(invoice.refundedCents ?? 0) > 0 && (
          <BreakdownRow
            label="Refunded to you"
            value={"−" + formatMoney(invoice.refundedCents, invoice.currency)}
            tone="emerald"
          />
        )}
        {invoice.paidCents > 0 && (
          <BreakdownRow
            label="Paid"
            value={"−" + formatMoney(invoice.paidCents, invoice.currency)}
          />
        )}
        <BreakdownRow
          label="Outstanding"
          value={formatMoney(outstanding, invoice.currency)}
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
                          ? "text-[var(--tint-emerald-fg)]"
                          : ins.status === "failed"
                            ? "text-[var(--tint-rose-fg)]"
                            : "text-fg"
                      ].join(" ")}
                    >
                      {formatMoney(ins.amountCents, invoice.currency)}
                    </p>
                    <p className="text-[10px] text-fg-muted">
                      {ins.status === "failed"
                        ? "Failed"
                        : ins.dueDate
                          ? formatCalendarDate(ins.dueDate, DATE_FORMATS.monthDay)
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
        ) : outstanding > 0 && nextOnly ? (
          <>
            <Button onClick={() => onPay(range.minCents)}>
              <CreditCard className="mr-2 h-3.5 w-3.5" strokeWidth={1.75} />
              Pay next installment {formatMoney(range.minCents, invoice.currency)}
            </Button>
            <Button variant="ghost" onClick={() => onPay(range.maxCents)}>
              Pay all {formatMoney(range.maxCents, invoice.currency)}
            </Button>
          </>
        ) : outstanding > 0 ? (
          <Button onClick={() => onPay(outstanding)}>
            <CreditCard className="mr-2 h-3.5 w-3.5" strokeWidth={1.75} />
            Pay {formatMoney(outstanding, invoice.currency)}
          </Button>
        ) : null}
        {/* No card is stored while payments run without a card provider,
            so there is no card to update (MON-18). */}
        {invoice.paidCents > 0 && (
          <Button
            variant="ghost"
            onClick={() => downloadReceipt(invoice, localDate)}
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
          tone === "emerald" && "text-[var(--tint-emerald-fg)]",
          tone === "rose" && "text-[var(--tint-rose-fg)]",
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
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--tint-emerald-bg)] text-[var(--tint-emerald-fg)] ring-1 ring-[var(--tint-emerald-fg)]/40 dark:text-[var(--tint-emerald-fg)]">
        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--tint-rose-bg)] text-[var(--tint-rose-fg)] ring-1 ring-[var(--tint-rose-fg)]/40 dark:text-[var(--tint-rose-fg)]">
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
  return <Badge status={status} />;
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
    process.env.NEXT_PUBLIC_TEAM_ADMIN_URL ?? "https://team.sportspulse.us";
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

/**
 * A printable receipt from the invoice the player already sees: lines,
 * total, paid, refunded, balance. Opens in a new tab; the browser's
 * Print saves it as a PDF (MON-18). Values are escaped before writing.
 */
function downloadReceipt(inv: Invoice, localDate: (iso: string) => string) {
  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const day = (iso: string | null | undefined) =>
    iso ? localDate(iso) : "";
  const refunded = inv.refundedCents ?? 0;
  const balance = Math.max(0, inv.totalCents - inv.paidCents);
  // The same lines the Payments card shows (MON-18): what each charge was for.
  const money = (cents: number) => (cents < 0 ? "−" + formatMoney(-cents, inv.currency) : formatMoney(cents, inv.currency));
  const lines =
    inv.lines.length > 0
      ? inv.lines
          .map((l) => `<tr><td>${esc(l.label)}</td><td class="n">${esc(l.quantity)}</td><td class="n">${esc(money(l.amountCents))}</td></tr>`)
          .join("")
      : `<tr><td>${esc(inv.title)}</td><td class="n">1</td><td class="n">${esc(formatMoney(inv.subtotalCents, inv.currency))}</td></tr>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(inv.invoiceNumber)}</title>
<style>body{font:14px system-ui,sans-serif;max-width:640px;margin:32px auto;padding:0 16px;color:#111}
h1{font-size:20px;margin:0 0 4px}p{margin:2px 0;color:#444}table{width:100%;border-collapse:collapse;margin:16px 0}
td,th{padding:6px 4px;border-bottom:1px solid #ddd;text-align:left}.n{text-align:right}.tot td{font-weight:600}
@media print{button{display:none}}</style></head><body>
<h1>Receipt</h1><p>SportsPulse</p><p>${esc(inv.title)}${inv.teamName ? ` · ${esc(inv.teamName)}` : ""}</p><p>Invoice ${esc(inv.invoiceNumber)}${inv.issuedAt ? ` · issued ${esc(day(inv.issuedAt))}` : ""} · printed ${esc(day(new Date().toISOString()))}</p>
<table><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Price</th></tr></thead><tbody>${lines}</tbody></table>
<table><tbody>
<tr><td>Total</td><td class="n">${esc(formatMoney(inv.totalCents, inv.currency))}</td></tr>
<tr class="tot"><td>Paid</td><td class="n">${esc(formatMoney(inv.paidCents, inv.currency))}</td></tr>
${refunded > 0 ? `<tr><td>Refunded</td><td class="n">${esc(formatMoney(refunded, inv.currency))}</td></tr>` : ""}
<tr><td>Balance</td><td class="n">${esc(formatMoney(balance, inv.currency))}</td></tr>
</tbody></table>
<button onclick="window.print()">Print or save as PDF</button>
</body></html>`);
  win.document.close();
}

// ---------------------------------------------------------------------
// Dialogs (Pay / Retry / Update card)
// ---------------------------------------------------------------------
function PayDialog({
  invoice,
  presetCents,
  wallet,
  onClose,
  onPaid
}: {
  invoice: Invoice | null;
  presetCents: number;
  wallet: Wallet;
  onClose: () => void;
  onPaid: (msg: string) => void;
}) {
  const [walletAmount, setWalletAmount] = useState<string>("");
  const [amountText, setAmountText] = useState<string>(centsToAmountInput(presetCents));
  // One key per opened dialog: a double click or a retry charges once.
  const [payKey] = useState(() =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const [mockOutcome, setMockOutcome] = useState<"succeeded" | "failed">(
    "succeeded"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!invoice) return null;

  const outstanding = Math.max(0, invoice.totalCents - invoice.paidCents);
  const range = invoice.payRange;
  const flexible = range.minCents < range.maxCents;
  // What the player pays now: fixed to the balance without a plan; on a
  // plan anything from the next installment up to the balance.
  const parsedAmount = Math.round(parseFloat(amountText || "0") * 100);
  const amount = flexible ? (Number.isFinite(parsedAmount) ? parsedAmount : 0) : outstanding;
  const amountOk = amount >= range.minCents && amount <= range.maxCents && amount > 0;
  const walletForOrg = wallet.accounts.find(
    (a) => a.orgId === invoice.orgId && a.currency === invoice.currency
  );
  const walletAvailable = walletForOrg?.balanceCents ?? 0;
  const walletParsed = Math.round(parseFloat(walletAmount || "0") * 100);
  const walletApplied = Number.isFinite(walletParsed)
    ? Math.max(0, Math.min(walletParsed, walletAvailable, Math.max(0, amount)))
    : 0;
  const cardCharge = Math.max(0, amount - walletApplied);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await finance.payInvoice(invoice!.id, {
        walletAmountCents: walletApplied || undefined,
        cardAmountCents: cardCharge || undefined,
        mockOutcome,
        idempotencyKey: payKey
      });
      const parts: string[] = [];
      if (res.walletApplied > 0)
        parts.push(`${formatMoney(res.walletApplied, invoice!.currency)} from wallet`);
      if (res.cardCharged > 0)
        parts.push(`${formatMoney(res.cardCharged, invoice!.currency)} to card`);
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
      description={`${formatMoney(outstanding, invoice.currency)} outstanding. Apply wallet credit, charge a card, or split.`}
      size="lg"
    >
      <div className="space-y-3">
        {flexible ? (
          <div className="grid gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              Amount to pay now
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={amount === range.minCents ? "primary" : "ghost"}
                onClick={() => setAmountText(centsToAmountInput(range.minCents))}
              >
                Next installment {formatMoney(range.minCents, invoice.currency)}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={amount === range.maxCents ? "primary" : "ghost"}
                onClick={() => setAmountText(centsToAmountInput(range.maxCents))}
              >
                Whole balance {formatMoney(range.maxCents, invoice.currency)}
              </Button>
            </div>
            <label className="grid gap-1">
              <span className="text-[12px] text-fg-muted">
                Or another amount between {formatMoney(range.minCents, invoice.currency)} and{" "}
                {formatMoney(range.maxCents, invoice.currency)}
              </span>
              <input
                aria-label="Amount to pay now"
                type="number"
                step="0.01"
                min={centsToAmountInput(range.minCents)}
                max={centsToAmountInput(range.maxCents)}
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
              />
            </label>
            {!amountOk ? (
              <p className="text-[12px] text-[var(--tint-rose-fg)]">
                Enter an amount between {formatMoney(range.minCents, invoice.currency)} and{" "}
                {formatMoney(range.maxCents, invoice.currency)}.
              </p>
            ) : null}
          </div>
        ) : null}
        {walletAvailable > 0 ? (
          <label className="grid gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              From wallet (max{" "}
              {formatMoney(
                Math.min(walletAvailable, Math.max(0, amount)),
                invoice.currency
              )})
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              max={Math.min(walletAvailable, Math.max(0, amount)) / 100}
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
              {formatMoney(walletApplied, invoice.currency)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-fg-muted">Card:</span>
            <span className="font-mono tabular-nums text-fg">
              {formatMoney(cardCharge, invoice.currency)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2 font-medium">
            <span>Total</span>
            <span className="font-mono tabular-nums">
              {formatMoney(walletApplied + cardCharge, invoice.currency)}
            </span>
          </div>
        </div>

        {cardCharge > 0 && (
          <label className="grid gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              Test payment: no real card is charged while the league is testing. Pick the outcome to simulate
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
          <Alert tone="error">
            {error}
          </Alert>
        )}

        <DialogActions>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={busy || !amountOk || walletApplied + cardCharge !== amount}>
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
          `Installment #${target!.ins.installmentNumber} paid (${formatMoney(target!.ins.amountCents, target!.inv.currency)}).`
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
      description={`${formatMoney(target.ins.amountCents, target.inv.currency)} — previous attempt declined.`}
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
          <Alert tone="error">
            {error}
          </Alert>
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
