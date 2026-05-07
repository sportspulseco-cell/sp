import {
  AlertCircle,
  Check,
  Clock,
  CreditCard,
  Wallet
} from "lucide-react";
import {
  Badge,
  EmptyState,
  Eyebrow,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import type { Invoice, InvoiceItem } from "@sportspulse/api-client";
import { finance, iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Payments — SportsPulse" };

function fmtMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency
  }).format(cents / 100);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export default async function PaymentsPage() {
  const scope = await iam.meScope().catch(() => null);
  const personId = scope?.personId ?? null;

  const invoicesPage = personId
    ? await finance
        .listInvoices({ recipientPersonId: personId, limit: 100 })
        .catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  const invoices: Invoice[] = invoicesPage.items;
  const open = invoices.filter(
    (i: Invoice) => i.status !== "void" && i.totalCents > i.paidCents
  );
  const paid = invoices.filter(
    (i: Invoice) => i.status === "paid" || i.totalCents <= i.paidCents
  );

  const balanceCents = open.reduce(
    (a: number, i: Invoice) => a + Math.max(0, i.totalCents - i.paidCents),
    0
  );
  const totalReceived = invoices.reduce(
    (a: number, i: Invoice) => a + i.paidCents,
    0
  );
  const currency = invoices[0]?.currency ?? "USD";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Payments"
        title="Payments"
        description="Invoice timeline, balance, and payment history. Wallet credits and Stripe card management ship in a follow-up."
      />

      {/* Balance strip — emerald if paid in full, blue otherwise. The
          spec calls for a wallet credit row here too; deferred until
          we have a wallet ledger. */}
      <section
        className={
          "rounded-xl p-5 text-white " +
          (balanceCents === 0
            ? "bg-emerald-600 dark:bg-emerald-700"
            : "bg-[#185FA5]")
        }
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/70">
              {balanceCents === 0 ? "// Paid in full" : "// Balance due"}
            </p>
            <p className="mt-2 font-mono text-[28px] font-semibold tabular-nums">
              {fmtMoney(balanceCents, currency)}
            </p>
            <p className="mt-1 text-[12px] text-white/70">
              Total received this season:{" "}
              {fmtMoney(totalReceived, currency)}
            </p>
          </div>
          {balanceCents > 0 ? (
            <button
              type="button"
              disabled
              title="Stripe Pay-now coming soon"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/30 bg-white/10 px-3 font-mono text-[10px] uppercase tracking-widest text-white opacity-80"
            >
              <CreditCard className="h-3.5 w-3.5" strokeWidth={1.75} />
              Pay now
            </button>
          ) : null}
        </div>
      </section>

      {invoices.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No invoices yet"
          description="Once your registration is approved an invoice will be created here."
        />
      ) : (
        <>
          {/* Open invoices — each shown as its own card with line items
              and a status timeline. */}
          {open.length > 0 ? (
            <section className="space-y-4">
              <Eyebrow>// Open invoices</Eyebrow>
              {open.map((inv: Invoice) => (
                <InvoiceCard key={inv.id} invoice={inv} />
              ))}
            </section>
          ) : null}

          {/* Closed invoices */}
          {paid.length > 0 ? (
            <section className="space-y-4">
              <Eyebrow>// Payment history</Eyebrow>
              <div className="rounded-xl border border-border bg-surface-1">
                <Table>
                  <THead>
                    <TR>
                      <TH>Invoice</TH>
                      <TH>Issued</TH>
                      <TH>Due</TH>
                      <TH className="text-right">Total</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {paid.map((inv: Invoice) => (
                      <TR key={inv.id}>
                        <TD className="font-mono text-[11px] text-fg">
                          {inv.invoiceNumber}
                        </TD>
                        <TD className="text-[12px] text-fg-muted">
                          {inv.issuedAt ? fmtDate(inv.issuedAt) : "—"}
                        </TD>
                        <TD className="text-[12px] text-fg-muted">
                          {inv.dueAt ? fmtDate(inv.dueAt) : "—"}
                        </TD>
                        <TD className="text-right font-mono tabular-nums text-fg">
                          {fmtMoney(inv.totalCents, inv.currency)}
                        </TD>
                        <TD>
                          <Badge mono tone="success">
                            {inv.status}
                          </Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function InvoiceCard({ invoice }: { invoice: Invoice }) {
  const balance = Math.max(0, invoice.totalCents - invoice.paidCents);
  const overdue = invoice.status === "overdue";
  const partial = invoice.status === "partial";

  return (
    <div className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <p className="font-mono text-[12px] text-fg">
            {invoice.invoiceNumber}
          </p>
          {invoice.issuedAt ? (
            <p className="text-[11px] text-fg-muted">
              Issued {fmtDate(invoice.issuedAt)}
            </p>
          ) : null}
        </div>
        <Badge
          mono
          tone={
            overdue
              ? "danger"
              : partial
                ? "warning"
                : invoice.status === "paid"
                  ? "success"
                  : "info"
          }
        >
          {invoice.status}
        </Badge>
      </header>

      {/* Line items */}
      <div className="space-y-2 border-b border-border px-5 py-4">
        {(invoice.items ?? []).length > 0 ? (
          (invoice.items as InvoiceItem[]).map((it: InvoiceItem) => (
            <div
              key={it.id}
              className="flex items-center justify-between text-[12px]"
            >
              <span className="text-fg">{it.description}</span>
              <span className="font-mono tabular-nums text-fg-muted">
                {fmtMoney(it.amountCents, invoice.currency)}
              </span>
            </div>
          ))
        ) : (
          <p className="text-[12px] text-fg-muted">No line items recorded.</p>
        )}
        <div className="flex items-center justify-between border-t border-border pt-2 text-[13px]">
          <span className="font-medium text-fg">Total</span>
          <span className="font-mono tabular-nums font-semibold text-fg">
            {fmtMoney(invoice.totalCents, invoice.currency)}
          </span>
        </div>
      </div>

      {/* Timeline strip */}
      {balance > 0 ? (
        <div
          className={
            "flex items-center justify-between gap-3 px-5 py-3 text-[12px] " +
            (overdue
              ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
              : "bg-blue-500/10 text-blue-700 dark:text-blue-300")
          }
        >
          <span className="flex items-center gap-1.5 font-medium">
            {overdue ? (
              <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />
            ) : (
              <Clock className="h-3.5 w-3.5" strokeWidth={2} />
            )}
            {fmtMoney(balance, invoice.currency)}{" "}
            {overdue
              ? "overdue"
              : invoice.dueAt
                ? `due ${fmtDate(invoice.dueAt)}`
                : "outstanding"}
          </span>
          <span className="font-mono text-[11px]">
            Paid so far: {fmtMoney(invoice.paidCents, invoice.currency)}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-5 py-3 text-[12px] text-emerald-700 dark:text-emerald-300">
          <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
          Fully paid
        </div>
      )}
    </div>
  );
}
