import { Gavel } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { iam, orgAdminRefundAssessments } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";
import { DisputesScreen } from "./disputes-screen";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Disputes — Org admin" };

/**
 * Backlog #17c — org-admin dispute resolution.
 *
 * Refund assessments are created by the captain drop / admin reject /
 * transfer-approve flows. Pending ones queue up here for org-admins
 * to adjudicate: full refund, partial refund, no refund, or void.
 */
export default async function DisputesPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = (sp.status as
    | "pending"
    | "resolved_refund"
    | "resolved_no_refund"
    | "void"
    | "all"
    | undefined) ?? "pending";

  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  if (!orgId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Disputes" title="Disputes" />
        <EmptyState
          icon={Gavel}
          title="No org in scope"
          description="Pick an org from the switcher to review its open disputes."
        />
      </div>
    );
  }

  const data = await orgAdminRefundAssessments
    .list({ orgId, status })
    .catch(() => ({ items: [] }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Disputes"
        title="Refund disputes"
        description="When a player is dropped from a paid roster or a team's application is rejected, the system queues a refund assessment. Adjudicate them here — issue a refund, decline, or void."
      />
      <DisputesScreen
        orgId={orgId}
        status={status}
        initialItems={data.items}
      />
    </div>
  );
}
