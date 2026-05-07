import { Layers } from "lucide-react";
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
import { CreateDivisionButton } from "@/components/divisions/create-division-button";
import { AssignAdminCell } from "@/components/roles/assign-admin-cell";
import type { Division, Season } from "@/lib/api/types";

export const metadata = { title: "Divisions — SportsPulse" };

/**
 * Post-flip hierarchy: Org → League → Season → Division.
 * Page accepts ?seasonId= to filter; legacy ?leagueId= is honoured by
 * looking up the league's seasons and broadening the filter, keeping
 * old links working until the new league/season nav lands.
 */
export default async function DivisionsPage({
  searchParams
}: {
  searchParams?: Promise<{ seasonId?: string; leagueId?: string }>;
}) {
  const sp = await searchParams;

  // Always fetch seasons + leagues for the column lookup labels and
  // the legacy-leagueId resolution.
  const [seasonsPage, leaguesPage] = await Promise.all([
    leagueMgmt.listSeasons().catch(() => ({ items: [] as Season[] })),
    leagueMgmt.listLeagues().catch(() => ({ items: [] }))
  ]);
  const seasonMap = new Map(seasonsPage.items.map((s) => [s.id, s]));
  const leagueMap = new Map(leaguesPage.items.map((l) => [l.id, l.name]));

  // Resolve a primary seasonId for filtering. If only legacy leagueId
  // is supplied, fall back to listing all divisions and filtering in-memory.
  let divs: { items: Division[] } = { items: [] };
  if (sp?.seasonId) {
    divs = (await leagueMgmt
      .listDivisions({ seasonId: sp.seasonId })
      .catch(() => ({ items: [] }))) as { items: Division[] };
  } else {
    const all = (await leagueMgmt
      .listDivisions({})
      .catch(() => ({ items: [] }))) as { items: Division[] };
    if (sp?.leagueId) {
      divs = {
        items: all.items.filter((d) => {
          const s = seasonMap.get(d.seasonId);
          return s?.leagueId === sp.leagueId;
        })
      };
    } else {
      divs = all;
    }
  }

  const filterLabel = sp?.seasonId
    ? `Filtered by season ${seasonMap.get(sp.seasonId)?.name ?? sp.seasonId.slice(0, 8)}`
    : sp?.leagueId
    ? `Filtered by league ${leagueMap.get(sp.leagueId) ?? sp.leagueId.slice(0, 8)}`
    : "Age + tier + gender groupings within a season.";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Divisions"
        description={filterLabel}
        action={<CreateDivisionButton seasons={seasonsPage.items} />}
      />

      {divs.items.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No divisions yet"
          description="Divisions group teams by age, tier, and gender within a season."
          action={<CreateDivisionButton seasons={seasonsPage.items} />}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Season</TH>
              <TH>Tier</TH>
              <TH>Gender</TH>
              <TH>Max teams</TH>
              <TH>Status</TH>
              <TH>Admins</TH>
            </TR>
          </THead>
          <TBody>
            {divs.items.map((d) => {
              const s = seasonMap.get(d.seasonId);
              return (
                <TR key={d.id}>
                  <TD className="font-medium">{d.name}</TD>
                  <TD className="text-muted-foreground">
                    {s?.name ?? d.seasonId.slice(0, 8)}
                  </TD>
                  <TD className="text-muted-foreground">{d.tier ?? "—"}</TD>
                  <TD className="text-muted-foreground capitalize">
                    {d.genderEligibility}
                  </TD>
                  <TD className="text-muted-foreground">
                    {d.maxTeams ?? "—"}
                  </TD>
                  <TD>
                    <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                  </TD>
                  <TD>
                    <AssignAdminCell
                      scopeType="division"
                      scopeId={d.id}
                      resourceLabel={d.name}
                      allowedRoleCodes={["division_admin"]}
                    />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
