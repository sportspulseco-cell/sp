import { load } from "@sportspulse/api-client";
import { LoadError } from "@sportspulse/ui";
import { adminTransfers } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { TransfersQueue } from "./transfers-queue";

export const metadata = { title: "Transfers — SportsPulse" };
export const dynamic = "force-dynamic";

export default async function AdminTransfersPage() {
  const initialResult = await load(adminTransfers.list({ status: "pending_admin" }));
  if (!initialResult.ok) {
    console.error("[transfers] list failed", initialResult.status, initialResult.message);
  }
  const initial = initialResult.ok ? initialResult.data : { items: [] };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// admin · transfers"
        title="Player transfers"
        description="Captain-initiated transfers awaiting admin approval. Approving writes drop + add roster_moves and adjusts both teams' sub-invoices."
      />
      {!initialResult.ok ? (
        <LoadError
          what="transfers"
          status={initialResult.status}
          message={initialResult.message}
        />
      ) : null}
      <TransfersQueue initial={initial} />
    </div>
  );
}
