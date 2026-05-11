import { adminTransfers } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { TransfersQueue } from "./transfers-queue";

export const metadata = { title: "Transfers — SportsPulse" };
export const dynamic = "force-dynamic";

export default async function AdminTransfersPage() {
  const initial = await adminTransfers
    .list({ status: "pending_admin" })
    .catch(() => ({ items: [] }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// admin · transfers"
        title="Player transfers"
        description="Captain-initiated transfers awaiting admin approval. Approving writes drop + add roster_moves and adjusts both teams' sub-invoices."
      />
      <TransfersQueue initial={initial} />
    </div>
  );
}
