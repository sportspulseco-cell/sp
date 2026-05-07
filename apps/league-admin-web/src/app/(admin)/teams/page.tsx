import { Network } from "lucide-react";
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
import { PromoteCaptainButton } from "@/components/teams/promote-captain-button";

export const metadata = { title: "Teams — League Admin" };

export default async function TeamsPage() {
  const page = await leagueMgmt
    .listTeams({})
    .catch(() => ({ items: [], nextCursor: null }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="LEAGUE"
        title="Teams"
        description="Teams across your leagues. Promote any rostered player to captain — they keep their player role and gain captain powers (roster, invites, team profile, free agents)."
      />
      {page.items.length === 0 ? (
        <EmptyState icon={Network} title="No teams" description="No teams visible." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Short</TH>
              <TH>Sport</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {page.items.map((t) => (
              <TR key={t.id}>
                <TD className="font-medium text-fg">{t.name}</TD>
                <TD className="font-mono text-[11px] text-fg-muted">
                  {t.shortName ?? "—"}
                </TD>
                <TD className="text-fg-muted">{t.sportCode}</TD>
                <TD>
                  <Badge tone={statusTone(t.status)} mono>
                    {t.status}
                  </Badge>
                </TD>
                <TD className="text-right">
                  <PromoteCaptainButton teamId={t.id} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
