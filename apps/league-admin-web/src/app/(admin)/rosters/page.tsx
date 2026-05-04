import { ListChecks } from "lucide-react";
import { leagueMgmt, roster } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";

export const metadata = { title: "Memberships — League Admin" };

export default async function RostersPage() {
  const [page, teamsPage] = await Promise.all([
    roster
      .listMemberships({ activeOnly: true })
      .catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt.listTeams({}).catch(() => ({ items: [] }))
  ]);
  const teamMap = new Map(
    teamsPage.items.map((t) => [t.id, t.shortName ?? t.name])
  );
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="LEAGUE" title="Memberships" />
      {page.items.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No memberships"
          description="None visible."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Person</TH>
              <TH>Team</TH>
              <TH className="text-center">#</TH>
              <TH>Position</TH>
            </TR>
          </THead>
          <TBody>
            {page.items.map((m) => (
              <TR key={m.id}>
                <TD className="font-mono text-[11px] text-fg-muted">
                  {m.personId.slice(0, 8)}
                </TD>
                <TD className="text-fg">
                  {teamMap.get(m.teamId) ?? m.teamId.slice(0, 8)}
                </TD>
                <TD className="text-center font-mono tabular-nums text-fg">
                  {m.jerseyNumber ?? "—"}
                </TD>
                <TD className="font-mono text-[11px] uppercase text-fg-muted">
                  {m.positionCode ?? "—"}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
