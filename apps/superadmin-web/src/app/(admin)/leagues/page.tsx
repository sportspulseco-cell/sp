import { Trophy, Wand2, Network, Archive, Layers } from "lucide-react";
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

export const metadata = { title: "Leagues — SportsPulse" };

/**
 * View-only listing — creation lives exclusively in /org-setup so the
 * 4-phase wizard stays the single source of truth (per repo owner
 * directive). Click a row → /leagues/[id] for full league info.
 */
export default async function LeaguesPage({
  searchParams
}: {
  searchParams?: Promise<{ orgId?: string }>;
}) {
  const sp = await searchParams;
  const [leaguesPage, orgList] = await Promise.all([
    leagueMgmt
      .listLeagues({ orgId: sp?.orgId })
      .catch(() => ({ items: [] })),
    orgs.list({ limit: 100 }).catch(() => ({ items: [] }))
  ]);
  const orgMap = new Map(orgList.items.map((o) => [o.id, o.displayName]));

  const orgSetupCta = (
    <Link
      href="/org-setup"
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
    >
      <Wand2 className="h-3.5 w-3.5" strokeWidth={1.75} />
      New league → Org setup
    </Link>
  );

  const active = leaguesPage.items.filter((l) => l.status === "active").length;
  const draft = leaguesPage.items.filter((l) => l.status === "draft").length;
  const archived = leaguesPage.items.filter(
    (l) => l.status === "archived"
  ).length;
  const sportsCount = new Set(leaguesPage.items.map((l) => l.sportCode)).size;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="competition"
        title="Leagues"
        description={
          sp?.orgId
            ? `Filtered by org ${orgMap.get(sp.orgId) ?? sp.orgId.slice(0, 8)}`
            : "Persistent competition containers. Click a row to inspect; create new leagues via Org setup."
        }
        action={orgSetupCta}
      />
      <KineticStrip
        cards={[
          {
            label: "Active",
            value: active,
            icon: <Trophy className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: active > 0 ? "ok" : "idle"
          },
          {
            label: "Draft",
            value: draft,
            icon: <Network className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: draft > 0 ? "warn" : "idle"
          },
          {
            label: "Archived",
            value: archived,
            icon: <Archive className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "idle"
          },
          {
            label: "Sports",
            value: sportsCount,
            icon: <Layers className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "info"
          }
        ]}
      />

      {leaguesPage.items.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No leagues yet"
          description="New leagues are created via the 4-phase Org setup wizard."
          action={orgSetupCta}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Org</TH>
              <TH>Sport</TH>
              <TH>Format</TH>
              <TH>Status</TH>
              <TH>Admins</TH>
            </TR>
          </THead>
          <TBody>
            {leaguesPage.items.map((l) => (
              <TR key={l.id}>
                <TD className="font-medium">
                  <Link
                    href={`/leagues/${l.id}`}
                    className="hover:underline"
                  >
                    {l.name}
                  </Link>
                </TD>
                <TD className="text-muted-foreground">
                  {orgMap.get(l.orgId) ?? l.orgId.slice(0, 8)}
                </TD>
                <TD className="text-muted-foreground">{l.sportCode}</TD>
                <TD className="text-muted-foreground">{l.format}</TD>
                <TD>
                  <Badge tone={statusTone(l.status)}>
                    {l.status.replace(/_/g, " ")}
                  </Badge>
                </TD>
                <TD>
                  <AssignAdminCell
                    scopeType="league"
                    scopeId={l.id}
                    resourceLabel={l.name}
                    allowedRoleCodes={[
                      "league_admin",
                      "registrar",
                      "referee",
                      "scorekeeper"
                    ]}
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
