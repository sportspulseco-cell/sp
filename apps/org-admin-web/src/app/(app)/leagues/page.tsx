import { Trophy } from "lucide-react";
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
import { iam, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leagues - Org Admin" };

export default async function LeaguesPage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = scope?.orgIds[0];

  const page = orgId
    ? await leagueMgmt.listLeagues({ orgId }).catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Leagues"
        title="Leagues"
        description="Every league owned by your org. Create + dissolve actions live in the super-admin console for now."
      />
      {page.items.length === 0 ? (
        <EmptyState icon={Trophy} title="No leagues yet" description="Ask your platform admin to seed leagues for your org." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Sport</TH>
              <TH>Format</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {page.items.map((l) => (
              <TR key={l.id}>
                <TD className="font-medium text-fg">{l.name}</TD>
                <TD className="font-mono text-[11px] uppercase tracking-wide text-fg-muted">{l.sportCode}</TD>
                <TD className="text-fg-muted">{l.format ?? "-"}</TD>
                <TD>
                  <Badge mono tone={(l.status as string) === "active" ? "success" : "neutral"}>
                    {l.status.replace(/_/g, " ")}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
