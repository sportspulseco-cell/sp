import { formatCalendarDate, formatMoney } from "@sportspulse/kernel";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isNotFound, load } from "@sportspulse/api-client";
import { Badge, LoadError, TBody, TD, TH, THead, TR, Table } from "@sportspulse/ui";
import { orgAdminFinance } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoice — SportsPulse" };

function day(iso: string | null | undefined) {
  return formatCalendarDate(iso) || "—";
}

/**
 * One invoice for an org admin (MON-19): who owes what, the lines, what
 * was paid and when, the payment plan and any refunds. Read-only here;
 * offline payments are recorded from the Finance list. The API returns
 * 404 for another org's invoice.
 */
export default async function OrgInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await load(orgAdminFinance.invoiceDetail(id));
  if (!result.ok) {
    if (isNotFound(result)) notFound();
    return <LoadError what="this invoice" status={result.status} message={result.message} />;
  }
  const { invoice, items, payments, installments, refunds } = result.data;
  const cur = invoice.currency;
  const outstanding = Math.max(0, invoice.totalCents - invoice.paidCents);

  return (
    <div className="space-y-8">
      <Link href="/finance" className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Finance
      </Link>
      <PageHeader
        eyebrow={invoice.invoiceNumber}
        title={invoice.recipientEmail ?? "Invoice"}
        description={`Issued ${day(invoice.issuedAt)} · due ${day(invoice.dueAt)}`}
        action={<Badge mono tone={invoice.status === "paid" ? "success" : invoice.status === "void" ? "neutral" : "warning"}>{invoice.status}</Badge>}
      />

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["Total", formatMoney(invoice.totalCents, cur)],
          ["Paid", formatMoney(invoice.paidCents, cur)],
          ["Outstanding", formatMoney(outstanding, cur)]
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-surface-1 p-4">
            <p className="text-[12px] text-fg-muted">{label}</p>
            <p className="mt-1 font-mono text-[18px] tabular-nums text-fg">{value}</p>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-fg">Lines</h2>
        <Table>
          <THead>
            <TR>
              <TH>Description</TH>
              <TH>Qty</TH>
              <TH className="text-right">Amount</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((it) => (
              <TR key={it.id}>
                <TD>{it.description}</TD>
                <TD>{it.quantity}</TD>
                <TD className="text-right font-mono tabular-nums">{formatMoney(it.unitAmountCents * it.quantity, cur)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-fg">Payments</h2>
        {payments.length === 0 ? (
          <p className="text-[13px] text-fg-muted">No payments yet. Record an offline payment from the Finance list.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Method</TH>
                <TH>Status</TH>
                <TH className="text-right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {payments.map((p) => (
                <TR key={p.id}>
                  <TD>{day(p.receivedAt)}</TD>
                  <TD>{p.method.replace(/_/g, " ")}</TD>
                  <TD>{p.status}</TD>
                  <TD className="text-right font-mono tabular-nums">{formatMoney(p.amountCents, p.currency)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      {installments.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-[15px] font-semibold text-fg">Payment plan</h2>
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Due</TH>
                <TH>Status</TH>
                <TH className="text-right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {installments.map((i) => (
                <TR key={i.id}>
                  <TD>{i.installmentNumber === 0 ? "Deposit" : i.installmentNumber}</TD>
                  <TD>{day(i.dueDate)}</TD>
                  <TD>{i.status}</TD>
                  <TD className="text-right font-mono tabular-nums">{formatMoney(i.amountCents, cur)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      ) : null}

      {refunds.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-[15px] font-semibold text-fg">Refunds</h2>
          <Table>
            <THead>
              <TR>
                <TH>Type</TH>
                <TH>Reason</TH>
                <TH className="text-right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {refunds.map((r) => (
                <TR key={r.id}>
                  <TD>{r.refundType.replace(/_/g, " ")}</TD>
                  <TD>{r.reason}</TD>
                  <TD className="text-right font-mono tabular-nums">{formatMoney(r.amountCents, r.currency)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}
