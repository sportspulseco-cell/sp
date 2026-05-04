import { CalendarRange } from "lucide-react";
import { gameOps, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";

export const metadata = { title: "Games — League Admin" };

export default async function GamesPage() {
  const [page, teamsPage] = await Promise.all([
    gameOps
      .listGames({ limit: 100 })
      .catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt
      .listTeams({})
      .catch(() => ({ items: [], nextCursor: null }))
  ]);
  const teamMap = new Map(
    teamsPage.items.map((t) => [t.id, t.shortName ?? t.name])
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="OPERATIONS"
        title="Games"
        description="Fixtures across your leagues. League_admin can read; future: schedule + finalize."
      />
      {page.items.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No games"
          description="No games visible to your account."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Matchup</TH>
              <TH className="text-right">Score</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {page.items.map((g) => {
              const home = teamMap.get(g.homeTeamId) ?? g.homeTeamId.slice(0, 6);
              const away = teamMap.get(g.awayTeamId) ?? g.awayTeamId.slice(0, 6);
              const showScore =
                g.status === "in_play" ||
                g.status === "completed" ||
                g.status === "forfeited";
              return (
                <TR key={g.id}>
                  <TD className="font-mono text-[11px] tabular-nums text-fg-muted">
                    {new Date(g.scheduledStartTsUtc).toLocaleDateString(
                      undefined,
                      { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
                    )}
                  </TD>
                  <TD className="font-medium text-fg">
                    {away} <span className="text-fg-muted">@</span> {home}
                  </TD>
                  <TD className="text-right font-mono tabular-nums">
                    {showScore ? `${g.awayScore}–${g.homeScore}` : "—"}
                  </TD>
                  <TD>
                    <Badge mono>{g.status}</Badge>
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
