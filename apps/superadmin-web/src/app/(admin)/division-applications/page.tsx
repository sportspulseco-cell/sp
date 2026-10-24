import { load } from "@sportspulse/api-client";
import { LoadError } from "@sportspulse/ui";
import { adminTransfers } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { DivisionApplicationsQueue } from "./queue";

export const metadata = { title: "Division applications — SportsPulse" };
export const dynamic = "force-dynamic";

export default async function DivisionApplicationsPage() {
  const initialResult = await load(
    adminTransfers.listDivisionEntries({ status: "pending_approval,applied" })
  );
  if (!initialResult.ok) {
    console.error("[division-applications] listDivisionEntries failed", initialResult.status, initialResult.message);
  }
  const initial = initialResult.ok ? initialResult.data : { items: [] };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// admin · division applications"
        title="Division applications"
        description="Teams that submitted a rollover wizard but have not yet reached the confirmation threshold. Rejecting voids the master + sub invoices and spawns refund assessments for any paid sub."
      />
      {!initialResult.ok ? (
        <LoadError
          what="division applications"
          status={initialResult.status}
          message={initialResult.message}
        />
      ) : null}
      <DivisionApplicationsQueue initial={initial} />
    </div>
  );
}
