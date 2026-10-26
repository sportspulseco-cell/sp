import Link from "next/link";
import { formatInZone } from "@sportspulse/kernel";
import { load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Users } from "lucide-react";
import { Badge, EmptyState, LoadError, PageHeader } from "@sportspulse/ui";
import { captain, compliance, gameOps, iam } from "@/lib/api/server-api";
import { LineupEditor } from "./lineup-editor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

export default async function LineupEditorPage({
  params
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const scopeResult = await load(iam.meScope());
  if (!scopeResult.ok) {
    return (
      <LoadError
        what="your team"
        status={scopeResult.status}
        message={scopeResult.message}
        action={
          <Link
            href="/lineups"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            All games
          </Link>
        }
      />
    );
  }
  const myTeamId = scopeResult.data.teamIds[0] ?? null;
  if (!myTeamId) notFound();

  const gameResult = await load(gameOps.getGame(gameId));
  if (!gameResult.ok) {
    if (gameResult.status === 404) notFound();
    return (
      <LoadError
        what="this game"
        status={gameResult.status}
        message={gameResult.message}
        action={
          <Link
            href="/lineups"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            All games
          </Link>
        }
      />
    );
  }
  const game = gameResult.data;
  if (game.homeTeamId !== myTeamId && game.awayTeamId !== myTeamId) {
    notFound();
  }

  // The roster of the game's season, not "today's" season: a team live in
  // two seasons showed the other season's players here (SCH-23). Games
  // without a season fall back to the season current at kickoff.
  const [rosterResp, lineup, suspendedResult] = await Promise.all([
    captain.roster
      .list(myTeamId, game.seasonId ?? undefined, { asOf: game.scheduledStartTsUtc })
      .catch(() => null),
    gameOps.getLineup(gameId, myTeamId).catch(() => null),
    // Players barred from this game (UC-14, COMP-13). The server refuses
    // them on save either way; this marks them in the editor.
    load(compliance.teamSuspensions(myTeamId, { gameId }))
  ]);
  const suspended = suspendedResult.ok
    ? Object.fromEntries(suspendedResult.data.items.map((x) => [x.personId, x.label]))
    : {};

  const isLocked = !!lineup?.lockedAt || game.status !== "scheduled";
  const isHome = game.homeTeamId === myTeamId;
  const opponentName =
    (isHome ? game.awayTeamName : game.homeTeamName) ?? "Unnamed team";

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
          eyebrow="LINEUP"
          title={`${isHome ? "vs" : "@"} ${opponentName}`}
          description={fmtDateTime(game.scheduledStartTsUtc, game.tz)}
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
        eyebrow="LINEUP"
        title={`${isHome ? "vs" : "@"} ${opponentName}`}
        description={fmtDateTime(game.scheduledStartTsUtc, game.tz)}
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
        suspended={suspended}
        suspensionsChecked={suspendedResult.ok}
      />
    </div>
  );
}
