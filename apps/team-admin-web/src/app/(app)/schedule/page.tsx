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
  Table
} from "@sportspulse/ui";
import type { Game } from "@sportspulse/api-client";
import { gameOps, iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule - Team Admin" };

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  });
}

export default async function TeamAdminSchedulePage() {
  const scope = await iam.meScope().catch(() => null);
  const teamId = scope?.teamIds[0] ?? null;

  const page = teamId
    ? await gameOps.listGames({ teamId, limit: 100 }).catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  const games = (page.items as Game[]).slice().sort(
    (a, b) => new Date(b.scheduledStartTsUtc).getTime() - new Date(a.scheduledStartTsUtc).getTime()
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Schedule"
        title="Schedule"
        description="Every scheduled and completed game for your team."
      />
      {games.length === 0 ? (
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
              const opp = isHome ? g.awayTeamId : g.homeTeamId;
              const us = isHome ? g.homeScore : g.awayScore;
              const them = isHome ? g.awayScore : g.homeScore;
              const isFinal = g.status === "completed" && us != null && them != null;
              const result = isFinal ? (us > them ? "W" : us < them ? "L" : "T") : null;
              const tone = result === "W" ? "success" : result === "L" ? "danger" : result === "T" ? "neutral" : "info";
              return (
                <TR key={g.id}>
                  <TD className="text-[12px] text-fg flex items-center gap-1.5"><Clock className="h-3 w-3" strokeWidth={1.75} />{fmtDateTime(g.scheduledStartTsUtc)}</TD>
                  <TD className="font-mono text-[11px] uppercase">{opp.slice(0, 8)}</TD>
                  <TD className="text-[12px] text-fg-muted flex items-center gap-1.5">
                    {g.venueName ? (<><MapPin className="h-3 w-3" strokeWidth={1.75} />{g.venueName}</>) : "-"}
                  </TD>
                  <TD>
                    {isFinal ? (
                      <Badge mono tone={tone}>{result} {us}-{them}</Badge>
                    ) : (
                      <Badge mono tone={g.status === "scheduled" ? "info" : "neutral"}>{g.status.replace(/_/g, " ")}</Badge>
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
