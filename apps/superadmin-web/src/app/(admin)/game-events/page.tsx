import { fetchAll, load, mapLimit } from "@sportspulse/api-client";
import { LoadError, LocalDate, Eyebrow, EmptyState, PageHeader, TBody, TD, TH, THead, TR, Table } from "@sportspulse/ui";
import { Activity, Layers, Clock, CircleDot } from "lucide-react";
import Link from "next/link";
import { gameOps, iam, leagueMgmt } from "@/lib/api/server-api";
import { KineticStrip } from "@/components/layout/kinetic-strip";

export const metadata = { title: "Game events · Super Admin" };

function fmtTime(iso: string) {
  return <LocalDate iso={iso} options={{ month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }} />;
}

function fmtClock(sec: number | null) {
  if (sec === null || sec === undefined) return null;
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function dotColor(eventType: string): string {
  if (eventType.includes("goal")) return "bg-emerald-500";
  if (eventType.includes("assist")) return "bg-blue-500";
  if (eventType.includes("save")) return "bg-cyan-500";
  if (eventType.includes("penalty") || eventType.includes("card"))
    return "bg-rose-500";
  if (eventType.includes("shot")) return "bg-amber-500";
  return "bg-fg-muted";
}

export default async function GameEventsPage({
  searchParams
}: {
  searchParams?: Promise<{ eventType?: string; gameId?: string }>;
}) {
  const sp = await searchParams;

  const [eventsResult, teamsPage, personsPage] = await Promise.all([
    load(
      gameOps.listEvents({
        eventType: sp?.eventType,
        gameId: sp?.gameId,
        limit: 100
      })
    ),
    fetchAll((cursor) => leagueMgmt.listTeams({ limit: 100, cursor }))
      .catch(() => ({ items: [], nextCursor: null })),
    fetchAll((cursor) => iam.listPersons({ limit: 100, cursor }))
      .catch(() => ({ items: [], nextCursor: null }))
  ]);
  if (!eventsResult.ok) {
    console.error("[game-events] listEvents failed", eventsResult.status, eventsResult.message);
  }
  const page = eventsResult.ok ? eventsResult.data : { items: [], nextCursor: null };

  const teamMap = new Map(
    teamsPage.items.map((t) => [t.id, t.shortName ?? t.name])
  );
  const personMap = new Map(
    personsPage.items.map((p) => [
      p.id,
      p.preferredName ?? `${p.legalFirstName} ${p.legalLastName}`
    ])
  );
  // Label each game "Home vs Away" instead of printing its id.
  // Six at a time, not one request per game at once (CONSOLE-22).
  const gameEntries = await mapLimit(
    Array.from(new Set(page.items.map((e) => e.gameId))),
    6,
    async (gid) => [gid, await gameOps.getGame(gid).catch(() => null)] as const
  );
  const gameLabel = new Map(
    gameEntries.map(([gid, g]) => [
      gid,
      g
        ? `${g.homeTeamName ?? "Unnamed team"} vs ${g.awayTeamName ?? "Unnamed team"}`
        : "Unknown game"
    ])
  );

  // Build distinct eventType list from current page for filter pills.
  const distinctTypes = Array.from(
    new Set(page.items.map((e) => e.eventType))
  ).sort();

  const total = page.items.length;
  const goals = page.items.filter((e) => e.eventType.includes("goal")).length;
  const penalties = page.items.filter(
    (e) => e.eventType.includes("penalty") || e.eventType.includes("card")
  ).length;
  const distinctGames = new Set(page.items.map((e) => e.gameId)).size;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Games"
        title="Game log"
        description="Goals, assists and penalties recorded in every game. A correction adds a new entry; nothing is deleted."
      />
      <KineticStrip
        cards={[
          { label: "Recent events", value: total, icon: <Activity className="h-3.5 w-3.5" strokeWidth={1.75} />, tone: "idle" },
          { label: "Goals", value: goals, icon: <CircleDot className="h-3.5 w-3.5" strokeWidth={1.75} />, tone: "ok" },
          {
            label: "Penalties",
            value: penalties,
            icon: <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: penalties > 0 ? "warn" : "idle"
          },
          {
            label: "Distinct games",
            value: distinctGames,
            icon: <Layers className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "info"
          }
        ]}
      />

      {/* Type filter pills */}
      {distinctTypes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href="/game-events"
            className={
              !sp?.eventType
                ? "rounded-full bg-fg px-3 py-1 text-[12px] font-medium text-bg"
                : "rounded-full border border-border bg-surface-1 px-3 py-1 text-[12px] font-medium text-fg-muted hover:border-border-strong hover:text-fg"
            }
          >
            All
          </Link>
          {distinctTypes.map((t) => (
            <Link
              key={t}
              href={`/game-events?eventType=${encodeURIComponent(t)}`}
              className={
                sp?.eventType === t
                  ? "rounded-full bg-fg px-3 py-1 text-[12px] font-medium text-bg"
                  : "rounded-full border border-border bg-surface-1 px-3 py-1 text-[12px] font-medium text-fg-muted hover:border-border-strong hover:text-fg"
              }
            >
              {t.replace(/_/g, " ")}
            </Link>
          ))}
        </div>
      ) : null}

      {!eventsResult.ok ? (
        <LoadError
          what="game events"
          status={eventsResult.status}
          message={eventsResult.message}
        />
      ) : page.items.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No events yet"
          description="Once a game is in_play and events are logged, they'll appear here in chronological order."
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface-1">
          <header className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <Eyebrow>Event log</Eyebrow>
              <p className="mt-1 text-[13px] text-fg-muted">
                {page.items.length} most recent events · newest first
              </p>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
              Append-only
            </span>
          </header>
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Type</TH>
                <TH>Game</TH>
                <TH>Team</TH>
                <TH>Player</TH>
                <TH className="text-center">Period</TH>
                <TH className="text-center">Clock</TH>
              </TR>
            </THead>
            <TBody>
              {page.items.map((e) => (
                <TR key={e.id}>
                  <TD className="font-mono text-[11px] tabular-nums text-fg-muted">
                    {fmtTime(e.tsUtc)}
                  </TD>
                  <TD>
                    <span
                      aria-hidden
                      className={`mr-2 inline-block h-1.5 w-1.5 -translate-y-px rounded-full ${dotColor(e.eventType)}`}
                    />
                    <span className="font-mono text-[11px] uppercase tracking-wide text-fg">
                      {e.eventType.replace(/_/g, " ")}
                    </span>
                  </TD>
                  <TD className="text-[12px] text-fg-muted">
                    <Link
                      href={`/games/${e.gameId}`}
                      className="hover:underline"
                    >
                      {gameLabel.get(e.gameId) ?? "Unknown game"}
                    </Link>
                  </TD>
                  <TD className="text-fg-muted">
                    {e.teamId
                      ? (teamMap.get(e.teamId) ?? "Unnamed team")
                      : "—"}
                  </TD>
                  <TD className="text-[12px] text-fg-muted">
                    {e.primaryPersonId ? (
                      <Link
                        href={`/persons/${e.primaryPersonId}`}
                        className="hover:underline"
                      >
                        {personMap.get(e.primaryPersonId) ?? "Unknown player"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="text-center font-mono tabular-nums text-fg-muted">
                    {e.period ?? "—"}
                  </TD>
                  <TD className="text-center font-mono tabular-nums text-fg-muted">
                    {fmtClock(e.clockRemainingSec) ?? "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
