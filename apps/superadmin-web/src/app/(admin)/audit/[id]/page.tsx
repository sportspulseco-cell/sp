import { load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError } from "@sportspulse/ui";
import { AuditEventDetail } from "@sportspulse/admin-pages";
import { audit } from "@/lib/api/server-api";

export const metadata = { title: "Audit event · Super Admin" };

export default async function AuditDetailPage({
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
