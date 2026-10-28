import { load } from "@sportspulse/api-client";
import { LoadError, PageHeader } from "@sportspulse/ui";
import { adminTransfers } from "@/lib/api/server-api";
import { DivisionApplicationsQueue } from "./queue";

export const metadata = { title: "Division applications · Super Admin" };
export const dynamic = "force-dynamic";

export default async function DivisionApplicationsPage() {
  const initialResult = await load(
    adminTransfers.listDivisionEntries({ status: "pending_approval" })
  );
  if (!initialResult.ok) {
    console.error("[division-applications] listDivisionEntries failed", initialResult.status, initialResult.message);
  }
  const initial = initialResult.ok ? initialResult.data : { items: [] };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Teams"
        title="Team applications"
        description="Teams waiting for your decision. After you approve, the captain sets up dues and the roster."
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
