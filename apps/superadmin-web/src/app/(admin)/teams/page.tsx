import { Network, Building2, Layers, Trophy, Plus } from "lucide-react";
import Link from "next/link";
import { leagueMgmt, orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { KineticStrip } from "@/components/layout/kinetic-strip";
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
import { AssignAdminCell } from "@/components/roles/assign-admin-cell";

export const metadata = { title: "Teams — SportsPulse" };

export default async function TeamsPage() {
  const [teams, orgList] = await Promise.all([
    leagueMgmt.listTeams().catch(() => ({ items: [] })),
    orgs.list({ limit: 100 }).catch(() => ({ items: [] }))
  ]);
  const orgMap = new Map(orgList.items.map((o) => [o.id, o.displayName]));

  const total = teams.items.length;
  const active = teams.items.filter((t) => t.status === "active").length;
  const orgsCovered = new Set(teams.items.map((t) => t.orgId)).size;
  const sports = new Set(teams.items.map((t) => t.sportCode)).size;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="rosters"
        title="Teams"
        description="Owned by clubs/orgs. Enter divisions via DivisionTeamEntry."
        action={
          <Link
            href="/teams/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-4 font-mono text-[11px] uppercase tracking-[0.18em] text-bg transition-transform hover:scale-[1.02]"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            New team
          </Link>
        }
      />
      <KineticStrip
        cards={[
          { label: "Total teams", value: total, icon: <Network className="h-3.5 w-3.5" strokeWidth={1.75} />, tone: "idle" },
          {
            label: "Active",
            value: active,
            icon: <Trophy className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: active > 0 ? "ok" : "idle"
          },
          {
            label: "Owner orgs",
            value: orgsCovered,
            icon: <Building2 className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "info"
          },
          { label: "Sports", value: sports, icon: <Layers className="h-3.5 w-3.5" strokeWidth={1.75} />, tone: "idle" }
        ]}
      />

      {teams.items.length === 0 ? (
        <EmptyState
          icon={Network}
          title="No teams yet"
          description="Teams are owned by an organization and enter divisions for play."
          action={
          <Link
            href="/teams/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-4 font-mono text-[11px] uppercase tracking-[0.18em] text-bg transition-transform hover:scale-[1.02]"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            New team
          </Link>
        }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Short</TH>
              <TH>Sport</TH>
              <TH>Owner org</TH>
              <TH>Status</TH>
              <TH>Captain / admins</TH>
            </TR>
          </THead>
          <TBody>
            {teams.items.map((t) => (
              <TR key={t.id}>
                <TD className="font-medium">{t.name}</TD>
                <TD className="text-muted-foreground">{t.shortName ?? "—"}</TD>
                <TD className="text-muted-foreground">{t.sportCode}</TD>
                <TD className="text-muted-foreground">
                  {orgMap.get(t.orgId) ?? t.orgId.slice(0, 8)}
                </TD>
                <TD>
                  <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                </TD>
                <TD>
                  <AssignAdminCell
                    scopeType="team"
                    scopeId={t.id}
                    resourceLabel={t.name}
                    allowedRoleCodes={["team_admin", "coach"]}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
