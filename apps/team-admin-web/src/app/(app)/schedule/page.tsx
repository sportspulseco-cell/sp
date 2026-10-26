import { formatInZone } from "@sportspulse/kernel";
import {
  CalendarRange,
  Clock,
  MapPin
} from "lucide-react";
import {
  Badge,
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  LoadError
} from "@sportspulse/ui";
import type { Game } from "@sportspulse/api-client";
import { LiveScoreRefresh, ScheduleRealtimeBridge } from "@sportspulse/admin-pages";
import { gameOps, loadMeScope } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { load } from "@sportspulse/api-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule - Team Admin" };

// In the game's own zone, so server and browser show the same rink time.
function fmtDateTime(iso: string, tz: string): string {
  return formatInZone(iso, tz, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  });
}

export default async function TeamAdminSchedulePage() {
  const scope = await loadMeScope();
  const teamId = scope?.teamIds[0] ?? null;

  const pageResult = teamId
    ? await load(gameOps.listGames({ teamId, limit: 100, publishedOnly: true }))
    : null;
  const page = pageResult?.ok ? pageResult.data : { items: [], nextCursor: null };

  const games = (page.items as Game[]).slice().sort(
    (a, b) => new Date(b.scheduledStartTsUtc).getTime() - new Date(a.scheduledStartTsUtc).getTime()
  );

  const seasonIds = Array.from(
    new Set(
      games
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
      <LiveScoreRefresh active={games.some((g) => g.status === "in_play")} />
      {seasonIds.length > 0 && (
        <div className="flex justify-end">
          <ScheduleRealtimeBridge seasonIds={seasonIds} />
        </div>
      )}
      {pageResult && !pageResult.ok ? (
        <LoadError what="your schedule" status={pageResult.status} message={pageResult.message} />
      ) : games.length === 0 ? (
        <EmptyState icon={CalendarRange} title="No games scheduled" description="Games appear once the league publishes the season schedule." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Opponent</TH>
              <TH>Venue</TH>
              <TH>Status</TH>
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
                      <Badge status={g.status} domain="game" />
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
