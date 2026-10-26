import { formatInZone } from "@sportspulse/kernel";
import {
  CalendarRange,
  Clock,
  MapPin
} from "lucide-react";
import {
  Badge,
  EmptyState,
  LoadError,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import { load, type Game } from "@sportspulse/api-client";
import { LiveScoreRefresh, ScheduleRealtimeBridge } from "@sportspulse/admin-pages";
import { gameOps, leagueMgmt, loadMeScope } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { ICalExportButton } from "./ical-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Schedule · Player" };

// In the game's own zone.
function fmtDateTime(iso: string, tz: string): string {
  return formatInZone(iso, tz, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function fmtDay(iso: string, tz: string): { day: string; mon: string } {
  return {
    day: formatInZone(iso, tz || "UTC", { day: "numeric" }),
    mon: formatInZone(iso, tz || "UTC", { month: "short" }).toUpperCase()
  };
}

function statusBadge(g: Game, myTeamId: string | null) {
  if (g.status === "in_play") {
    const isHome = g.homeTeamId === myTeamId;
    const us = (isHome ? g.homeScore : g.awayScore) ?? 0;
    const them = (isHome ? g.awayScore : g.homeScore) ?? 0;
    return (
      <Badge mono tone="info">
        Live {us}–{them}
      </Badge>
    );
  }
  if (g.status === "completed" && g.homeScore != null && g.awayScore != null) {
    const isHome = g.homeTeamId === myTeamId;
    const us = isHome ? g.homeScore : g.awayScore;
    const them = isHome ? g.awayScore : g.homeScore;
    const result = us > them ? "W" : us < them ? "L" : "T";
    const tone =
      us > them ? "success" : us < them ? "danger" : "neutral";
    return (
      <Badge mono tone={tone}>
        {result} {us}–{them}
      </Badge>
    );
  }
  return <Badge status={g.status} domain="game" />;
}

export default async function SchedulePage({
  searchParams
}: {
  searchParams?: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp?.filter ?? "all";

  const scope = await loadMeScope();
  const myTeamId = scope?.teamIds[0] ?? null;

  // A failed games load is shown as an error, never as "no games".
  const [gamesResult, team] = await Promise.all([
    myTeamId
      ? load(gameOps.listGames({ teamId: myTeamId, limit: 100, publishedOnly: true }))
      : Promise.resolve(null),
    myTeamId
      ? leagueMgmt.getTeam(myTeamId).catch(() => null)
      : Promise.resolve(null)
  ]);

  const gamesFailed = gamesResult && !gamesResult.ok ? gamesResult : null;
  const all: Game[] = gamesResult?.ok ? gamesResult.data.items : [];
  const now = Date.now();
  const upcoming = all
    .filter((g: Game) => new Date(g.scheduledStartTsUtc).getTime() >= now)
    .sort(
      (a: Game, b: Game) =>
        new Date(a.scheduledStartTsUtc).getTime() -
        new Date(b.scheduledStartTsUtc).getTime()
    );
  const completed = all
    .filter((g: Game) => g.status === "completed")
    .sort(
      (a: Game, b: Game) =>
        new Date(b.scheduledStartTsUtc).getTime() -
        new Date(a.scheduledStartTsUtc).getTime()
    );

  const list =
    filter === "upcoming"
      ? upcoming
      : filter === "completed"
        ? completed
        : all
            .slice()
            .sort(
              (a: Game, b: Game) =>
                new Date(b.scheduledStartTsUtc).getTime() -
                new Date(a.scheduledStartTsUtc).getTime()
            );

  // Resolve opponent team names so the row reads "vs. Boston Gold Kings"
  // instead of "vs. D99BA8FD" (BUG-037). One getTeam call per unique
  // opponent across the visible list — at most ~20-30 calls per page
  // load, all in parallel.
  const opponentIds = Array.from(
    new Set(
      list
        .map((g) => (g.homeTeamId === myTeamId ? g.awayTeamId : g.homeTeamId))
        .filter((id): id is string => Boolean(id))
    )
  );
  const opponentEntries = await Promise.all(
    opponentIds.map(
      async (id) =>
        [id, await leagueMgmt.getTeamSummary(id).catch(() => null)] as const
    )
  );
  const opponentNames = new Map<string, string>();
  for (const [id, t] of opponentEntries) {
    if (t?.name) opponentNames.set(id, t.name);
  }

  // Unique season ids across this team's games — drives the Realtime
  // bridge below. If the team is in one active season, this is a single
  // channel; multi-season players (rare) get one per season.
  const seasonIds = Array.from(
    new Set(
      all
        .map((g) => (g as Game & { seasonId?: string }).seasonId)
        .filter((id): id is string => Boolean(id))
    )
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Schedule"
        title="Schedule"
        description="Every scheduled and completed game for your team this season."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-border bg-bg-subtle p-0.5">
          {(["all", "upcoming", "completed"] as const).map((k) => (
            <a
              key={k}
              href={k === "all" ? "/schedule" : `/schedule?filter=${k}`}
              className={
                "inline-flex h-8 items-center rounded px-3 font-mono text-[10px] uppercase tracking-widest " +
                (filter === k ? "bg-fg text-bg" : "text-fg-muted hover:text-fg")
              }
            >
              {k}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <LiveScoreRefresh active={all.some((g) => g.status === "in_play")} />
          {seasonIds.length > 0 && (
            <ScheduleRealtimeBridge seasonIds={seasonIds} />
          )}
          <ICalExportButton
            games={list}
            teamLabel={team?.name ?? "My team"}
          />
        </div>
      </div>

      {gamesFailed ? (
        <LoadError what="your schedule" status={gamesFailed.status} message={gamesFailed.message} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No games scheduled yet"
          description="Check back once the league publishes the season schedule."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Game</TH>
              <TH>Venue</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {list.map((g: Game) => {
              const isHome = g.homeTeamId === myTeamId;
              const oppId = isHome ? g.awayTeamId : g.homeTeamId;
              const { day, mon } = fmtDay(g.scheduledStartTsUtc, g.tz);
              return (
                <TR key={g.id}>
                  <TD>
                    <div className="flex flex-col leading-tight">
                      <span className="font-mono text-[16px] font-semibold text-fg">
                        {day}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                        {mon}
                      </span>
                    </div>
                  </TD>
                  <TD>
                    <p className="text-[13px] font-medium text-fg">
                      vs.{" "}
                      <span>{opponentNames.get(oppId) ?? "Unnamed team"}</span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-muted">
                      <Clock className="h-3 w-3" strokeWidth={1.75} />
                      {fmtDateTime(g.scheduledStartTsUtc, g.tz)}
                    </p>
                  </TD>
                  <TD className="text-[12px] text-fg-muted">
                    {g.venueName ? (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" strokeWidth={1.75} />
                        {g.venueName}
                        {g.surfaceLabel ? ` · ${g.surfaceLabel}` : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>{statusBadge(g, myTeamId)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
