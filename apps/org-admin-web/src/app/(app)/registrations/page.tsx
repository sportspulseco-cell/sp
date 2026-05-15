import { ScrollText } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { iam, registration } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";
import { RegistrationsTable } from "./registrations-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registrations - Org Admin" };

export default async function RegistrationsPage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  const page = orgId
    ? await registration.listRegistrations({ orgId }).catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Registrations"
        title="Registrations"
        description="Every registration submitted across your org's seasons. Approve / reject pending submissions inline; the super-admin queue still handles compliance-flag overrides."
      />
      {page.items.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No registrations yet"
          description="Submissions land here as soon as the public funnel takes them."
        />
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
  );
}
