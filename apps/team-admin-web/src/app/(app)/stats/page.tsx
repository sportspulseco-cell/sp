import { fetchAll } from "@sportspulse/api-client";
import { ChartBar } from "lucide-react";
import {
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import type { Standing, StatLine } from "@sportspulse/api-client";
import { captain, iam, leagueMgmt, stats } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { SeasonLeadersBlock } from "@sportspulse/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stats - Team Admin" };

interface PlayerTotals {
  personId: string;
  name: string;
  games: number;
  goals: number;
  assists: number;
  points: number;
  pim: number;
}

function n(line: StatLine, key: string): number {
  const v = line.core?.[key];
  return typeof v === "number" ? v : 0;
}

/**
 * Captain stats (SCH-24). The league and division come from the team's
 * current season entry (the same rule the roster uses), not from an
 * arbitrary season of the org. Standings and player lines are written by
 * Finalize on the server; this page only reads them.
 */
export default async function TeamAdminStatsPage() {
  const scope = await iam.meScope().catch(() => null);
  const teamId = scope?.teamIds[0] ?? null;

  if (!teamId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Stats" title="Stats" />
        <EmptyState icon={ChartBar} title="No team in scope" description="You need a captain or coach role on a team to see its stats." />
      </div>
    );
  }

  const rosterView = await captain.roster.list(teamId).catch(() => null);
  const season = rosterView?.season ?? null;
  const division = rosterView?.division ?? null;
  const teamName = rosterView?.team.name ?? "Your team";

  if (!season) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Stats" title="Stats" />
        <EmptyState
          icon={ChartBar}
          title="No season yet"
          description={`${teamName} is not entered in a season, so there are no standings to show.`}
        />
      </div>
    );
  }

  const [seasonRow, linesPage] = await Promise.all([
    leagueMgmt.getSeason(season.id).catch(() => null),
    fetchAll((cursor) => stats.listLines({ teamId, seasonId: season.id, limit: 100, cursor })).catch(
      () => ({ items: [] as StatLine[], nextCursor: null })
    )
  ]);
  const leagueId = seasonRow?.leagueId ?? null;
  // Division leaders of the team's season (FR-3.5.3), finalized games only.
  const leaders = division
    ? await stats.seasonLeaders(season.id, { divisionId: division.id }).catch(() => null)
    : null;
  const myDivisionLeaders = leaders?.divisions[0] ?? null;
  const leagueStandings: Standing[] = leagueId
    ? await stats.standings(leagueId).catch(() => [] as Standing[])
    : [];

  // Rows of the team's division. Games entered without a division are
  // ranked in a league-level table; show that only when the division has
  // none and the team appears there.
  let standings = division ? leagueStandings.filter((s) => s.divisionId === division.id) : [];
  let standingsLabel = division ? division.name : "League";
  if (standings.length === 0) {
    const leagueLevel = leagueStandings.filter((s) => s.divisionId === null);
    if (leagueLevel.some((s) => s.teamId === teamId)) {
      standings = leagueLevel;
      standingsLabel = "League games without a division";
    }
  }
  standings = standings.slice().sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  const totals = new Map<string, PlayerTotals>();
  for (const l of linesPage.items as StatLine[]) {
    const t = totals.get(l.personId) ?? {
      personId: l.personId,
      name: l.personName ?? "Unnamed player",
      games: 0,
      goals: 0,
      assists: 0,
      points: 0,
      pim: 0
    };
    t.games += l.gpIncrement ?? 1;
    t.goals += n(l, "goals");
    t.assists += n(l, "assists");
    t.points += n(l, "points");
    t.pim += n(l, "pim");
    totals.set(l.personId, t);
  }
  const players = [...totals.values()].sort(
    (a, b) => b.points - a.points || b.goals - a.goals || a.name.localeCompare(b.name)
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Stats"
        title="Stats"
        description={`${teamName} · ${season.name}`}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-fg">Standings · {standingsLabel}</h2>
        {standings.length === 0 ? (
          <EmptyState
            icon={ChartBar}
            title="No standings yet"
            description="Standings appear after the first finalized game in your division."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Team</TH>
                <TH className="text-right">GP</TH>
                <TH className="text-right">W</TH>
                <TH className="text-right">L</TH>
                <TH className="text-right">T</TH>
                <TH className="text-right">OTL</TH>
                <TH className="text-right">GF</TH>
                <TH className="text-right">GA</TH>
                <TH className="text-right">PTS</TH>
              </TR>
            </THead>
            <TBody>
              {standings.map((s) => {
                const mine = s.teamId === teamId;
                return (
                  <TR key={s.id} className={mine ? "bg-[var(--tint-blue-bg)]" : undefined}>
                    <TD className="font-mono tabular-nums text-fg-muted">{s.rank ?? "-"}</TD>
                    <TD className={mine ? "font-semibold text-[var(--tint-blue-fg)]" : "text-fg"}>
                      {s.teamName ?? "Unnamed team"}
                    </TD>
                    <TD className="text-right font-mono tabular-nums">{s.gp}</TD>
                    <TD className="text-right font-mono tabular-nums">{s.w}</TD>
                    <TD className="text-right font-mono tabular-nums">{s.l}</TD>
                    <TD className="text-right font-mono tabular-nums">{s.t}</TD>
                    <TD className="text-right font-mono tabular-nums">{s.otl}</TD>
                    <TD className="text-right font-mono tabular-nums">{s.gf}</TD>
                    <TD className="text-right font-mono tabular-nums">{s.ga}</TD>
                    <TD className="text-right font-mono tabular-nums font-semibold">{s.points}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </section>

      {myDivisionLeaders ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-fg">Leaders · {myDivisionLeaders.divisionName}</h2>
          <SeasonLeadersBlock data={myDivisionLeaders} highlightTeamId={teamId} showStandings={false} />
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-fg">Player stats · {season.name}</h2>
        {players.length === 0 ? (
          <EmptyState
            icon={ChartBar}
            title="No player stats yet"
            description="Goals, assists and penalty minutes appear here once a game with your players on the scoresheet is finalized."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Player</TH>
                <TH className="text-right" title="Finalized games where the player is on the scoresheet">Games</TH>
                <TH className="text-right">G</TH>
                <TH className="text-right">A</TH>
                <TH className="text-right">PTS</TH>
                <TH className="text-right">PIM</TH>
              </TR>
            </THead>
            <TBody>
              {players.map((p) => (
                <TR key={p.personId}>
                  <TD className="text-fg">{p.name}</TD>
                  <TD className="text-right font-mono tabular-nums">{p.games}</TD>
                  <TD className="text-right font-mono tabular-nums">{p.goals}</TD>
                  <TD className="text-right font-mono tabular-nums">{p.assists}</TD>
                  <TD className="text-right font-mono tabular-nums font-semibold">{p.points}</TD>
                  <TD className="text-right font-mono tabular-nums">{p.pim}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
