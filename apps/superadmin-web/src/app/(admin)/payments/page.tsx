import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { finance, leagueMgmt, orgs } from "@/lib/api/server-api";
import { PaymentsHeader, type TabKey } from "./payments-header";
import { ArDashboardTab } from "./tabs/ar-dashboard-tab";
import { PlayerInvoiceTab } from "./tabs/player-invoice-tab";
import { DuesSplitTab } from "./tabs/dues-split-tab";
import { RefundTab } from "./tabs/refund-tab";
import { WalletTab } from "./tabs/wallet-tab";
import { OverdueTab } from "./tabs/overdue-tab";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Payment & invoicing — SportsPulse" };

const VALID_TABS: TabKey[] = [
  "ar",
  "invoice",
  "split",
  "refund",
  "wallet",
  "overdue"
];

export default async function PaymentsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const tabParam = sp.tab ?? "ar";
  if (!VALID_TABS.includes(tabParam as TabKey)) {
    redirect("/payments?tab=ar");
  }
  const tab = tabParam as TabKey;

  // Resolve the org context once and fan out to the active tab.
  // orgId comes from the URL when present; otherwise we pick the first
  // org the admin has access to.
  const orgId = sp.orgId ?? null;
  const [orgsPage] = await Promise.all([
    orgs.list({ limit: 1 }).catch(() => ({ items: [], nextCursor: null }))
  ]);
  const resolvedOrg = orgId
    ? await orgs.get(orgId).catch(() => null)
    : (orgsPage.items[0] ?? null);

  if (!resolvedOrg) {
    return (
      <EmptyState
        icon={Wallet}
        title="No organisation in scope"
        description="The Payment & invoicing surface needs an org. Create or select one first."
      />
    );
  }

  const activeOrgId = resolvedOrg.id;
  const seasonId = sp.seasonId ?? null;
  const [season, qbStatus] = await Promise.all([
    seasonId ? leagueMgmt.getSeason(seasonId).catch(() => null) : null,
    finance.qbSyncStatus(activeOrgId).catch(() => null)
  ]);

  return (
    <div className="space-y-8">
      <PaymentsHeader
        active={tab}
        orgName={resolvedOrg.displayName ?? resolvedOrg.legalName}
        seasonName={season?.name ?? null}
        qbStatus={qbStatus}
        searchParams={sp}
      />

      {tab === "ar" ? (
        <ArDashboardTab orgId={activeOrgId} />
      ) : null}
      {tab === "invoice" ? (
        <PlayerInvoiceTab orgId={activeOrgId} invoiceId={sp.invoiceId ?? null} />
      ) : null}
      {tab === "split" ? (
        <DuesSplitTab
          orgId={activeOrgId}
          invoiceId={sp.invoiceId ?? null}
          teamId={sp.teamId ?? null}
        />
      ) : null}
      {tab === "refund" ? (
        <RefundTab orgId={activeOrgId} invoiceId={sp.invoiceId ?? null} />
      ) : null}
      {tab === "wallet" ? (
        <WalletTab orgId={activeOrgId} personId={sp.personId ?? null} />
      ) : null}
      {tab === "overdue" ? (
        <OverdueTab orgId={activeOrgId} />
      ) : null}
    </div>
  );
}
