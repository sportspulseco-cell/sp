/* Hallmark · page: list (disputes) · genre: editorial · theme: project
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
import { Gavel } from "lucide-react";
import { EmptyState, SectionRail, LoadError } from "@sportspulse/ui";
import { loadMeScope, orgAdminRefundAssessments } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";
import { DisputesScreen } from "./disputes-screen";
import { load } from "@sportspulse/api-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Disputes · Org Admin" };

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

  const scope = await loadMeScope();
  const orgId = await getActiveOrgId(scope);

  if (!orgId) {
    return (
      <div className="space-y-12">
        <PageHeader eyebrow="Payments" title="Refund disputes" />
        <EmptyState
          icon={Gavel}
          title="No org in scope"
          description="Pick an org from the switcher to review its open disputes."
        />
      </div>
    );
  }

  const dataResult = await load(orgAdminRefundAssessments.list({ orgId, status }));
  const data = dataResult.ok ? dataResult.data : { items: [] };

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Disputes"
        title="Refund disputes"
        description="When a player is dropped from a paid roster or a team's application is rejected, the system queues a refund assessment. Decide them here: issue a refund, decline, or void."
      />

      <section className="space-y-6">
        <SectionRail
          index="01"
          label="Queue"
          subtitle="Filtered by status. Decisions made here propagate to the player's wallet / refund channel via the same path Stripe webhooks travel."
          meta={`${data.items.length} ${status}`}
        />
        {dataResult.ok ? (
          <DisputesScreen
            orgId={orgId}
            status={status}
            initialItems={data.items}
          />
        ) : (
          <LoadError what="refund disputes" status={dataResult.status} message={dataResult.message} />
        )}
      </section>
    </div>
  );
}
