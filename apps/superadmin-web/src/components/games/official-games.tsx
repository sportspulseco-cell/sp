import { fetchAll } from "@sportspulse/api-client";
import { formatInZone } from "@sportspulse/kernel";
import { Alert, EmptyState, PageHeader, UrlFilters } from "@sportspulse/ui";
import { CalendarRange, ChevronRight } from "lucide-react";
import Link from "next/link";
import { gameOps } from "@/lib/api/server-api";
import { GameStatusBadge } from "@/components/games/game-status-badge";
import type { Game, GameStatus } from "@/lib/api/types";

const STATUS_OPTIONS: Array<{ value: GameStatus; label: string }> = [
  { value: "scheduled", label: "Scheduled" },
  { value: "in_play", label: "Live" },
  { value: "completed", label: "Final" },
  { value: "postponed", label: "Postponed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "forfeited", label: "Forfeit" }
];

/**
 * "My games" for a game-day official (scorekeeper, referee, or a crew
 * spot on a game). Only the games they run, live first, then upcoming,
 * then finished. Big rows so a tap on an iPad opens the scoresheet.
 */
export async function OfficialGames({
  sp
}: {
  sp: { q?: string; status?: GameStatus };
}) {
  let loadFailed = false;
  const page = await fetchAll((cursor) =>
    gameOps.listGames({ assignedToMe: true, status: sp.status, limit: 100, cursor })
  ).catch((e) => {
    console.error("[games] official listGames failed", e);
    loadFailed = true;
    return { items: [] as Game[] };
  });

  const q = sp.q?.trim().toLowerCase() ?? "";
  const shown = page.items.filter((g) => {
    if (!q) return true;
    return [g.homeTeamName, g.awayTeamName, g.venueName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
  const rank = (g: Game) => (g.status === "in_play" ? 0 : g.status === "scheduled" ? 1 : 2);
  const ordered = [...shown].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    // Finished games newest first; the rest soonest first.
    return rank(a) === 2
      ? b.scheduledStartTsUtc.localeCompare(a.scheduledStartTsUtc)
      : a.scheduledStartTsUtc.localeCompare(b.scheduledStartTsUtc);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Game day"
        title="My games"
        description="Games you keep score or referee for. Open one to run the scoresheet."
      />
      <UrlFilters
        searchPlaceholder="Search by team or rink"
        selects={[{ param: "status", label: "Status", allLabel: "All statuses", options: STATUS_OPTIONS }]}
      />
      {loadFailed ? (
        <Alert tone="error">
          Could not load your games. This is a server problem on our side. Reload to try again.
        </Alert>
      ) : ordered.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title={page.items.length === 0 ? "No games assigned to you" : "No games match"}
          description={
            page.items.length === 0
              ? "When your league assigns you to a game, it shows here. Ask your league admin."
              : "Clear the search or pick another status."
          }
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-1">
          {ordered.map((g) => {
            const showScore = g.status === "in_play" || g.status === "completed" || g.status === "forfeited";
            return (
              <li key={g.id}>
                <Link
                  href={`/games/${g.id}`}
                  className="flex min-h-[64px] items-center gap-4 px-5 py-3 hover:bg-surface-2"
                >
                  <div className="w-32 shrink-0">
                    <p className="text-sm font-medium text-fg">
                      {formatInZone(g.scheduledStartTsUtc, g.tz, { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                    <p className="font-mono text-[12px] text-fg-muted">
                      {formatInZone(g.scheduledStartTsUtc, g.tz, { hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-fg">
                      {g.awayTeamName ?? "Away"} <span className="text-fg-muted">at</span> {g.homeTeamName ?? "Home"}
                    </p>
                    <p className="truncate text-[12px] text-fg-muted">
                      {[g.venueName, g.surfaceLabel].filter(Boolean).join(" · ") || "Rink not set"}
                    </p>
                  </div>
                  {showScore ? (
                    <span className="font-mono text-[15px] tabular-nums text-fg">
                      {g.awayScore}–{g.homeScore}
                    </span>
                  ) : null}
                  <GameStatusBadge status={g.status} />
                  <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" strokeWidth={1.75} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
