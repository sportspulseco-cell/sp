import { Trophy } from "lucide-react";
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
import { CreateLeagueButton } from "@/components/leagues/create-league-button";

export const metadata = { title: "Leagues — SportsPulse" };

export default async function LeaguesPage({
  searchParams
}: {
  searchParams?: Promise<{ seasonId?: string }>;
}) {
  const sp = await searchParams;
  const [leaguesPage, seasonsPage] = await Promise.all([
    leagueMgmt
      .listLeagues({ seasonId: sp?.seasonId })
      .catch(() => ({ items: [] })),
    leagueMgmt.listSeasons().catch(() => ({ items: [] }))
  ]);
  const seasonMap = new Map(
    seasonsPage.items.map((s) => [s.id, s.name])
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leagues"
        description={
          sp?.seasonId
            ? `Filtered by season ${seasonMap.get(sp.seasonId) ?? sp.seasonId.slice(0, 8)}`
            : "Competitive containers under a season."
        }
        action={<CreateLeagueButton seasons={seasonsPage.items} />}
      />

      {leaguesPage.items.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No leagues yet"
          description="Create a league under any season."
          action={<CreateLeagueButton seasons={seasonsPage.items} />}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Season</TH>
              <TH>Sport</TH>
              <TH>Format</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {leaguesPage.items.map((l) => (
              <TR key={l.id}>
                <TD className="font-medium">
                  <Link
                    href={`/divisions?leagueId=${l.id}`}
                    className="hover:underline"
                  >
                    {l.name}
                  </Link>
                </TD>
                <TD className="text-muted-foreground">
                  {seasonMap.get(l.seasonId) ?? l.seasonId.slice(0, 8)}
                </TD>
                <TD className="text-muted-foreground">{l.sportCode}</TD>
                <TD className="text-muted-foreground">{l.format}</TD>
                <TD>
                  <Badge tone={statusTone(l.status)}>
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
