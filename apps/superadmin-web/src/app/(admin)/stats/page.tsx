import { BarChart3, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { leagueMgmt, stats } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { Eyebrow } from "@/components/ui/eyebrow";
import { EmptyState } from "@/components/ui/empty-state";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { RecomputeStandingsButton } from "@/components/stats/recompute-standings-button";
import { BuildLeaderboardForm } from "@/components/stats/build-leaderboard-form";

export const metadata = { title: "Stats — SportsPulse" };

type Tab = "lines" | "standings" | "leaderboards";

const TABS: Array<{ key: Tab; label: string; mono: string }> = [
  { key: "lines", label: "Player lines", mono: "LINES" },
  { key: "standings", label: "Standings", mono: "STANDINGS" },
  { key: "leaderboards", label: "Leaderboards", mono: "LEADERBOARDS" }
];

export default async function StatsPage({
  searchParams
}: {
  searchParams?: Promise<{
    tab?: Tab;
    leagueId?: string;
    divisionId?: string;
  }>;
}) {
  const sp = await searchParams;
  const tab: Tab = sp?.tab ?? "lines";
  const leagueId = sp?.leagueId;
  const divisionId = sp?.divisionId;

  const [leaguesPage, teamsPage, divisionsPage] = await Promise.all([
    leagueMgmt.listLeagues().catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt.listTeams({}).catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt
      // Post-flip: divisions live under seasons. Stats page used to
      // filter by league; for now show all divisions and the in-page
      // filters narrow further. League-scoped views land in the
      // dedicated league detail page.
      .listDivisions({})
      .catch(() => ({ items: [], nextCursor: null }))
  ]);

  const teamMap = new Map(
    teamsPage.items.map((t) => [t.id, t.shortName ?? t.name])
  );
  const leagueMap = new Map(leaguesPage.items.map((l) => [l.id, l.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="analytics"
        title="Stats"
        description="Player lines, league standings, and leaderboards — projected from append-only event logs."
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.key;
          const href = leagueId
            ? `/stats?tab=${t.key}&leagueId=${leagueId}${divisionId ? `&divisionId=${divisionId}` : ""}`
            : `/stats?tab=${t.key}`;
          return (
            <Link
              key={t.key}
              href={href}
              className={
                active
                  ? "relative border-b-2 border-fg px-3 pb-2.5 text-sm font-medium text-fg"
                  : "border-b-2 border-transparent px-3 pb-2.5 text-sm font-medium text-fg-muted hover:text-fg"
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* League filter */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
          League
        </span>
        <Link
          href={`/stats?tab=${tab}`}
          className={
            !leagueId
              ? "rounded-full bg-fg px-3 py-1 text-[12px] font-medium text-bg"
              : "rounded-full border border-border bg-surface-1 px-3 py-1 text-[12px] font-medium text-fg-muted hover:border-border-strong hover:text-fg"
          }
        >
          All
        </Link>
        {leaguesPage.items.map((l) => (
          <Link
            key={l.id}
            href={`/stats?tab=${tab}&leagueId=${l.id}`}
            className={
              leagueId === l.id
                ? "rounded-full bg-fg px-3 py-1 text-[12px] font-medium text-bg"
                : "rounded-full border border-border bg-surface-1 px-3 py-1 text-[12px] font-medium text-fg-muted hover:border-border-strong hover:text-fg"
            }
          >
            {l.name}
          </Link>
        ))}
      </div>

      {tab === "lines" ? (
        <LinesTab leagueId={leagueId} teamMap={teamMap} />
      ) : null}
      {tab === "standings" ? (
        <StandingsTab
          leagueId={leagueId}
          divisionId={divisionId}
          teamMap={teamMap}
          leagueMap={leagueMap}
          divisions={divisionsPage.items}
        />
      ) : null}
      {tab === "leaderboards" ? (
        <LeaderboardsTab
          leagues={leaguesPage.items}
          divisions={divisionsPage.items}
          teamMap={teamMap}
        />
      ) : null}
    </div>
  );
}

// ---------- Lines tab ----------
async function LinesTab({
  leagueId,
  teamMap
}: {
  leagueId?: string;
  teamMap: Map<string, string>;
}) {
  const linesPage = await stats
    .listLines({ leagueId, limit: 100 })
    .catch(() => ({ items: [], nextCursor: null }));

  if (linesPage.items.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No stat lines yet"
        description="Project stats from a completed game to see per-player rows here."
      />
    );
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Player</TH>
          <TH>Team</TH>
          <TH>Sport</TH>
          <TH className="text-center">GP</TH>
          <TH className="text-right">Core stats</TH>
        </TR>
      </THead>
      <TBody>
        {linesPage.items.map((l) => (
          <TR key={l.id}>
            <TD className="font-mono text-[12px] text-fg">
              {l.personId.slice(0, 8)}
            </TD>
            <TD className="text-fg-muted">
              {teamMap.get(l.teamId) ?? l.teamId.slice(0, 8)}
            </TD>
            <TD className="text-fg-muted">{l.sportCode}</TD>
            <TD className="text-center font-mono tabular-nums text-fg">
              {l.gpIncrement}
            </TD>
            <TD className="text-right">
              <CoreSummary core={l.core} />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

// ---------- Standings tab ----------
async function StandingsTab({
  leagueId,
  divisionId,
  teamMap,
  leagueMap,
  divisions
}: {
  leagueId?: string;
  divisionId?: string;
  teamMap: Map<string, string>;
  leagueMap: Map<string, string>;
  divisions: Array<{ id: string; name: string; seasonId: string }>;
}) {
  if (!leagueId) {
    return (
      <EmptyState
        icon={Trophy}
        title="Pick a league"
        description="Standings are computed per-league. Select a league above to view rankings."
      />
    );
  }
  const rows = await stats.standings(leagueId, divisionId).catch(() => []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Eyebrow>{leagueMap.get(leagueId) ?? "League"}</Eyebrow>
          <p className="mt-1 text-[13px] text-fg-muted">
            Sorted by points, then goal differential, then goals for.
          </p>
        </div>
        <RecomputeStandingsButton leagueId={leagueId} />
      </div>

      {divisions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/stats?tab=standings&leagueId=${leagueId}`}
            className={
              !divisionId
                ? "rounded-md bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-fg"
                : "rounded-md px-2.5 py-1 text-[12px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg"
            }
          >
            All divisions
          </Link>
          {divisions.map((d) => (
            <Link
              key={d.id}
              href={`/stats?tab=standings&leagueId=${leagueId}&divisionId=${d.id}`}
              className={
                divisionId === d.id
                  ? "rounded-md bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-fg"
                  : "rounded-md px-2.5 py-1 text-[12px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg"
              }
            >
              {d.name}
            </Link>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No standings"
          description="Run 'Recompute' once games have finished to populate the table."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH className="w-12 text-center">#</TH>
              <TH>Team</TH>
              <TH className="text-center">GP</TH>
              <TH className="text-center">W</TH>
              <TH className="text-center">L</TH>
              <TH className="text-center">T</TH>
              <TH className="text-center">OTL</TH>
              <TH className="text-center">GF</TH>
              <TH className="text-center">GA</TH>
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
                <TD className="text-center font-mono tabular-nums text-fg-muted">
                  {r.t}
                </TD>
                <TD className="text-center font-mono tabular-nums text-fg-muted">
                  {r.otl}
                </TD>
                <TD className="text-center font-mono tabular-nums text-fg-muted">
                  {r.gf}
                </TD>
                <TD className="text-center font-mono tabular-nums text-fg-muted">
                  {r.ga}
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
    </div>
  );
}

// ---------- Leaderboards tab ----------
function LeaderboardsTab({
  leagues,
  divisions,
  teamMap
}: {
  leagues: Array<{ id: string; name: string; sportCode: string }>;
  divisions: Array<{ id: string; name: string; seasonId: string }>;
  teamMap: Map<string, string>;
}) {
  if (leagues.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No leagues"
        description="Create a league before building a leaderboard."
      />
    );
  }
  return (
    <BuildLeaderboardForm
      leagues={leagues}
      divisions={divisions}
      teamMap={Array.from(teamMap.entries())}
    />
  );
}

function CoreSummary({ core }: { core: Record<string, number> }) {
  const entries = Object.entries(core).filter(([, v]) => Number(v) > 0);
  if (entries.length === 0)
    return <span className="text-fg-muted">—</span>;
  return (
    <span className="inline-flex flex-wrap justify-end gap-1.5 font-mono text-[11px] text-fg">
      {entries.map(([k, v]) => (
        <span
          key={k}
          className="rounded border border-border bg-surface-2 px-1.5 py-px"
        >
          <span className="text-fg-muted">{k}</span>{" "}
          <span className="text-fg">{v}</span>
        </span>
      ))}
    </span>
  );
}
