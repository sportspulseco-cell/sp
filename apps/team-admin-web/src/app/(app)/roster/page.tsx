import { Users } from "lucide-react";
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
import type { TeamMembership } from "@sportspulse/api-client";
import { iam, leagueMgmt, roster } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Roster - Team Admin" };

export default async function TeamAdminRosterPage() {
  const scope = await iam.meScope().catch(() => null);
  const teamId = scope?.teamIds[0] ?? null;

  if (!teamId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Roster" title="Roster" />
        <EmptyState icon={Users} title="No team in scope" description="You need a team_admin or coach role on a team to see its roster." />
      </div>
    );
  }

  const [team, page] = await Promise.all([
    leagueMgmt.getTeam(teamId).catch(() => null),
    roster.listMemberships({ teamId, activeOnly: true }).catch(() => ({ items: [], nextCursor: null }))
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Roster"
        title={team ? `${team.name} - Roster` : "Roster"}
        description={`${page.items.length} active membership${page.items.length === 1 ? "" : "s"}.`}
      />
      {page.items.length === 0 ? (
        <EmptyState icon={Users} title="Empty roster" description="Add players from the captain console or super-admin." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Person</TH>
              <TH className="text-right">#</TH>
              <TH>Position</TH>
              <TH>Type</TH>
              <TH>Effective from</TH>
            </TR>
          </THead>
          <TBody>
            {page.items.map((m: TeamMembership) => (
              <TR key={m.id}>
                <TD className="font-mono text-[11px] uppercase">{m.personId.slice(0, 8)}</TD>
                <TD className="text-right font-mono tabular-nums">{m.jerseyNumber ?? "-"}</TD>
                <TD className="text-fg-muted">{m.positionCode ?? "-"}</TD>
                <TD><Badge mono tone="neutral">{m.membershipType}</Badge></TD>
                <TD className="text-[12px] text-fg-muted">{new Date(m.effectiveFrom).toLocaleDateString("en-CA")}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
