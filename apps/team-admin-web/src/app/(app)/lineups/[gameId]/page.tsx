import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Users } from "lucide-react";
import { Badge, EmptyState } from "@sportspulse/ui";
import { captain, gameOps, iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { LineupEditor } from "./lineup-editor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default async function LineupEditorPage({
  params
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const scope = await iam.meScope().catch(() => null);
  const myTeamId = scope?.teamIds[0] ?? null;
  if (!myTeamId) notFound();

  const game = await gameOps.getGame(gameId).catch(() => null);
  if (!game) notFound();
  if (game.homeTeamId !== myTeamId && game.awayTeamId !== myTeamId) {
    notFound();
  }

  const [rosterResp, lineup] = await Promise.all([
    captain.roster.list(myTeamId).catch(() => null),
    gameOps.getLineup(gameId, myTeamId).catch(() => null)
  ]);

  const isLocked = !!lineup?.lockedAt || game.status !== "scheduled";
  const isHome = game.homeTeamId === myTeamId;
  const opponentId = isHome ? game.awayTeamId : game.homeTeamId;

  if (!rosterResp || rosterResp.memberships.length === 0) {
    return (
      <div className="space-y-6">
        <Link
          href="/lineups"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          All games
        </Link>
        <PageHeader
          eyebrow="// LINEUP"
          title={`${isHome ? "vs" : "@"} ${opponentId.slice(0, 8)}`}
          description={fmtDateTime(game.scheduledStartTsUtc)}
        />
        <EmptyState
          icon={Users}
          title="No active roster"
          description="Your roster has no active players for this season. Add players from the roster page before setting a lineup."
        />
      </div>
    );
  }

  // Filter to active memberships for the editor — released/suspended/
  // ineligible players don't get to dress.
  const activeRoster = rosterResp.memberships
    .filter((m) => m.currentStatus === "active")
    .map((m) => ({
      personId: m.personId,
      name:
        [m.personFirstName, m.personLastName].filter(Boolean).join(" ") ||
        "(unknown)",
      jerseyNumber: m.jerseyNumber != null ? String(m.jerseyNumber) : "",
      positionCode: m.positionCode ?? ""
    }));

  return (
    <div className="space-y-6">
      <Link
        href="/lineups"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All games
      </Link>
      <PageHeader
        eyebrow="// LINEUP"
        title={`${isHome ? "vs" : "@"} ${opponentId.slice(0, 8)}`}
        description={fmtDateTime(game.scheduledStartTsUtc)}
        action={
          isLocked ? (
            <Badge tone="danger" mono>
              <Lock className="mr-1 inline h-3 w-3" strokeWidth={2} />
              locked
            </Badge>
          ) : null
        }
      />

      <LineupEditor
        gameId={gameId}
        teamId={myTeamId}
        roster={activeRoster}
        initial={{
          starters: lineup?.starters ?? [],
          bench: lineup?.bench ?? [],
          scratches: lineup?.scratches ?? []
        }}
        locked={isLocked}
        submittedAt={lineup?.submittedAt ?? null}
      />
    </div>
  );
}
