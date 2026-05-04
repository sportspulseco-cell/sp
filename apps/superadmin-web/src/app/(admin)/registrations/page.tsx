import { ClipboardList } from "lucide-react";
import { iam, registration } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, statusTone } from "@/components/ui/badge";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { ReviewActions } from "@/components/registrations/review-actions";

export const metadata = { title: "Registrations — SportsPulse" };

export default async function RegistrationsPage() {
  const [regs, persons] = await Promise.all([
    registration.listRegistrations().catch(() => ({ items: [] })),
    iam.listPersons({ limit: 100 }).catch(() => ({ items: [] }))
  ]);
  const personMap = new Map(
    persons.items.map((p) => [
      p.id,
      p.preferredName ?? `${p.legalFirstName} ${p.legalLastName}`
    ])
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Registrations"
        description="Player + team registrations across all orgs."
      />

      {regs.items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No registrations yet"
          description="Registrations come in via the public site / mobile app and land here for review."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Subject</TH>
              <TH>Status</TH>
              <TH>Submitted</TH>
              <TH>Decision</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {regs.items.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium">
                  {personMap.get(r.subjectPersonId) ?? r.subjectPersonId.slice(0, 8)}
                </TD>
                <TD>
                  <Badge tone={statusTone(r.status)}>
                    {r.status.replace(/_/g, " ")}
                  </Badge>
                </TD>
                <TD className="text-muted-foreground">
                  {r.submittedAt
                    ? new Date(r.submittedAt).toLocaleString()
                    : "—"}
                </TD>
                <TD className="text-muted-foreground">
                  {r.decisionReason ?? "—"}
                </TD>
                <TD>
                  <ReviewActions id={r.id} status={r.status} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
