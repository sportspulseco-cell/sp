import { load } from "@sportspulse/api-client";
import { LoadError } from "@sportspulse/ui";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { finance, orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { ArDashboardClient } from "@/components/finance/ar-dashboard-client";

export const metadata = { title: "Invoices & AR — SportsPulse" };
export const dynamic = "force-dynamic";

export default async function FinancePage({
  searchParams
}: {
  searchParams: Promise<{
    orgId?: string;
    status?: string;
    scope?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const orgId = params.orgId || undefined;
  const status = params.status || undefined;
  const scope = params.scope || undefined;
  const search = params.q || undefined;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 25;

  // A failed call is a load error on screen, never $0 tiles (a league
  // admin used to get $0 from a silent catch while the API refused them).
  const [summaryResult, invoicesResult, orgList] = await Promise.all([
    load(finance.dashboardSummary(orgId)),
    load(
      finance.adminInvoicesList({ orgId, status, billingScope: scope, search, page, limit })
    ),
    orgs.list({ limit: 100 }).catch(() => ({ items: [], nextCursor: null }))
  ]);
  if (!summaryResult.ok) {
    console.error("[finance] dashboardSummary failed", summaryResult.status, summaryResult.message);
    return (
      <LoadError what="the invoice totals" status={summaryResult.status} message={summaryResult.message} />
    );
  }
  const summary = summaryResult.data;
  if (!invoicesResult.ok) {
    console.error("[finance] adminInvoicesList failed", invoicesResult.status, invoicesResult.message);
  }
  const invoices = invoicesResult.ok
    ? invoicesResult.data
    : { items: [], page: 1, limit };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Payments"
        title="Invoices"
        description="Every invoice: sent, paid, outstanding, overdue. Create an invoice, or open one to record a payment or refund."
        action={
          <Link
            href="/finance/create"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-accent-fg hover:bg-[var(--accent-hover)]"
          >
            <Receipt className="h-3.5 w-3.5" strokeWidth={2} />
            New invoice
          </Link>
        }
      />
      {!invoicesResult.ok ? (
        <LoadError
          what="invoices"
          status={invoicesResult.status}
          message={invoicesResult.message}
        />
      ) : null}
      <ArDashboardClient
        summary={summary}
        invoices={invoices}
        orgs={orgList.items}
        filters={{ orgId, status, scope, search, page }}
      />
    </div>
  );
}
