import { ArrowLeft, Receipt } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { finance } from "@/lib/api/server-api";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { InvoiceStatusBadge } from "@/components/finance/invoice-status-badge";
import { formatMoney } from "@/components/finance/money";
import { RecordPaymentForm } from "@/components/finance/record-payment-form";

export const metadata = { title: "Invoice — SportsPulse" };

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default async function InvoiceDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const inv = await finance.getInvoice(id).catch(() => null);
  if (!inv) notFound();
  const payments = await finance.listPayments(id).catch(() => []);

  const balance = Math.max(0, inv.totalCents - inv.paidCents);

  return (
    <div className="space-y-8">
      <Link
        href="/finance"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All invoices
      </Link>

      {/* Header */}
      <header className="flex items-start gap-5 border-b border-border pb-8">
        <IconTile icon={Receipt} tint="violet" size="lg" />
        <div className="space-y-2">
          <Eyebrow dot>INVOICE · {inv.invoiceNumber}</Eyebrow>
          <h1 className="font-mono text-[36px] font-semibold tabular-nums tracking-tight text-fg">
            {formatMoney(inv.totalCents, inv.currency)}
          </h1>
          <div className="flex items-center gap-2 pt-1">
            <InvoiceStatusBadge status={inv.status} />
            <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
              Due {fmtDateTime(inv.dueAt)}
            </span>
          </div>
        </div>
        <div className="ml-auto grid grid-cols-3 gap-3 text-right">
          <Stat
            label="Subtotal"
            value={formatMoney(inv.subtotalCents, inv.currency)}
          />
          <Stat
            label="Paid"
            value={formatMoney(inv.paidCents, inv.currency)}
            tone={inv.paidCents > 0 ? "success" : undefined}
          />
          <Stat
            label="Balance"
            value={formatMoney(balance, inv.currency)}
            tone={balance > 0 ? "warning" : "success"}
          />
        </div>
      </header>

      {/* Line items */}
      <section className="rounded-xl border border-border bg-surface-1">
        <header className="border-b border-border px-6 py-4">
          <Eyebrow>Line items</Eyebrow>
        </header>
        <Table>
          <THead>
            <TR>
              <TH>Description</TH>
              <TH>Kind</TH>
              <TH className="text-right">Qty</TH>
              <TH className="text-right">Unit</TH>
              <TH className="text-right">Amount</TH>
            </TR>
          </THead>
          <TBody>
            {inv.items.map((it) => (
              <TR key={it.id}>
                <TD className="text-fg">{it.description}</TD>
                <TD className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                  {it.kind.replace(/_/g, " ")}
                </TD>
                <TD className="text-right font-mono tabular-nums text-fg-muted">
                  {it.quantity}
                </TD>
                <TD className="text-right font-mono tabular-nums text-fg-muted">
                  {formatMoney(it.unitAmountCents, inv.currency)}
                </TD>
                <TD className="text-right font-mono tabular-nums text-fg">
                  {formatMoney(it.amountCents, inv.currency)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </section>

      {/* Payments + Record form */}
      <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border border-border bg-surface-1">
          <header className="border-b border-border px-6 py-4">
            <Eyebrow>Payments</Eyebrow>
            <p className="mt-1 text-[13px] text-fg-muted">
              {payments.length}{" "}
              {payments.length === 1 ? "receipt" : "receipts"} · newest first
            </p>
          </header>
          {payments.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-fg-muted">
              No payments yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {payments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-4 px-6 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[14px] font-semibold tabular-nums text-fg">
                      {formatMoney(p.amountCents, p.currency)}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                      {p.method.replace(/_/g, " ")} · {p.status} ·{" "}
                      {fmtDateTime(p.receivedAt)}
                    </p>
                    {p.notes ? (
                      <p className="mt-1 text-[12px] text-fg-muted">
                        {p.notes}
                      </p>
                    ) : null}
                  </div>
                  {p.externalProviderId ? (
                    <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                      {p.externalProviderId.slice(0, 12)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface-1">
          <header className="border-b border-border px-6 py-4">
            <Eyebrow>Record payment</Eyebrow>
            <p className="mt-1 text-[13px] text-fg-muted">
              Manual entry — cash, check, e-transfer.
            </p>
          </header>
          <div className="p-6">
            <RecordPaymentForm
              invoiceId={inv.id}
              orgId={inv.orgId}
              currency={inv.currency}
              defaultAmountCents={balance}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  return (
    <div className="min-w-[120px] rounded-lg border border-border bg-surface-1 px-3 py-2.5">
      <p className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
        {label}
      </p>
      <p
        className={
          "mt-1 font-mono text-[16px] font-semibold tabular-nums tracking-tight " +
          (tone === "success"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "warning"
              ? "text-amber-600 dark:text-amber-400"
              : "text-fg")
        }
      >
        {value}
      </p>
    </div>
  );
}
