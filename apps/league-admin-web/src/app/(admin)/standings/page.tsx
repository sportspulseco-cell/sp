import { BarChart3 } from "lucide-react";
import { leagueMgmt, stats } from "@/lib/api/server-api";
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

export const metadata = { title: "Standings — League Admin" };

export default async function StandingsPage() {
  const [leaguesPage, teamsPage] = await Promise.all([
    leagueMgmt.listLeagues({}).catch(() => ({ items: [] })),
    leagueMgmt.listTeams({}).catch(() => ({ items: [] }))
  ]);

  const teamMap = new Map(
    teamsPage.items.map((t) => [t.id, t.shortName ?? t.name])
  );

  const leagueStandings = await Promise.all(
    leaguesPage.items.map(async (l) => ({
      league: l,
      rows: await stats.standings(l.id).catch(() => [])
    }))
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="ANALYTICS"
        title="Standings"
        description="Per-league standings, computed from completed games."
      />
      {leagueStandings.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No leagues"
          description="No standings visible."
        />
      ) : (
        leagueStandings.map(({ league, rows }) => (
          <section
            key={league.id}
            className="rounded-xl border border-border bg-surface-1"
          >
            <header className="border-b border-border px-6 py-4">
              <p className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                {league.name}
              </p>
            </header>
            {rows.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-fg-muted">
                No completed games yet.
              </p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH className="w-12 text-center">#</TH>
                    <TH>Team</TH>
                    <TH className="text-center">GP</TH>
                    <TH className="text-center">W</TH>
                    <TH className="text-center">L</TH>
                    <TH className="text-center">GD</TH>
                    <TH className="text-right font-mono">PTS</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((r) => (
                    <TR key={r.id}>
                      <TD className="text-center font-mono text-[12px] text-fg-muted">
                        {r.rank ?? "—"}
                      </TD>
                      <TD className="font-medium text-fg">
                        {teamMap.get(r.teamId) ?? r.teamId.slice(0, 8)}
                      </TD>
                      <TD className="text-center font-mono tabular-nums text-fg-muted">
                        {r.gp}
                      </TD>
                      <TD className="text-center font-mono tabular-nums text-fg">
                        {r.w}
                      </TD>
                      <TD className="text-center font-mono tabular-nums text-fg-muted">
                        {r.l}
                      </TD>
                      <TD
                        className={
                          "text-center font-mono tabular-nums " +
                          (r.gd > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : r.gd < 0
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-fg-muted")
                        }
                      >
                        {r.gd > 0 ? `+${r.gd}` : r.gd}
                      </TD>
                      <TD className="text-right font-mono text-[15px] font-semibold tabular-nums text-fg">
                        {r.points}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </section>
        ))
      )}
    </div>
  );
}
