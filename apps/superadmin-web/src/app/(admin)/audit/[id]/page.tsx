import { notFound } from "next/navigation";
import { AuditEventDetail } from "@sportspulse/admin-pages";
import { audit } from "@/lib/api/server-api";

export const metadata = { title: "Audit event — SportsPulse" };

export default async function AuditDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await audit.get(id).catch(() => null);
  if (!event) notFound();

  return <AuditEventDetail event={event} />;
}
