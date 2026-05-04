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

export const metadata = { title: "Divisions — SportsPulse" };

export default async function DivisionsPage({
  searchParams
}: {
  searchParams?: Promise<{ leagueId?: string }>;
}) {
  const sp = await searchParams;
  const [divs, leagues] = await Promise.all([
    leagueMgmt
      .listDivisions({ leagueId: sp?.leagueId })
      .catch(() => ({ items: [] })),
    leagueMgmt.listLeagues().catch(() => ({ items: [] }))
  ]);
  const leagueMap = new Map(leagues.items.map((l) => [l.id, l.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Divisions"
        description={
          sp?.leagueId
            ? `Filtered by league ${leagueMap.get(sp.leagueId) ?? sp.leagueId.slice(0, 8)}`
            : "Age + tier + gender groupings within a league."
        }
        action={<CreateDivisionButton leagues={leagues.items} />}
      />

      {divs.items.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No divisions yet"
          description="Divisions group teams by age, tier, and gender."
          action={<CreateDivisionButton leagues={leagues.items} />}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>League</TH>
              <TH>Tier</TH>
              <TH>Gender</TH>
              <TH>Max teams</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {divs.items.map((d) => (
              <TR key={d.id}>
                <TD className="font-medium">{d.name}</TD>
                <TD className="text-muted-foreground">
                  {leagueMap.get(d.leagueId) ?? d.leagueId.slice(0, 8)}
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
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
