/* Hallmark · page: list (finance) · genre: editorial · theme: project
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
import Link from "next/link";
import {
  AlertTriangle,
  Files,
  Receipt,
  Wallet
} from "lucide-react";
import { SectionRail, StatTile } from "@sportspulse/ui";
import { iam, finance } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";
import { InvoiceTable } from "./invoice-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance - Org Admin" };

function fmtMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency
  }).format(cents / 100);
}

export default async function FinancePage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  const invoicesPage = orgId
    ? await finance
        .listInvoices({ orgId, limit: 200 })
        .catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  const open = invoicesPage.items.filter(
    (i) => i.status !== "void" && i.totalCents > i.paidCents
  );
  const balanceCents = open.reduce(
    (a, i) => a + (i.totalCents - i.paidCents),
    0
  );
  const overdueCount = invoicesPage.items.filter(
    (i) => i.status === "overdue"
  ).length;
  const currency = invoicesPage.items[0]?.currency ?? "USD";

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Finance"
        title="Finance"
        description="Outstanding receivables for your org. Issue new invoices, record offline payments inline. Aging-bucket reporting lives in the super-admin console."
        action={
          orgId ? (
            <Link
              href="/finance/create"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-accent-fg transition-colors duration-fast ease-ease hover:bg-[var(--accent-hover)]"
            >
              <Receipt className="h-3.5 w-3.5" strokeWidth={2} />
              New invoice
            </Link>
          ) : null
        }
      />

      <section className="space-y-6">
        <SectionRail
          index="01"
          label="Receivables"
          subtitle="Snapshot of money owed to your org right now. Open invoices is anything not yet paid in full; overdue is anything past its due date."
        />
        <div className="grid gap-4 md:grid-cols-3">
          <StatTile
            icon={Wallet}
            label="Outstanding"
            value={fmtMoney(balanceCents, currency)}
            hint={`${open.length} open invoice${open.length === 1 ? "" : "s"}`}
            tone={overdueCount > 0 ? "rose" : "blue"}
          />
          <StatTile
            icon={Files}
            label="Total invoices"
            value={String(invoicesPage.items.length)}
            hint="across the season to date"
            tone="violet"
          />
          <StatTile
            icon={AlertTriangle}
            label="Overdue"
            value={String(overdueCount)}
            hint={overdueCount > 0 ? "need follow-up" : "all current"}
            tone={overdueCount > 0 ? "rose" : "emerald"}
          />
        </div>
      </section>

      <section className="space-y-6">
        <SectionRail
          index="02"
          label="Ledger"
          subtitle="Every invoice issued for this org. Record an offline payment inline; the same path Stripe webhooks follow downstream."
          meta={`${invoicesPage.items.length} total`}
        />
        <InvoiceTable invoices={invoicesPage.items} />
      </section>
    </div>
  );
}
