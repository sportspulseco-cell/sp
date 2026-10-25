import { fetchAll } from "@sportspulse/api-client";
import { formatInZone } from "@sportspulse/kernel";
import { Alert } from "@sportspulse/ui";
import { CalendarRange, CircleDot, Flag, Clock } from "lucide-react";
import Link from "next/link";
import { gameOps, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { EmptyState } from "@/components/ui/empty-state";
import { UrlFilters } from "@/components/ui/url-filters";
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
import type { Division, Game, GameStatus, Season } from "@/lib/api/types";

export const metadata = { title: "Games — SportsPulse" };

const STATUS_OPTIONS: Array<{ value: GameStatus; label: string }> = [
  { value: "scheduled", label: "Scheduled" },
  { value: "in_play", label: "Live" },
  { value: "completed", label: "Final" },
  { value: "postponed", label: "Postponed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "forfeited", label: "Forfeit" }
];

// In the game's own zone, so the time matches the zone shown beside it.
function formatKickoff(iso: string, tz: string) {
  const date = formatInZone(iso, tz, { month: "short", day: "numeric" });
  const time = formatInZone(iso, tz, { hour: "numeric", minute: "2-digit" });
  return { date, time, tz };
}

/**
 * Filters live in the URL (?q=&leagueId=&seasonId=&divisionId=&status=).
 * League, division and status narrow the API query (they are indexed
 * there); season and the team-name search are applied here, because a
 * game carries its division, not its season.
 */
export default async function GamesPage({
  searchParams
}: {
  searchParams?: Promise<{
    q?: string;
    leagueId?: string;
    seasonId?: string;
    divisionId?: string;
    status?: GameStatus;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const status = sp.status;
  const leagueId = sp.leagueId;
  let loadFailed = false;

  const [gamesPage, leaguesPage, teamsPage, seasonsPage, divisionsPage] = await Promise.all([
    fetchAll((cursor) =>
      gameOps.listGames({ leagueId, divisionId: sp.divisionId, status, limit: 100, cursor })
    ).catch((e) => {
      // Show the failure; an empty list here read as "No games yet".
      console.error("[games] listGames failed", e);
      loadFailed = true;
      return { items: [] as Game[] };
    }),
    fetchAll((cursor) => leagueMgmt.listLeagues({ limit: 100, cursor })).catch(() => ({ items: [] })),
    fetchAll((cursor) => leagueMgmt.listTeams({ limit: 100, cursor })).catch(() => ({ items: [] })),
    fetchAll((cursor) => leagueMgmt.listSeasons({ limit: 100, cursor })).catch(() => ({ items: [] as Season[] })),
    fetchAll((cursor) => leagueMgmt.listDivisions({ limit: 100, cursor })).catch(() => ({ items: [] as Division[] }))
  ]);

  const leagueMap = new Map(leaguesPage.items.map((l) => [l.id, l.name]));
  const teamMap = new Map(
    teamsPage.items.map((t) => [t.id, t.shortName ?? t.name])
  );
  const teamFullName = new Map(teamsPage.items.map((t) => [t.id, t.name]));
  const seasonMap = new Map(seasonsPage.items.map((s) => [s.id, s]));
  const divisionMap = new Map(divisionsPage.items.map((d) => [d.id, d]));

  const q = sp.q?.trim().toLowerCase() ?? "";
  const shown = gamesPage.items.filter((g) => {
    if (sp.seasonId) {
      const d = g.divisionId ? divisionMap.get(g.divisionId) : null;
      if (d?.seasonId !== sp.seasonId) return false;
    }
    if (q) {
      const hay = [
        teamFullName.get(g.homeTeamId),
        teamMap.get(g.homeTeamId),
        teamFullName.get(g.awayTeamId),
        teamMap.get(g.awayTeamId),
        g.venueName
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Options by name, only for leagues / seasons / divisions that have
  // games (a picker of 70 empty seasons is noise). The selected value is
  // always kept so a deep link still shows what it filtered on.
  // Divisions follow the chosen season when one is set.
  const gameDivisionIds = new Set(gamesPage.items.map((g) => g.divisionId).filter(Boolean));
  const gameSeasonIds = new Set(
    divisionsPage.items.filter((d) => gameDivisionIds.has(d.id)).map((d) => d.seasonId)
  );
  const gameLeagueIds = new Set(gamesPage.items.map((g) => g.leagueId));
  // The API already narrowed games by league/division; then the loaded
  // games no longer tell which other options have games, so keep all.
  const narrowedByServer = !!leagueId || !!sp.divisionId;
  const leagueOptions = leaguesPage.items
    .filter((l) => narrowedByServer || gameLeagueIds.has(l.id) || l.id === leagueId)
    .map((l) => ({ value: l.id, label: l.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const seasonOptions = seasonsPage.items
    .filter((s) => narrowedByServer || gameSeasonIds.has(s.id) || s.id === sp.seasonId)
    .filter((s) => !leagueId || s.leagueId === leagueId)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map((s) => ({ value: s.id, label: `${s.name} · ${leagueMap.get(s.leagueId) ?? "Unknown league"}` }));
  const divisionOptions = divisionsPage.items
    .filter((d) => narrowedByServer || gameDivisionIds.has(d.id) || d.id === sp.divisionId)
    .filter((d) => (sp.seasonId ? d.seasonId === sp.seasonId : true))
    .filter((d) => (leagueId ? seasonMap.get(d.seasonId)?.leagueId === leagueId : true))
    .map((d) => ({
      value: d.id,
      label: sp.seasonId ? d.name : `${d.name} · ${seasonMap.get(d.seasonId)?.name ?? "Unknown season"}`
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // New game starts from what the admin is looking at (CLAUDE.md:
  // defaults reflect context), never the first league in the list.
  const newGameDefaults = {
    leagueId: leagueId ?? undefined,
    seasonId: sp.seasonId ?? undefined,
    divisionId: sp.divisionId ?? undefined
  };

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
        eyebrow="Games"
        title="Games"
        description="Every scheduled, live and finished game. Open a game to enter the score and finalize it."
        action={
          <CreateGameButton
            leagues={leaguesPage.items}
            defaults={newGameDefaults}
          />
        }
      />
      <KineticStrip
        cards={[
          {
            label: "Live now",
            value: live,
            icon: <CircleDot className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: live > 0 ? "live" : "idle"
          },
          {
            label: "Scheduled",
            value: scheduled,
            icon: <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: scheduled > 0 ? "info" : "idle"
          },
          {
            label: "Final",
            value: completed,
            icon: <Flag className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "ok"
          },
          {
            label: "Total tracked",
            value: total,
            icon: <CalendarRange className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "idle"
          }
        ]}
      />

      <div className="space-y-2">
        <UrlFilters
          searchPlaceholder="Search games by team or venue"
          selects={[
            { param: "leagueId", label: "League", allLabel: "All leagues", options: leagueOptions },
            { param: "seasonId", label: "Season", allLabel: "All seasons", options: seasonOptions },
            { param: "divisionId", label: "Division", allLabel: "All divisions", options: divisionOptions },
            { param: "status", label: "Status", allLabel: "All statuses", options: STATUS_OPTIONS }
          ]}
        />
        <p className="text-[12px] text-fg-muted">
          Showing {shown.length} of {total} games
        </p>
      </div>

      {loadFailed ? (
        <Alert tone="error">
          Could not load games. This is a server problem on our side, not your data. Reload to try again.
        </Alert>
      ) : total === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No games yet"
          description={
            status || leagueId || sp.divisionId
              ? "No games match the current filters."
              : "Schedule a game between any two teams in a league."
          }
          action={
            <CreateGameButton
              leagues={leaguesPage.items}
              defaults={newGameDefaults}
            />
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No games match these filters"
          description="Clear the search or pick a different league, season, division or status."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Kickoff</TH>
              <TH>Matchup</TH>
              <TH>League</TH>
              <TH>Division</TH>
              <TH>Sport</TH>
              <TH className="text-right">Score</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {shown.map((g) => {
              const kt = formatKickoff(g.scheduledStartTsUtc, g.tz);
              const home = teamMap.get(g.homeTeamId) ?? "Unnamed team";
              const away = teamMap.get(g.awayTeamId) ?? "Unnamed team";
              const division = g.divisionId ? divisionMap.get(g.divisionId) : null;
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
                    {leagueMap.get(g.leagueId) ?? "Unknown league"}
                  </TD>
                  <TD className="text-fg-muted">
                    {division
                      ? `${division.name}${seasonMap.get(division.seasonId) ? ` · ${seasonMap.get(division.seasonId)!.name}` : ""}`
                      : "—"}
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
