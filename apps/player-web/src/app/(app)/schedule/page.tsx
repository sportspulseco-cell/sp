import {
  CalendarRange,
  Clock,
  Download,
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
export const revalidate = 0;
export const metadata = { title: "Schedule — SportsPulse" };

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function fmtDay(iso: string): { day: string; mon: string } {
  const d = new Date(iso);
  return {
    day: String(d.getDate()),
    mon: d.toLocaleDateString(undefined, { month: "short" }).toUpperCase()
  };
}

function statusBadge(g: Game, myTeamId: string | null) {
  if (g.status === "completed" && g.homeScore != null && g.awayScore != null) {
    const isHome = g.homeTeamId === myTeamId;
    const us = isHome ? g.homeScore : g.awayScore;
    const them = isHome ? g.awayScore : g.homeScore;
    const result = us > them ? "W" : us < them ? "L" : "T";
    const tone =
      us > them ? "success" : us < them ? "danger" : "neutral";
    return (
      <Badge mono tone={tone}>
        {result} {us}–{them}
      </Badge>
    );
  }
  const tone =
    g.status === "scheduled"
      ? "info"
      : g.status === "postponed"
        ? "warning"
        : g.status === "cancelled"
          ? "danger"
          : "neutral";
  return (
    <Badge mono tone={tone}>
      {g.status.replace(/_/g, " ")}
    </Badge>
  );
}

export default async function SchedulePage({
  searchParams
}: {
  searchParams?: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp?.filter ?? "all";

  const scope = await iam.meScope().catch(() => null);
  const myTeamId = scope?.teamIds[0] ?? null;

  const gamesPage = myTeamId
    ? await gameOps
        .listGames({ teamId: myTeamId, limit: 100 })
        .catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  const all: Game[] = gamesPage.items;
  const now = Date.now();
  const upcoming = all
    .filter((g: Game) => new Date(g.scheduledStartTsUtc).getTime() >= now)
    .sort(
      (a: Game, b: Game) =>
        new Date(a.scheduledStartTsUtc).getTime() -
        new Date(b.scheduledStartTsUtc).getTime()
    );
  const completed = all
    .filter((g: Game) => g.status === "completed")
    .sort(
      (a: Game, b: Game) =>
        new Date(b.scheduledStartTsUtc).getTime() -
        new Date(a.scheduledStartTsUtc).getTime()
    );

  const list =
    filter === "upcoming"
      ? upcoming
      : filter === "completed"
        ? completed
        : all
            .slice()
            .sort(
              (a: Game, b: Game) =>
                new Date(b.scheduledStartTsUtc).getTime() -
                new Date(a.scheduledStartTsUtc).getTime()
            );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Schedule"
        title="Schedule"
        description="Every scheduled and completed game for your team this season."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-border bg-bg-subtle p-0.5">
          {(["all", "upcoming", "completed"] as const).map((k) => (
            <a
              key={k}
              href={k === "all" ? "/schedule" : `/schedule?filter=${k}`}
              className={
                "inline-flex h-8 items-center rounded px-3 font-mono text-[10px] uppercase tracking-widest " +
                (filter === k ? "bg-fg text-bg" : "text-fg-muted hover:text-fg")
              }
            >
              {k}
            </a>
          ))}
        </div>
        <button
          type="button"
          disabled
          title="iCal export — coming soon"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted opacity-60"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
          Add to calendar
        </button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No games scheduled yet"
          description="Check back once the league publishes the season schedule."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Game</TH>
              <TH>Venue</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {list.map((g: Game) => {
              const isHome = g.homeTeamId === myTeamId;
              const oppId = isHome ? g.awayTeamId : g.homeTeamId;
              const { day, mon } = fmtDay(g.scheduledStartTsUtc);
              return (
                <TR key={g.id}>
                  <TD>
                    <div className="flex flex-col leading-tight">
                      <span className="font-mono text-[16px] font-semibold text-fg">
                        {day}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                        {mon}
                      </span>
                    </div>
                  </TD>
                  <TD>
                    <p className="text-[13px] font-medium text-fg">
                      vs.{" "}
                      <span className="font-mono uppercase">
                        {oppId.slice(0, 8)}
                      </span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-muted">
                      <Clock className="h-3 w-3" strokeWidth={1.75} />
                      {fmtDateTime(g.scheduledStartTsUtc)}
                    </p>
                  </TD>
                  <TD className="text-[12px] text-fg-muted">
                    {g.venueName ? (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" strokeWidth={1.75} />
                        {g.venueName}
                        {g.surfaceLabel ? ` · ${g.surfaceLabel}` : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>{statusBadge(g, myTeamId)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
