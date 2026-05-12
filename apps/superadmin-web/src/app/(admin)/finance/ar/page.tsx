import { finance, orgs, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { ArDashboardClient } from "@/components/finance/ar-dashboard-client";

export const metadata = { title: "Invoices & AR — SportsPulse" };
export const dynamic = "force-dynamic";

export default async function ARDashboardPage({
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

  const [summary, invoices, orgList, feeSchedulesPage] = await Promise.all([
    finance
      .dashboardSummary(orgId)
      .catch(() => ({
        totalInvoicedCents: 0,
        collectedCents: 0,
        outstandingCents: 0,
        overdueCents: 0,
        invoiceCount: 0,
        overdueCount: 0
      })),
    finance
      .adminInvoicesList({ orgId, status, billingScope: scope, search, page, limit })
      .catch(() => ({ items: [], page: 1, limit })),
    orgs.list({ limit: 500 }).catch(() => ({ items: [], nextCursor: null })),
    finance
      .listFeeSchedules({ limit: 100, isActive: true })
      .catch(() => ({ items: [], nextCursor: null }))
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="finance"
        title="Invoices & AR"
        description="Every invoice across the platform — issued, collected, outstanding, and overdue. Create new invoices, drill into any row, and resolve AR escalations."
      />
      <ArDashboardClient
        summary={summary}
        invoices={invoices}
        orgs={orgList.items}
        feeSchedules={feeSchedulesPage.items}
        filters={{ orgId, status, scope, search, page }}
      />
    </div>
  );
}
