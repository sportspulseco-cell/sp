import { Trophy } from "lucide-react";
import { leagueMgmt } from "@/lib/api/server-api";
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

export const metadata = { title: "My leagues — League Admin" };

export default async function MyLeaguesPage() {
  const page = await leagueMgmt
    .listLeagues({})
    .catch(() => ({ items: [], nextCursor: null }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="LEAGUE"
        title="My leagues"
        description="Leagues your role grants access to. The API filters this list — you'll only see leagues that match an active role assignment (or all, if super_admin)."
      />
      {page.items.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No leagues"
          description="No active league_admin assignments. Ask a super_admin to grant you a league_admin role."
        />
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
                <TD className="text-fg-muted">{l.sportCode}</TD>
                <TD className="text-fg-muted">{l.format}</TD>
                <TD>
                  <Badge tone={statusTone(l.status)} mono>
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
