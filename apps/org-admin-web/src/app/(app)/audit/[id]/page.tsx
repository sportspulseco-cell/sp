import { load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError } from "@sportspulse/ui";
import { AuditEventDetail } from "@sportspulse/admin-pages";
import { audit } from "@/lib/api/server-api";

export const metadata = { title: "Audit event · Org Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Org-admin's audit-event detail. Mounts the shared
 * @sportspulse/admin-pages AuditEventDetail. The /audit/:id endpoint
 * lives behind AuthorizedAccessGuard + scope filtering inside the
 * query handler — org_admin only sees events for orgs in their scope,
 * so no proxy is needed here.
 */
export default async function OrgAdminAuditDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const eventResult = await load(audit.get(id));
  if (!eventResult.ok) {
    if (eventResult.status === 404) notFound();
    return (
      <LoadError
        what="this audit event"
        status={eventResult.status}
        message={eventResult.message}
      />
    );
  }
  const event = eventResult.data;

  return <AuditEventDetail event={event} />;
}
