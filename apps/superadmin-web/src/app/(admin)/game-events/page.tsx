import { Activity } from "lucide-react";
import Link from "next/link";
import { gameOps, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { Eyebrow } from "@/components/ui/eyebrow";
import { EmptyState } from "@/components/ui/empty-state";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";

export const metadata = { title: "Game events — SportsPulse" };

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
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

  const [page, teamsPage] = await Promise.all([
    gameOps
      .listEvents({
        eventType: sp?.eventType,
        gameId: sp?.gameId,
        limit: 100
      })
      .catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt
      .listTeams({})
      .catch(() => ({ items: [], nextCursor: null }))
  ]);

  const teamMap = new Map(
    teamsPage.items.map((t) => [t.id, t.shortName ?? t.name])
  );

  // Build distinct eventType list from current page for filter pills.
  const distinctTypes = Array.from(
    new Set(page.items.map((e) => e.eventType))
  ).sort();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="OPERATIONS"
        title="Game events"
        description="Append-only event log across every game. Each row is immutable; corrections create new events with a back-pointer."
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

      {page.items.length === 0 ? (
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
                  <TD className="font-mono text-[11px] text-fg-muted">
                    <Link
                      href={`/games/${e.gameId}`}
                      className="hover:underline"
                    >
                      {e.gameId.slice(0, 8)}
                    </Link>
                  </TD>
                  <TD className="text-fg-muted">
                    {e.teamId
                      ? (teamMap.get(e.teamId) ?? e.teamId.slice(0, 6))
                      : "—"}
                  </TD>
                  <TD className="font-mono text-[11px] text-fg-muted">
                    {e.primaryPersonId ? (
                      <Link
                        href={`/persons/${e.primaryPersonId}`}
                        className="hover:underline"
                      >
                        {e.primaryPersonId.slice(0, 8)}
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
