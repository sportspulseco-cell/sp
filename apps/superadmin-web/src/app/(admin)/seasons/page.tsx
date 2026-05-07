import { CalendarRange } from "lucide-react";
import Link from "next/link";
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
import { CreateSeasonButton } from "@/components/seasons/create-season-button";
import { AssignAdminCell } from "@/components/roles/assign-admin-cell";

export const metadata = { title: "Seasons — SportsPulse" };

/**
 * Post-flip hierarchy: seasons live under a league. Filter by ?leagueId=
 * to scope the list to a single league.
 */
export default async function SeasonsPage({
  searchParams
}: {
  searchParams?: Promise<{ leagueId?: string }>;
}) {
  const sp = await searchParams;
  const [seasonsPage, leaguesPage] = await Promise.all([
    leagueMgmt.listSeasons({ leagueId: sp?.leagueId }).catch(() => ({ items: [] })),
    leagueMgmt.listLeagues().catch(() => ({ items: [] }))
  ]);
  const leagueMap = new Map(leaguesPage.items.map((l) => [l.id, l.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Seasons"
        description={
          sp?.leagueId
            ? `Filtered by league ${leagueMap.get(sp.leagueId) ?? sp.leagueId.slice(0, 8)}`
            : "Time-bounded instances of a league. Each holds divisions + registrations."
        }
        action={<CreateSeasonButton leagues={leaguesPage.items} />}
      />

      {seasonsPage.items.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No seasons yet"
          description="Create a season under any league. Leagues come first now (post hierarchy flip)."
          action={<CreateSeasonButton leagues={leaguesPage.items} />}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>League</TH>
              <TH>Sport</TH>
              <TH>Window</TH>
              <TH>Timezone</TH>
              <TH>Status</TH>
              <TH>Admins</TH>
            </TR>
          </THead>
          <TBody>
            {seasonsPage.items.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">
                  <Link
                    href={`/divisions?seasonId=${s.id}`}
                    className="hover:underline"
                  >
                    {s.name}
                  </Link>
                </TD>
                <TD className="text-muted-foreground">
                  {leagueMap.get(s.leagueId) ?? s.leagueId.slice(0, 8)}
                </TD>
                <TD className="text-muted-foreground">{s.sportCode}</TD>
                <TD className="text-muted-foreground">
                  {s.startDate} → {s.endDate}
                </TD>
                <TD className="text-muted-foreground">{s.timezone}</TD>
                <TD>
                  <Badge tone={statusTone(s.status)}>
                    {s.status.replace(/_/g, " ")}
                  </Badge>
                </TD>
                <TD>
                  <AssignAdminCell
                    scopeType="season"
                    scopeId={s.id}
                    resourceLabel={s.name}
                    allowedRoleCodes={["season_admin", "registrar"]}
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
