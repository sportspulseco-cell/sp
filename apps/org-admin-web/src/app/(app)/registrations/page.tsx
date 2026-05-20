/* Hallmark · page: list (registrations) · genre: editorial · theme: project
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
import { ScrollText } from "lucide-react";
import { EmptyState, SectionRail } from "@sportspulse/ui";
import { iam, registration } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";
import { RegistrationsTable } from "./registrations-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registrations - Org Admin" };

const PENDING_PREFIX = "pending_";

export default async function RegistrationsPage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  const page = orgId
    ? await registration.listRegistrations({ orgId }).catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  const pending = page.items.filter((r) => {
    const v = r.status as string;
    return v === "submitted" || v === "under_review" || v.startsWith(PENDING_PREFIX);
  }).length;

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Registrations"
        title="Registrations"
        description="Every registration submitted across your org's seasons. Approve or reject pending submissions inline; the super-admin queue still handles compliance-flag overrides."
      />

      <section className="space-y-6">
        <SectionRail
          index="01"
          label="Queue"
          subtitle="Each row is one submission from the public funnel. Pending entries surface first; act on them to advance the cohort to active rosters."
          meta={`${pending} pending · ${page.items.length} total`}
        />
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          {page.items.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                icon={ScrollText}
                title="No registrations yet"
                description="Submissions land here as soon as the public funnel takes them."
              />
            </div>
          ) : (
            <RegistrationsTable
              items={page.items.map((r) => ({
                id: r.id,
                subjectPersonId: r.subjectPersonId,
                status: r.status as string,
                submittedAt: r.submittedAt
              }))}
            />
          )}
        </div>
      </section>
    </div>
  );
}
