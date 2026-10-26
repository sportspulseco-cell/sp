import { load } from "@sportspulse/api-client";
import { LoadError, PageHeader } from "@sportspulse/ui";
import { adminTransfers } from "@/lib/api/server-api";
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
        eyebrow="Teams"
        title="Player transfers"
        description="Players moving between teams mid-season, waiting for your approval. Approving updates both rosters and their dues."
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
