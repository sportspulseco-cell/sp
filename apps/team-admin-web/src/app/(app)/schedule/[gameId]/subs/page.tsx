import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { load } from "@sportspulse/api-client";
import { LoadError, PageHeader } from "@sportspulse/ui";
import { loadMeScope, subs } from "@/lib/api/server-api";
import { SubsClient } from "./subs-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Find a sub - Team Admin" };

/**
 * UC-31: the captain asks an eligible player to sub for one game. The
 * API decides who is eligible (free agents of the season and players at
 * this level on other teams, free at game time, not suspended, within
 * the guest limits) and returns 404 unless the caller captains a team
 * in this game.
 */
export default async function GameSubsPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const scope = await loadMeScope();
  const teamIds = scope?.teamIds ?? [];
  if (teamIds.length === 0) notFound();

  // The captain's team in this game: the first of their teams the API serves.
  let teamId: string | null = null;
  let result: Awaited<ReturnType<typeof load<Awaited<ReturnType<typeof subs.captainView>>>>> | null = null;
  for (const t of teamIds) {
    const r = await load(subs.captainView(t, gameId));
    if (r.ok) {
      teamId = t;
      result = r;
      break;
    }
    if (r.status !== 404) {
      result = r;
      break;
    }
  }
  const back = (
    <Link href="/schedule" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg">
      <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
      Schedule
    </Link>
  );
  if (!result) notFound();
  if (!result.ok) {
    return <LoadError what="this game's subs" status={result.status} message={result.message} action={back} />;
  }
  const view = result.data;
  return (
    <div className="space-y-6">
      {back}
      <PageHeader
        eyebrow="Find a sub"
        title={`${view.game.homeTeamId === teamId ? "vs" : "@"} ${view.game.opponentName ?? "Opponent"}`}
        description={`${view.game.when}${view.game.venueName ? ` · ${view.game.venueName}` : ""}`}
      />
      <SubsClient teamId={teamId!} gameId={gameId} initial={view} />
    </div>
  );
}
