import {
  formatInZone,
  orderSchedule,
  parseScheduleFilter,
  SCHEDULE_FILTER_LABELS,
  SCHEDULE_FILTERS
} from "@sportspulse/kernel";
import {
  CalendarRange,
  Clock,
  MapPin
} from "lucide-react";
import { Badge, EmptyState, LinkTabs, PageHeader, TBody, TD, TH, THead, TR, Table } from "@sportspulse/ui";
import type { Game } from "@sportspulse/api-client";
import { LiveScoreRefresh, ScheduleRealtimeBridge } from "@sportspulse/admin-pages";
import { gameOps, leagueMgmt, loadMeScope } from "@/lib/api/server-api";
import { ICalExportButton } from "./ical-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Schedule — SportsPulse" };

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
  const tone =
    g.status === "scheduled"
      ? "info"
      : g.status === "postponed"
        ? "warning"
        : g.status === "cancelled"
          ? "danger"
          : "neutral";
  return (
    <Badge mono tone={tone}>
      {g.status.replace(/_/g, " ")}
    </Badge>
  );
}

export default async function SchedulePage({
  searchParams
}: {
  searchParams?: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filter = parseScheduleFilter(sp?.filter);

  const scope = await loadMeScope();
  const myTeamId = scope?.teamIds[0] ?? null;

  const [gamesPage, team] = await Promise.all([
    myTeamId
      ? gameOps
          .listGames({ teamId: myTeamId, limit: 100, publishedOnly: true })
          .catch(() => ({ items: [], nextCursor: null }))
      : Promise.resolve({ items: [], nextCursor: null }),
    myTeamId
      ? leagueMgmt.getTeam(myTeamId).catch(() => null)
      : Promise.resolve(null)
  ]);

  const all: Game[] = gamesPage.items;
  // F-5: the next game first. Upcoming nearest first, completed most
  // recent first; All is upcoming then the past (kernel orderSchedule).
  const list = orderSchedule(all, filter);

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
        <LinkTabs
          label="Show games"
          basePath="/schedule"
          selected={filter}
          tabs={SCHEDULE_FILTERS.map((k) => ({ value: k, label: SCHEDULE_FILTER_LABELS[k] }))}
        />
        <div className="flex items-center gap-3">
          <LiveScoreRefresh active={all.some((g) => g.status === "in_play")} />
          {seasonIds.length > 0 && (
            <ScheduleRealtimeBridge seasonIds={seasonIds} />
          )}
          <ICalExportButton
            games={orderSchedule(all, "all")}
            teamLabel={team?.name ?? "My team"}
          />
        </div>
      </div>

      {list.length === 0 ? (
        all.length > 0 && filter === "upcoming" ? (
          <EmptyState
            icon={CalendarRange}
            title="No upcoming games"
            description="Your team has no games left to play. Results are under Completed."
          />
        ) : all.length > 0 && filter === "completed" ? (
          <EmptyState
            icon={CalendarRange}
            title="No results yet"
            description="Games show here once they are final. Your next games are under Upcoming."
          />
        ) : (
          <EmptyState
            icon={CalendarRange}
            title="No games scheduled yet"
            description="Check back once the league publishes the season schedule."
          />
        )
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
