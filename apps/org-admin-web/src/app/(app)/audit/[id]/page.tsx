import { notFound } from "next/navigation";
import { AuditEventDetail } from "@sportspulse/admin-pages";
import { audit } from "@/lib/api/server-api";

export const metadata = { title: "Audit event — Org Admin" };
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
  const event = await audit.get(id).catch(() => null);
  if (!event) notFound();

  return <AuditEventDetail event={event} />;
}
