import Link from "next/link";
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
import { gameOps, loadMeScope } from "@/lib/api/server-api";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule - Team Admin" };

// In the game's own zone, so server and browser show the same rink time.
function fmtDateTime(iso: string, tz: string): string {
  return formatInZone(iso, tz, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  });
}

export default async function TeamAdminSchedulePage({
  searchParams
}: {
  searchParams?: Promise<{ filter?: string }>;
}) {
  const filter = parseScheduleFilter((await searchParams)?.filter);
  const scope = await loadMeScope();
  const teamId = scope?.teamIds[0] ?? null;

  const page = teamId
    ? await gameOps.listGames({ teamId, limit: 100, publishedOnly: true }).catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  const all = page.items as Game[];
  // F-5: the next game first. Upcoming nearest first, completed most
  // recent first; All is upcoming then the past (kernel orderSchedule).
  const games = orderSchedule(all, filter);

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
        description="Every scheduled and completed game for your team."
      />
      <LiveScoreRefresh active={all.some((g) => g.status === "in_play")} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LinkTabs
          label="Show games"
          basePath="/schedule"
          selected={filter}
          tabs={SCHEDULE_FILTERS.map((k) => ({ value: k, label: SCHEDULE_FILTER_LABELS[k] }))}
        />
        {seasonIds.length > 0 && <ScheduleRealtimeBridge seasonIds={seasonIds} />}
      </div>
      {games.length === 0 ? (
        all.length > 0 && filter === "upcoming" ? (
          <EmptyState icon={CalendarRange} title="No upcoming games" description="Your team has no games left to play. Results are under Completed." />
        ) : all.length > 0 && filter === "completed" ? (
          <EmptyState icon={CalendarRange} title="No results yet" description="Games show here once they are final. Your next games are under Upcoming." />
        ) : (
          <EmptyState icon={CalendarRange} title="No games scheduled" description="Games appear once the league publishes the season schedule." />
        )
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Opponent</TH>
              <TH>Venue</TH>
              <TH>Status</TH>
              <TH className="text-right">Subs</TH>
            </TR>
          </THead>
          <TBody>
            {games.map((g: Game) => {
              const isHome = g.homeTeamId === teamId;
              const oppName = (isHome ? g.awayTeamName : g.homeTeamName) ?? "Unnamed team";
              const us = isHome ? g.homeScore : g.awayScore;
              const them = isHome ? g.awayScore : g.homeScore;
              const isFinal = g.status === "completed" && us != null && them != null;
              const result = isFinal ? (us > them ? "W" : us < them ? "L" : "T") : null;
              const tone = result === "W" ? "success" : result === "L" ? "danger" : result === "T" ? "neutral" : "info";
              return (
                <TR key={g.id}>
                  <TD className="text-[12px] text-fg flex items-center gap-1.5"><Clock className="h-3 w-3" strokeWidth={1.75} />{fmtDateTime(g.scheduledStartTsUtc, g.tz)}</TD>
                  <TD className="text-[12px] text-fg">{oppName}</TD>
                  <TD className="text-[12px] text-fg-muted flex items-center gap-1.5">
                    {g.venueName ? (<><MapPin className="h-3 w-3" strokeWidth={1.75} />{g.venueName}</>) : "-"}
                  </TD>
                  <TD>
                    {isFinal ? (
                      <Badge mono tone={tone}>{result} {us}-{them}</Badge>
                    ) : g.status === "in_play" ? (
                      <Badge mono tone="info">Live {us ?? 0}-{them ?? 0}</Badge>
                    ) : (
                      <Badge mono tone={g.status === "scheduled" ? "info" : "neutral"}>{g.status.replace(/_/g, " ")}</Badge>
                    )}
                  </TD>
                  <TD className="text-right">
                    {/* UC-31: ask a sub for a game that has not started. */}
                    {g.status === "scheduled" && new Date(g.scheduledStartTsUtc).getTime() > Date.now() ? (
                      <Link href={`/schedule/${g.id}/subs`} className="text-[12px] font-medium text-accent underline">
                        Find a sub
                      </Link>
                    ) : (
                      <span className="text-[12px] text-fg-muted">-</span>
                    )}
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
