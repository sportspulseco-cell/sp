import Link from "next/link";
import { ArrowRight, CalendarRange, ClipboardList } from "lucide-react";
import { Badge, EmptyState } from "@sportspulse/ui";
import { gameOps, iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Lineups — SportsPulse" };

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

/**
 * Lineups index for the captain. Lists every scheduled / in-play
 * game for the captain's primary team. Click into one to edit
 * starters / bench / scratches.
 *
 * Backlog #5 / flow E3.
 */
export default async function LineupsIndexPage() {
  const scope = await iam.meScope().catch(() => null);
  const myTeamId = scope?.teamIds[0] ?? null;
  if (!myTeamId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="// LINEUPS"
          title="Lineups"
          description="Pick starters, bench, and scratches per game. Locked the moment the game starts."
        />
        <EmptyState
          icon={ClipboardList}
          title="No team in scope"
          description="You don't appear to be assigned as captain of any team. Talk to your league admin if this is unexpected."
        />
      </div>
    );
  }

  const games = await gameOps
    .listGames({ teamId: myTeamId, limit: 50 })
    .catch(() => ({ items: [], nextCursor: null }));

  const upcoming = games.items
    .filter((g) => g.status === "scheduled" || g.status === "in_play")
    .sort(
      (a, b) =>
        new Date(a.scheduledStartTsUtc).getTime() -
        new Date(b.scheduledStartTsUtc).getTime()
    );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// LINEUPS"
        title="Lineups"
        description="Pick starters, bench, and scratches per game. Locked the moment the game starts."
      />

      {upcoming.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No upcoming games"
          description="Once the league schedules a game for your team, you'll be able to set the lineup here."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-1">
          {upcoming.map((g) => {
            const isHome = g.homeTeamId === myTeamId;
            const opponentId = isHome ? g.awayTeamId : g.homeTeamId;
            const inPlay = g.status === "in_play";
            return (
              <li key={g.id}>
                <Link
                  href={`/lineups/${g.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                      {fmt(g.scheduledStartTsUtc)}
                    </p>
                    <p className="mt-0.5 text-[15px] font-semibold tracking-tight text-fg">
                      {isHome ? "vs" : "@"}{" "}
                      <span className="font-mono text-[12px] text-fg-muted">
                        {opponentId.slice(0, 8)}
                      </span>
                    </p>
                    {g.venueName && (
                      <p className="mt-0.5 text-[12px] text-fg-muted">
                        {g.venueName}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={inPlay ? "danger" : "neutral"} mono>
                      {inPlay ? "locked · in play" : "scheduled"}
                    </Badge>
                    <ArrowRight
                      className="h-4 w-4 text-fg-muted"
                      strokeWidth={1.75}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
