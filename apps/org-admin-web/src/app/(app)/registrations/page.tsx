import { ScrollText } from "lucide-react";
import {
  Badge,
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import { iam, registration } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registrations - Org Admin" };

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

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
        description="Every registration submitted across your org's seasons. Approve / reject from the super-admin review queue."
      />
      {page.items.length === 0 ? (
        <EmptyState icon={ScrollText} title="No registrations yet" description="Submissions land here as soon as the public funnel takes them." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Reference</TH>
              <TH>Subject</TH>
              <TH>Status</TH>
              <TH>Submitted</TH>
            </TR>
          </THead>
          <TBody>
            {page.items.map((r) => {
              const status = r.status as string;
              const tone: "success" | "warning" | "danger" | "info" | "neutral" =
                status === "approved" ? "success"
                : status === "rejected" || status === "withdrawn" || status === "cancelled" ? "danger"
                : status.startsWith("pending") || status === "submitted" ? "warning"
                : "info";
              return (
                <TR key={r.id}>
                  <TD className="font-mono text-[11px] text-fg-muted">{r.id.slice(0, 8)}</TD>
                  <TD className="font-mono text-[11px] text-fg-muted">{r.subjectPersonId.slice(0, 8)}</TD>
                  <TD><Badge mono tone={tone}>{status.replace(/_/g, " ")}</Badge></TD>
                  <TD className="text-[12px] text-fg-muted">{r.submittedAt ? fmt(r.submittedAt) : "draft"}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
