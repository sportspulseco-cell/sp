"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Check,
  Coins,
  Loader2,
  RotateCcw,
  Send,
  ShieldOff,
  Wallet
} from "lucide-react";
import { formatMoney } from "@/components/finance/money";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefundDialog } from "@/components/finance/refund-dialog";
import { finance } from "@/lib/api/browser-api";
import type { Invoice, Payment } from "@/lib/api/types";

type Bundle = {
  invoice: Invoice & {
    invoiceType?: string;
    billingScope?: string | null;
    idempotencyKey?: string | null;
    feeScheduleId?: string | null;
    lateFeeAppliedCents?: number | null;
    walletCreditAppliedCents?: number | null;
    teamId?: string | null;
    divisionId?: string | null;
    leagueId?: string | null;
    seasonId?: string | null;
  };
  items: Array<{
    id: string;
    invoiceId: string;
    kind: string | null;
    description: string;
    quantity: number;
    unitAmountCents: number;
    feeScheduleId: string | null;
  }>;
  payments: Payment[];
  installments: Array<{
    id: string;
    invoiceId: string;
    installmentNumber: number;
    amountCents: number;
    dueDate: string | null;
    status: string;
    attemptCount: number;
    lastError: string | null;
  }>;
};

export function InvoiceDetailClient({ bundle }: { bundle: Bundle }) {
  const router = useRouter();
  const { invoice, items, payments } = bundle;
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showRefund, setShowRefund] = useState(false);
  const [showExtend, setShowExtend] = useState(false);
  const [showWaive, setShowWaive] = useState(false);
  const [showCredit, setShowCredit] = useState(false);
  const [showVoid, setShowVoid] = useState(false);
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [note, setNote] = useState<string>(
    typeof invoice.metadata?.internalNote === "string"
      ? (invoice.metadata.internalNote as string)
      : ""
  );

  const lateFee = invoice.lateFeeAppliedCents ?? 0;
  const walletApplied = invoice.walletCreditAppliedCents ?? 0;
  const subtotal = invoice.subtotalCents;
  const balance = Math.max(0, invoice.totalCents - invoice.paidCents);
  const isOverdue =
    invoice.status === "overdue" ||
    (invoice.dueAt && balance > 0 && new Date(invoice.dueAt) < new Date());

  const daysPastDue =
    invoice.dueAt && balance > 0
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(invoice.dueAt).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 0;

  async function manualRemind() {
    setBusy("remind");
    setError(null);
    try {
      await finance.manualRemind(invoice.id, "email");
      setFlash("Reminder queued — captain + recipient will get an email.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveNote() {
    setBusy("note");
    setError(null);
    try {
      // We don't have a dedicated notes endpoint; piggy-back on extend
      // due date as a no-op + persist into metadata via the bulk update
      // surface in a follow-up. For now, optimistic UI only.
      setFlash("Note saved locally — wire-through endpoint coming soon.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {flash && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {flash}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-5">
        <div className="min-w-0">
          <p className="font-mono text-[12px] tracking-wide text-fg-muted">
            {invoice.invoiceNumber}
          </p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-fg">
            {invoice.recipientEmail ?? "Recipient"}
            {invoice.billingScope && (
              <span className="ml-2 font-mono text-[11px] uppercase tracking-widest text-fg-muted">
                · {invoice.billingScope}
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {isOverdue ? (
            <Badge tone="danger" mono>
              Overdue — {daysPastDue} day{daysPastDue === 1 ? "" : "s"}
            </Badge>
          ) : (
            <Badge tone={statusTone(invoice.status)} mono>
              {invoice.status}
            </Badge>
          )}
        </div>
      </header>

      {/* Alert banner */}
      {(isOverdue || lateFee > 0) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-50/70 px-4 py-3 text-[13px] text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <div className="space-y-0.5">
            {isOverdue && (
              <p>
                {daysPastDue} day{daysPastDue === 1 ? "" : "s"} past due.
                {lateFee > 0 && (
                  <>
                    {" "}
                    Late fee of {formatMoney(lateFee, invoice.currency)} applied.
                  </>
                )}
              </p>
            )}
            {(() => {
              const last = invoice.metadata?.lastReminderAt;
              if (typeof last !== "string") return null;
              return (
                <p>
                  Last reminder sent {new Date(last).toLocaleDateString()}.
                </p>
              );
            })()}
          </div>
        </div>
      )}

      {/* Two columns */}
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          {/* Invoice details */}
          <section className="rounded-xl border border-border bg-surface-1 p-5">
            <Eyebrow>Invoice details</Eyebrow>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
              <DetailRow label="Type" value={invoice.invoiceType ?? "—"} />
              <DetailRow
                label="Scope"
                value={invoice.billingScope ?? "—"}
              />
              <DetailRow
                label="Issued"
                value={fmtDate(invoice.issuedAt ?? invoice.createdAt)}
              />
              <DetailRow
                label="Due"
                value={fmtDate(invoice.dueAt)}
                tone={isOverdue ? "rose" : undefined}
              />
              <DetailRow
                label="Fee schedule"
                value={invoice.feeScheduleId ? "Configured" : "—"}
              />
              <DetailRow
                label="Idempotency key"
                value={
                  invoice.idempotencyKey
                    ? invoice.idempotencyKey.slice(0, 8) + "…"
                    : "—"
                }
                mono
              />
            </dl>
          </section>

          {/* Line items */}
          <section className="rounded-xl border border-border bg-surface-1">
            <header className="border-b border-border px-5 py-3">
              <Eyebrow>Line items</Eyebrow>
            </header>
            <div className="px-5 py-4">
              <table className="w-full text-[13px]">
                <thead className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                  <tr>
                    <th className="pb-2 text-left">Description</th>
                    <th className="pb-2 text-left">Kind</th>
                    <th className="pb-2 text-right">Qty</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td className="py-2 text-fg">{it.description}</td>
                      <td className="py-2 font-mono text-[11px] text-fg-muted">
                        {it.kind ?? "—"}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-fg-muted">
                        {it.quantity}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-fg">
                        {formatMoney(
                          it.unitAmountCents * it.quantity,
                          invoice.currency
                        )}
                      </td>
                    </tr>
                  ))}
                  {lateFee > 0 && (
                    <tr>
                      <td className="py-2 text-rose-600 dark:text-rose-400">
                        Late payment fee
                      </td>
                      <td className="py-2 font-mono text-[11px] text-rose-600 dark:text-rose-400">
                        late_fee
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-rose-600 dark:text-rose-400">
                        1
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-rose-600 dark:text-rose-400">
                        {formatMoney(lateFee, invoice.currency)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-[13px]">
                <TotalRow
                  label="Subtotal"
                  value={formatMoney(subtotal, invoice.currency)}
                />
                {lateFee > 0 && (
                  <TotalRow
                    label="Late fee"
                    value={formatMoney(lateFee, invoice.currency)}
                    tone="rose"
                  />
                )}
                {walletApplied > 0 && (
                  <TotalRow
                    label="Wallet credit"
                    value={"−" + formatMoney(walletApplied, invoice.currency)}
                    tone="emerald"
                  />
                )}
                <TotalRow
                  label="Paid"
                  value={formatMoney(invoice.paidCents, invoice.currency)}
                  tone={invoice.paidCents > 0 ? "emerald" : undefined}
                />
                <TotalRow
                  label="Outstanding"
                  value={formatMoney(balance, invoice.currency)}
                  emphasis
                />
              </dl>
            </div>
          </section>

          {/* Payments history (compact) */}
          {payments.length > 0 && (
            <section className="rounded-xl border border-border bg-surface-1">
              <header className="border-b border-border px-5 py-3">
                <Eyebrow>Payments ({payments.length})</Eyebrow>
              </header>
              <ul className="divide-y divide-border">
                {payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between px-5 py-2.5 text-[13px]"
                  >
                    <div>
                      <p className="font-mono tabular-nums text-fg">
                        {formatMoney(p.amountCents, p.currency)}
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                        {p.method.replace(/_/g, " ")} · {p.status} ·{" "}
                        {fmtDate(p.receivedAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Admin actions sidebar */}
        <aside className="space-y-4">
          <section className="rounded-xl border border-border bg-surface-1 p-4">
            <Eyebrow>Admin actions</Eyebrow>
            <div className="mt-3 flex flex-col gap-1.5">
              <ActionButton
                icon={Check}
                onClick={() => setShowMarkPaid(true)}
                disabled={balance === 0 || invoice.status === "void"}
              >
                Mark as paid (offline)
              </ActionButton>
              <ActionButton
                icon={Send}
                onClick={manualRemind}
                disabled={busy === "remind" || balance === 0}
                busy={busy === "remind"}
              >
                Send manual reminder
              </ActionButton>
              <ActionButton
                icon={CalendarClock}
                onClick={() => setShowExtend(true)}
                disabled={invoice.status === "void"}
              >
                Extend due date
              </ActionButton>
              <ActionButton
                icon={RotateCcw}
                onClick={() => setShowRefund(true)}
                disabled={invoice.paidCents === 0}
              >
                Issue refund
              </ActionButton>
              <ActionButton
                icon={Wallet}
                onClick={() => setShowCredit(true)}
                disabled={!invoice.recipientPersonId}
              >
                Issue wallet credit
              </ActionButton>
              <ActionButton
                icon={ShieldOff}
                onClick={() => setShowWaive(true)}
                disabled={lateFee === 0}
              >
                Waive late fee
              </ActionButton>
              <ActionButton
                icon={Ban}
                onClick={() => setShowVoid(true)}
                disabled={invoice.status === "void"}
                tone="danger"
              >
                Void invoice
              </ActionButton>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface-1 p-4">
            <Eyebrow>Internal notes</Eyebrow>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional…"
              rows={3}
              className="mt-2 w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px] text-fg focus:border-accent focus:outline-none"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={saveNote}
              disabled={busy === "note"}
            >
              {busy === "note" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Save note"
              )}
            </Button>
          </section>
        </aside>
      </div>

      {/* Sub-modals */}
      <RefundDialog
        open={showRefund}
        onClose={() => setShowRefund(false)}
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoiceNumber}
        paidCents={invoice.paidCents}
        currency={invoice.currency}
      />
      <ExtendDueDialog
        open={showExtend}
        onClose={() => setShowExtend(false)}
        invoiceId={invoice.id}
        currentDueAt={invoice.dueAt}
      />
      <WaiveLateFeeDialog
        open={showWaive}
        onClose={() => setShowWaive(false)}
        invoiceId={invoice.id}
        lateFeeCents={lateFee}
        currency={invoice.currency}
      />
      <IssueWalletCreditDialog
        open={showCredit}
        onClose={() => setShowCredit(false)}
        personId={invoice.recipientPersonId}
        orgId={invoice.orgId}
        currency={invoice.currency}
      />
      <VoidInvoiceDialog
        open={showVoid}
        onClose={() => setShowVoid(false)}
        invoiceId={invoice.id}
      />
      <MarkPaidOfflineDialog
        open={showMarkPaid}
        onClose={() => setShowMarkPaid(false)}
        invoiceId={invoice.id}
        orgId={invoice.orgId}
        balance={balance}
        currency={invoice.currency}
      />
    </div>
  );
}

function ActionButton({
  icon: Icon,
  onClick,
  disabled,
  children,
  tone,
  busy
}: {
  icon: typeof Coins;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  tone?: "danger";
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-left text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40",
        tone === "danger"
          ? "border-rose-500/40 bg-rose-500/5 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
          : "border-border bg-bg text-fg hover:border-fg-muted hover:bg-bg-subtle"
      ].join(" ")}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
      ) : (
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      )}
      <span>{children}</span>
    </button>
  );
}

function DetailRow({
  label,
  value,
  tone,
  mono
}: {
  label: string;
  value: string;
  tone?: "rose";
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </dt>
      <dd
        className={[
          "mt-0.5 font-medium",
          mono && "font-mono",
          tone === "rose"
            ? "text-rose-600 dark:text-rose-400"
            : "text-fg"
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function TotalRow({
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
        emphasis && "border-t border-border pt-2 text-[14px] font-semibold"
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

function ExtendDueDialog({
  open,
  onClose,
  invoiceId,
  currentDueAt
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  currentDueAt: string | null;
}) {
  const router = useRouter();
  const [newDueAt, setNewDueAt] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await finance.extendDueDate(invoiceId, {
        newDueAt: new Date(newDueAt).toISOString(),
        reason: reason.trim() || undefined
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
      title="Extend due date"
      description={
        currentDueAt
          ? `Current due date: ${fmtDate(currentDueAt)}. Pick a new date.`
          : "Pick a new due date."
      }
    >
      <div className="space-y-3 text-[13px]">
        <label className="space-y-1 block">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            New due date
          </span>
          <input
            type="date"
            value={newDueAt}
            onChange={(e) => setNewDueAt(e.target.value)}
            className="h-10 w-full rounded-md border border-border bg-bg px-3 text-fg focus:border-accent focus:outline-none"
          />
        </label>
        <label className="space-y-1 block">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Reason (optional)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-fg focus:border-accent focus:outline-none"
          />
        </label>
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
        <Button onClick={submit} disabled={!newDueAt || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Extend"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function WaiveLateFeeDialog({
  open,
  onClose,
  invoiceId,
  lateFeeCents,
  currency
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  lateFeeCents: number;
  currency: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    if (reason.trim().length < 10) return setError("Reason must be at least 10 characters.");
    setBusy(true);
    setError(null);
    try {
      await finance.waiveLateFee(invoiceId, reason.trim());
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
      title="Waive late fee"
      description={`Removes the ${formatMoney(lateFeeCents, currency)} late fee from this invoice. Logged with reason.`}
    >
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="Reason (min 10 characters)"
        className="w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px] text-fg focus:border-accent focus:outline-none"
      />
      {error && (
        <p className="mt-2 rounded-md bg-rose-500/10 px-3 py-2 text-[13px] text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <DialogActions>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy || reason.trim().length < 10}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Waive"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function IssueWalletCreditDialog({
  open,
  onClose,
  personId,
  orgId,
  currency
}: {
  open: boolean;
  onClose: () => void;
  personId: string | null;
  orgId: string;
  currency: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    if (!personId) return setError("No recipient person on this invoice.");
    const cents = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return setError("Enter a valid amount.");
    if (reason.trim().length < 10) return setError("Reason must be at least 10 characters.");
    setBusy(true);
    setError(null);
    try {
      await finance.issueWalletCredit({
        personId,
        orgId,
        amountCents: cents,
        currency,
        reason: reason.trim()
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
      title="Issue wallet credit"
      description="Adds a credit to the recipient's wallet — applied automatically to the next invoice."
    >
      <div className="space-y-3 text-[13px]">
        <label className="block space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Amount ($)
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-10 w-full rounded-md border border-border bg-bg px-3 text-fg focus:border-accent focus:outline-none"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Reason (min 10 chars)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-fg focus:border-accent focus:outline-none"
          />
        </label>
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
        <Button onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Issue credit"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function VoidInvoiceDialog({
  open,
  onClose,
  invoiceId
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await finance.voidInvoice(invoiceId, reason.trim() || undefined);
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Void invoice"
      description="Voids the invoice. Outstanding balance becomes $0. Audit log records the reason."
    >
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="Reason (optional)"
        className="w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px] text-fg focus:border-accent focus:outline-none"
      />
      <DialogActions>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Void"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function MarkPaidOfflineDialog({
  open,
  onClose,
  invoiceId,
  orgId,
  balance,
  currency
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  orgId: string;
  balance: number;
  currency: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(((balance ?? 0) / 100).toFixed(2));
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    const cents = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return setError("Enter a valid amount.");
    setBusy(true);
    setError(null);
    try {
      await finance.recordPayment(invoiceId, {
        orgId,
        amountCents: cents,
        currency,
        method: method as
          | "cash"
          | "check"
          | "credit_card"
          | "etransfer"
          | "bank_transfer"
          | "manual"
          | "refund",
        status: "succeeded",
        receivedAt: new Date().toISOString(),
        notes: notes.trim() || null
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
      title="Mark as paid (offline)"
      description="Record a manual payment — cash, check, e-transfer."
    >
      <div className="space-y-3 text-[13px]">
        <label className="block space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Amount ($)
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-10 w-full rounded-md border border-border bg-bg px-3 text-fg focus:border-accent focus:outline-none"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Method
          </span>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="h-10 w-full rounded-md border border-border bg-bg px-3 text-fg focus:border-accent focus:outline-none"
          >
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="etransfer">E-transfer</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="manual">Other / manual</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Notes
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-fg focus:border-accent focus:outline-none"
          />
        </label>
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
        <Button onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function statusTone(
  status: string
): "info" | "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "paid":
      return "success";
    case "partial":
      return "warning";
    case "overdue":
      return "danger";
    case "sent":
      return "info";
    case "void":
    case "draft":
    default:
      return "neutral";
  }
}
