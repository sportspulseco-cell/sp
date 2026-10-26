import { load, type GameStatus } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge, LoadError, PageHeader } from "@sportspulse/ui";
import { formatInZone, GAME_ENDING_LABELS } from "@sportspulse/kernel";
import { gameOps, leagueMgmt, loadMeScope } from "@/lib/api/server-api";
import { getActiveOrgId } from "@/lib/active-org";

export const metadata = { title: "Game — Org Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS: Record<GameStatus, { label: string; tone: "info" | "success" | "warning" | "danger" | "neutral" }> = {
  scheduled: { label: "Scheduled", tone: "info" },
  in_play: { label: "Live", tone: "warning" },
  completed: { label: "Final", tone: "success" },
  postponed: { label: "Postponed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
  forfeited: { label: "Forfeit", tone: "danger" }
};

// The rink's clock and zone: "Tue, Nov 4, 9:00 PM EST" (SCH-28).
function fmtStart(iso: string, tz: string): string {
  return formatInZone(iso, tz, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

/**
 * The org admin's view of one game: where the playoff bracket's "Open game"
 * links land. Read-only: score entry and game-day actions run in the league
 * console. The API returns 404 for a game outside the caller's scope; a
 * game in another of the admin's orgs is 404 here too.
 */
export default async function OrgAdminGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await load(gameOps.getGame(id));
  if (!result.ok) {
    if (result.status === 404) notFound();
    return <LoadError what="this game" status={result.status} message={result.message} />;
  }
  const game = result.data;

  const [scope, league] = await Promise.all([
    loadMeScope(),
    leagueMgmt.getLeague(game.leagueId).catch(() => null)
  ]);
  const activeOrgId = await getActiveOrgId(scope);
  if (activeOrgId && league && league.orgId !== activeOrgId) notFound();

  const home = game.homeTeamName ?? "Home";
  const away = game.awayTeamName ?? "Away";
  const showScore = game.status === "in_play" || game.status === "completed" || game.status === "forfeited";
  const status = STATUS[game.status] ?? { label: game.status, tone: "neutral" as const };
  const lastMove = game.reschedules?.length ? game.reschedules[game.reschedules.length - 1] : null;
  const back = game.seasonId
    ? { href: `/scheduling/${game.seasonId}/playoffs`, label: "← Playoffs" }
    : { href: "/scheduling", label: "← Scheduling" };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={league?.name ?? "game"}
        title={`${away} at ${home}`}
        description={[fmtStart(game.scheduledStartTsUtc, game.tz), game.venueName, game.surfaceLabel]
          .filter(Boolean)
          .join(" · ")}
        action={
          <Link
            href={back.href}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
          >
            {back.label}
          </Link>
        }
      />

      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <p className="text-[13px] text-fg-muted">
            {lastMove ? `Moved from ${fmtStart(lastMove.from.startTsUtc, game.tz)}${lastMove.reason ? `. Reason: ${lastMove.reason}` : ""}` : "Times are the rink's local time."}
          </p>
          <div className="flex items-center gap-2">
            {!game.publishedAt && game.status !== "cancelled" ? <Badge tone="warning">Draft</Badge> : null}
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
        </header>
        <div className="grid grid-cols-1 gap-4 px-6 py-8 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <TeamCell name={away} subtitle="Away" />
          <div className="flex items-center justify-center gap-4 font-mono text-[44px] font-semibold tabular-nums tracking-tight text-fg">
            {showScore ? (
              <>
                <span>{game.awayScore}</span>
                <span className="text-fg-muted">–</span>
                <span>{game.homeScore}</span>
              </>
            ) : (
              <span className="font-sans text-base font-medium uppercase tracking-[0.08em] text-fg-muted">vs</span>
            )}
          </div>
          <TeamCell name={home} subtitle="Home" align="end" />
        </div>
        {game.status === "in_play" ? (
          <p className="border-t border-border px-6 py-3 text-center font-mono text-[11px] uppercase tracking-wide text-fg-muted">
            Period {game.period}
          </p>
        ) : null}
        {game.status === "completed" && game.endedIn && game.endedIn !== "regulation" ? (
          <p className="border-t border-border px-6 py-3 text-center font-mono text-[11px] uppercase tracking-wide text-fg-muted">
            Final · {GAME_ENDING_LABELS[game.endedIn]}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function TeamCell({ name, subtitle, align = "start" }: { name: string; subtitle: string; align?: "start" | "end" }) {
  return (
    <div className={align === "end" ? "text-left md:text-right" : "text-left"}>
      <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">{subtitle}</div>
      <div className="mt-1 text-xl font-semibold text-fg">{name}</div>
    </div>
  );
}
