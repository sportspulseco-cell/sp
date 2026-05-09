import Link from "next/link";
import { Wallet as WalletIcon } from "lucide-react";
import { Badge, EmptyState } from "@sportspulse/ui";
import type { Invoice, Payment } from "@sportspulse/api-client";
import { finance } from "@/lib/api/server-api";
import { fmtMoney, fmtDate } from "../lib/format";
import {
  DEMO_MODE,
  mockCardOnFile,
  mockUpcomingFromInvoice
} from "../lib/mock-data";
import { DemoBadge } from "../lib/demo-badge";

/**
 * Player invoice tab — pixel-matches the mockup's two-card layout:
 *   1. "Your invoice" — line items table, payment timeline, paid-so-far progress.
 *   2. "Pay next installment" — banner + Update card / Use wallet buttons.
 *
 * All fields trace to existing schema columns:
 *   invoices.invoiceNumber          → INV-… header
 *   invoices.{subtotal/tax/discount/total}Cents → line items totals
 *   invoiceItems[]                  → table rows
 *   payments[]                      → timeline entries (status=succeeded)
 *   invoices.paidCents              → paid-so-far footer
 *   metadata.paymentMethod (Stripe) → "Card on file: Visa ending 4242"
 */
export async function PlayerInvoiceTab({
  orgId,
  invoiceId
}: {
  orgId: string;
  invoiceId: string | null;
}) {
  if (!invoiceId) {
    return (
      <EmptyState
        icon={WalletIcon}
        title="Pick an invoice"
        description="Open the AR dashboard and click an invoice to render it here. The URL carries ?invoiceId=… so the rest of the tabs share context."
      />
    );
  }

  const [invoice, payments] = await Promise.all([
    finance.getInvoice(invoiceId).catch(() => null),
    finance.listPayments(invoiceId).catch(() => [] as Payment[])
  ]);
  if (!invoice) {
    return (
      <EmptyState
        icon={WalletIcon}
        title="Invoice not found"
        description="The invoice may have been voided or the link is stale."
      />
    );
  }

  const items = invoice.items ?? [];
  const realCard = readCardOnFile(invoice, payments);
  const cardOnFile = realCard ?? (DEMO_MODE ? mockCardOnFile() : null);
  const cardIsMock = !realCard && cardOnFile !== null;
  const wallet = invoice.recipientPersonId
    ? await finance
        .getWallet({
          personId: invoice.recipientPersonId,
          orgId,
          currency: invoice.currency
        })
        .catch(() => null)
    : null;

  const successfulPayments = payments.filter((p) => p.status === "succeeded");
  const realUpcoming = readUpcomingFromMetadata(invoice);
  const upcoming =
    realUpcoming.length > 0
      ? realUpcoming
      : DEMO_MODE
        ? mockUpcomingFromInvoice(invoice)
        : [];
  const upcomingIsMock = realUpcoming.length === 0 && upcoming.length > 0;
  const nextDue = upcoming.find((u) => u.status === "upcoming");

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface-1 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="text-[18px] font-semibold tracking-tight text-fg">
              Your invoice
            </p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-fg-muted">
              {invoice.invoiceNumber}
              {invoice.notes ? ` · ${invoice.notes}` : ""}
            </p>
          </div>
          <Badge mono tone={statusTone(invoice.status)}>
            {invoice.status}
          </Badge>
        </div>

        <table className="mt-4 w-full">
          <tbody className="divide-y divide-border">
            {items.length === 0 ? (
              <tr>
                <td className="py-3 text-[13px] text-fg-muted">No line items.</td>
                <td />
              </tr>
            ) : (
              items.map((it) => {
                const isNegative = it.amountCents < 0;
                return (
                  <tr key={it.id}>
                    <td className="py-2 pr-3 text-[13px] text-fg">
                      {it.description}
                    </td>
                    <td
                      className={`py-2 text-right font-mono text-[13px] tabular-nums ${
                        isNegative
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-fg"
                      }`}
                    >
                      {fmtMoney(it.amountCents, invoice.currency)}
                    </td>
                  </tr>
                );
              })
            )}
            {invoice.taxCents > 0 ? (
              <tr>
                <td className="py-2 pr-3 text-[13px] text-fg-muted">Tax</td>
                <td className="py-2 text-right font-mono text-[13px] tabular-nums text-fg">
                  {fmtMoney(invoice.taxCents, invoice.currency)}
                </td>
              </tr>
            ) : null}
            <tr className="border-t-2 border-border">
              <td className="py-2 pr-3 text-[13px] font-medium text-fg">Total</td>
              <td className="py-2 text-right font-mono text-[14px] font-semibold tabular-nums text-fg">
                {fmtMoney(invoice.totalCents, invoice.currency)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-6 space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Payment timeline
            {upcomingIsMock ? <DemoBadge label="demo upcoming" /> : null}
          </p>
          <ul className="space-y-2">
            {successfulPayments.map((p) => (
              <TimelineRow
                key={p.id}
                date={fmtDate(p.receivedAt)}
                label={p.notes ?? p.method.replace(/_/g, " ")}
                amount={fmtMoney(p.amountCents, invoice.currency)}
                tone="success"
                statusLabel="Paid"
              />
            ))}
            {upcoming.map((u, i) => (
              <TimelineRow
                key={`upcoming-${i}`}
                date={fmtDate(u.dueAt)}
                label={u.label}
                amount={fmtMoney(u.amountCents, invoice.currency)}
                tone={u.status === "upcoming" ? "info" : "neutral"}
                statusLabel={u.status === "upcoming" ? "Upcoming" : "Scheduled"}
              />
            ))}
            {successfulPayments.length === 0 && upcoming.length === 0 ? (
              <li className="text-[12px] text-fg-muted">
                No payments recorded yet — when payments land they appear here in
                chronological order.
              </li>
            ) : null}
          </ul>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="font-mono text-[12px] text-fg-muted">Paid so far</p>
          <p className="font-mono text-[13px] tabular-nums text-emerald-700 dark:text-emerald-400">
            {fmtMoney(invoice.paidCents, invoice.currency)} of{" "}
            {fmtMoney(invoice.totalCents, invoice.currency)}
          </p>
        </div>
      </section>

      {nextDue ? (
        <section className="space-y-3 rounded-xl border border-border bg-surface-1 p-6">
          <p className="text-[16px] font-semibold tracking-tight text-fg">
            Pay next installment
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 text-blue-800 dark:text-blue-200">
            <div className="min-w-0">
              <p className="text-[13px] font-medium">
                {nextDue.label} due {fmtDate(nextDue.dueAt)}
              </p>
              <p className="mt-1 text-[12px] opacity-80">
                {fmtMoney(nextDue.amountCents, invoice.currency)} will be
                auto-charged to your card on file.
              </p>
            </div>
            <button
              type="button"
              disabled
              title="Stripe Checkout integration ships separately — see doc/deferred-integrations.md #1"
              className="inline-flex h-9 items-center rounded-md bg-blue-600 px-4 font-mono text-[11px] uppercase tracking-widest text-white hover:bg-blue-700 disabled:opacity-60"
            >
              Pay now
            </button>
          </div>
          {cardOnFile ? (
            <p className="font-mono text-[11px] text-fg-muted">
              Card on file: {cardOnFile.brand} ending {cardOnFile.last4}
              {cardOnFile.expMonth && cardOnFile.expYear
                ? ` · Expires ${String(cardOnFile.expMonth).padStart(2, "0")}/${String(cardOnFile.expYear).slice(-2)}`
                : ""}
              {cardIsMock ? <DemoBadge label="demo card" /> : null}
            </p>
          ) : (
            <p className="font-mono text-[11px] text-fg-muted">
              No card on file. Add one to enable auto-charge.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
            >
              Update card
            </button>
            {wallet && wallet.balanceCents > 0 ? (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
              >
                <WalletIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                Use wallet ({fmtMoney(wallet.balanceCents, wallet.currency)})
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        Schema:{" "}
        <span className="text-accent">
          invoices · invoice_items · payments · installment_schedules · wallet_accounts
        </span>
      </p>

      {invoice.recipientPersonId ? (
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          <Link
            href={`/payments?tab=refund&invoiceId=${invoice.id}`}
            className="underline hover:text-fg"
          >
            Issue refund →
          </Link>
          <span className="mx-3">·</span>
          <Link
            href={`/payments?tab=wallet&personId=${invoice.recipientPersonId}`}
            className="underline hover:text-fg"
          >
            View wallet →
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function TimelineRow({
  date,
  label,
  amount,
  tone,
  statusLabel
}: {
  date: string;
  label: string;
  amount: string;
  tone: "success" | "info" | "neutral";
  statusLabel: string;
}) {
  const dotClass =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "info"
        ? "bg-blue-500"
        : "bg-fg-muted";
  const badgeTone: "success" | "info" | "neutral" =
    tone === "success" ? "success" : tone === "info" ? "info" : "neutral";
  return (
    <li className="flex items-center gap-3">
      <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
          {date} · {label}
        </p>
        <p className="font-mono text-[14px] tabular-nums text-fg">{amount}</p>
      </div>
      <Badge mono tone={badgeTone}>
        {statusLabel}
      </Badge>
    </li>
  );
}

interface CardOnFile {
  brand: string;
  last4: string;
  expMonth?: number;
  expYear?: number;
}

/**
 * Pull card-on-file details out of payment metadata. Stripe webhooks
 * stash these on the most recent successful charge — fall back to the
 * invoice metadata if the worker writes them there.
 */
function readCardOnFile(invoice: Invoice, payments: Payment[]): CardOnFile | null {
  for (const p of payments) {
    const md = p.metadata as Record<string, unknown> | undefined;
    const card = md && typeof md === "object" ? (md.card as Record<string, unknown> | undefined) : undefined;
    if (card && typeof card.last4 === "string") {
      return {
        brand: typeof card.brand === "string" ? card.brand : "Card",
        last4: String(card.last4),
        expMonth: typeof card.expMonth === "number" ? card.expMonth : undefined,
        expYear: typeof card.expYear === "number" ? card.expYear : undefined
      };
    }
  }
  const md = invoice.metadata as Record<string, unknown> | undefined;
  const card = md && typeof md === "object" ? (md.cardOnFile as Record<string, unknown> | undefined) : undefined;
  if (card && typeof card.last4 === "string") {
    return {
      brand: typeof card.brand === "string" ? card.brand : "Card",
      last4: String(card.last4),
      expMonth: typeof card.expMonth === "number" ? card.expMonth : undefined,
      expYear: typeof card.expYear === "number" ? card.expYear : undefined
    };
  }
  return null;
}

interface UpcomingEntry {
  label: string;
  dueAt: string;
  amountCents: number;
  status: "upcoming" | "scheduled";
}

/**
 * Pull upcoming installments out of invoice metadata. The
 * registration-v2 module's installment_schedules table is the proper
 * source — this UI shows whatever the worker has materialised onto
 * the invoice.metadata.upcoming array. Returns [] if absent.
 */
function readUpcomingFromMetadata(invoice: Invoice): UpcomingEntry[] {
  const md = invoice.metadata as Record<string, unknown> | undefined;
  if (!md || typeof md !== "object") return [];
  const upcoming = (md as { upcoming?: unknown }).upcoming;
  if (!Array.isArray(upcoming)) return [];
  return upcoming
    .map((u): UpcomingEntry | null => {
      if (!u || typeof u !== "object") return null;
      const o = u as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label : "Installment";
      const dueAt = typeof o.dueAt === "string" ? o.dueAt : null;
      const amountCents = typeof o.amountCents === "number" ? o.amountCents : null;
      const status = o.status === "scheduled" ? "scheduled" : "upcoming";
      if (!dueAt || amountCents === null) return null;
      return { label, dueAt, amountCents, status };
    })
    .filter((x): x is UpcomingEntry => x !== null);
}

function statusTone(
  status: string
): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "paid") return "success";
  // Mockup shows the "Partial" pill in soft blue rather than amber.
  if (status === "partial") return "info";
  if (status === "sent") return "warning";
  if (status === "overdue") return "danger";
  if (status === "void") return "neutral";
  return "info";
}
