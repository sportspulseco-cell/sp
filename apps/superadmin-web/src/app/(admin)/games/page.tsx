import { CalendarRange, CircleDot, Flag, Clock } from "lucide-react";
import Link from "next/link";
import { gameOps, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { EmptyState } from "@/components/ui/empty-state";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { GameStatusBadge } from "@/components/games/game-status-badge";
import { CreateGameButton } from "@/components/games/create-game-button";
import type { GameStatus } from "@/lib/api/types";

export const metadata = { title: "Games — SportsPulse" };

const STATUS_FILTERS: Array<{ key: GameStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "scheduled", label: "Scheduled" },
  { key: "in_play", label: "Live" },
  { key: "completed", label: "Final" },
  { key: "postponed", label: "Postponed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "forfeited", label: "Forfeit" }
];

function formatKickoff(iso: string, tz: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });
  return { date, time, tz };
}

export default async function GamesPage({
  searchParams
}: {
  searchParams?: Promise<{ leagueId?: string; status?: GameStatus }>;
}) {
  const sp = await searchParams;
  const status = sp?.status;
  const leagueId = sp?.leagueId;

  const [gamesPage, leaguesPage, teamsPage] = await Promise.all([
    gameOps
      .listGames({ leagueId, status, limit: 100 })
      .catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt.listLeagues().catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt.listTeams({}).catch(() => ({ items: [], nextCursor: null }))
  ]);

  const leagueMap = new Map(leaguesPage.items.map((l) => [l.id, l.name]));
  const teamMap = new Map(
    teamsPage.items.map((t) => [t.id, t.shortName ?? t.name])
  );

  const live = gamesPage.items.filter((g) => g.status === "in_play").length;
  const scheduled = gamesPage.items.filter(
    (g) => g.status === "scheduled"
  ).length;
  const completed = gamesPage.items.filter(
    (g) => g.status === "completed"
  ).length;
  const total = gamesPage.items.length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="operations"
        title="Games"
        description="Live and scheduled fixtures across every league. Append events, apply scores, finalize."
        action={
          <CreateGameButton
            leagues={leaguesPage.items}
            teams={teamsPage.items}
          />
        }
      />
      <KineticStrip
        cards={[
          {
            label: "Live now",
            value: live,
            icon: CircleDot,
            tone: live > 0 ? "live" : "idle"
          },
          {
            label: "Scheduled",
            value: scheduled,
            icon: Clock,
            tone: scheduled > 0 ? "info" : "idle"
          },
          {
            label: "Final",
            value: completed,
            icon: Flag,
            tone: "ok"
          },
          {
            label: "Total tracked",
            value: total,
            icon: CalendarRange,
            tone: "idle"
          }
        ]}
      />

      {/* Status filter strip */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => {
          const active = (status ?? "all") === f.key;
          const href =
            f.key === "all"
              ? leagueId
                ? `/games?leagueId=${leagueId}`
                : "/games"
              : leagueId
                ? `/games?leagueId=${leagueId}&status=${f.key}`
                : `/games?status=${f.key}`;
          return (
            <Link
              key={f.key}
              href={href}
              className={
                active
                  ? "rounded-full bg-fg px-3 py-1 text-[12px] font-medium text-bg"
                  : "rounded-full border border-border bg-surface-1 px-3 py-1 text-[12px] font-medium text-fg-muted hover:border-border-strong hover:text-fg"
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {gamesPage.items.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No games yet"
          description={
            status
              ? `No ${status.replace(/_/g, " ")} games match the current filter.`
              : "Schedule a game between any two teams in a league."
          }
          action={
            <CreateGameButton
              leagues={leaguesPage.items}
              teams={teamsPage.items}
            />
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Kickoff</TH>
              <TH>Matchup</TH>
              <TH>League</TH>
              <TH>Sport</TH>
              <TH className="text-right">Score</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {gamesPage.items.map((g) => {
              const kt = formatKickoff(g.scheduledStartTsUtc, g.tz);
              const home = teamMap.get(g.homeTeamId) ?? g.homeTeamId.slice(0, 8);
              const away = teamMap.get(g.awayTeamId) ?? g.awayTeamId.slice(0, 8);
              const showScore =
                g.status === "in_play" ||
                g.status === "completed" ||
                g.status === "forfeited";
              return (
                <TR key={g.id}>
                  <TD>
                    <Link
                      href={`/games/${g.id}`}
                      className="block hover:underline"
                    >
                      <span className="font-medium text-fg">{kt.date}</span>
                      <span className="ml-2 font-mono text-[11px] text-fg-muted">
                        {kt.time}
                      </span>
                    </Link>
                  </TD>
                  <TD className="font-medium text-fg">
                    <Link href={`/games/${g.id}`} className="hover:underline">
                      {away} <span className="text-fg-muted">@</span> {home}
                    </Link>
                  </TD>
                  <TD className="text-fg-muted">
                    {leagueMap.get(g.leagueId) ?? g.leagueId.slice(0, 8)}
                  </TD>
                  <TD className="text-fg-muted">{g.sportCode}</TD>
                  <TD className="text-right font-mono tabular-nums">
                    {showScore ? (
                      <span className="text-fg">
                        {g.awayScore}–{g.homeScore}
                      </span>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </TD>
                  <TD>
                    <GameStatusBadge status={g.status} />
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
