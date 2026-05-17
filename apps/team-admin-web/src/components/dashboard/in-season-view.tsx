import Link from "next/link";
import {
  ArrowRight,
  CalendarRange,
  CircleDollarSign,
  MapPin,
  ShieldCheck
} from "lucide-react";
import { Badge, Eyebrow } from "@sportspulse/ui";
import { gameOps, roster, stats } from "@/lib/api/server-api";
import type { DashboardState, DashboardTeam } from "./shared-types";

/**
 * Workflow 7C §6.8 — In-season mode.
 *
 * Next-game card hero, then 4 stat cards (record, standing, GF, GA),
 * dues mini-card, compliance mini-card, recent games list. Sidebar
 * exposes Roster / Schedule / Dues / Compliance / Comms.
 */
export async function InSeasonView({
  team,
  state
}: {
  team: DashboardTeam;
  state: DashboardState;
}) {
  // Best-effort data pulls — UI degrades gracefully if any fail.
  const [upcoming, memberships, standing] = await Promise.all([
    gameOps
      .listGames({ teamId: team.id, status: "scheduled", limit: 1 })
      .catch(() => ({ items: [], nextCursor: null })),
    roster
      .listMemberships({ teamId: team.id, activeOnly: true })
      .catch(() => ({ items: [], nextCursor: null })),
    state.leagueId
      ? stats
          .teamStanding(team.id, { leagueId: state.leagueId })
          .catch(() => null)
      : Promise.resolve(null)
  ]);

  const nextGame = upcoming.items[0] ?? null;
  const activeCount = memberships.items.length;
  const standingRow = standing?.team ?? null;
  const recordLabel = standingRow
    ? `${standingRow.w}-${standingRow.l}${standingRow.otl ? `-${standingRow.otl}` : ""}`
    : "—";
  const standLabel =
    standing?.rankInDivision != null
      ? `${standing.rankInDivision} / ${standing.teamCountInDivision}`
      : "—";
  const gfLabel = standingRow ? String(standingRow.gf) : "—";
  const gaLabel = standingRow ? String(standingRow.ga) : "—";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface-1 p-6">
        <Eyebrow>// in-season · {state.seasonName ?? ""}</Eyebrow>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              next game
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-fg">
              {nextGame ? formatGameTitle(nextGame, team.id) : "No upcoming game"}
            </p>
            {nextGame ? (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
                <CalendarRange className="h-3.5 w-3.5" strokeWidth={1.75} />
                {formatDate(nextGame.scheduledStartTsUtc)}
                {nextGame.venueName ? (
                  <>
                    <span className="text-fg-subtle">·</span>
                    <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {nextGame.venueName}
                  </>
                ) : null}
              </p>
            ) : (
              <p className="mt-1 text-[13px] text-fg-muted">
                The next game will show up here once the league schedules it.
              </p>
            )}
          </div>
          <Link
            href="/schedule"
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
          >
            View schedule <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard label="Active roster" value={activeCount} />
        <MetricCard label="Record (W-L-OTL)" value={recordLabel} />
        <MetricCard label="Standing" value={standLabel} />
        <MetricCard label="GF" value={gfLabel} />
        <MetricCard label="GA" value={gaLabel} />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MiniCard
          icon={CircleDollarSign}
          eyebrow="dues"
          title="Collection progress"
          body={
            state.thresholdCents > 0
              ? `${formatCents(state.collectedCents)} of ${formatCents(state.thresholdCents)} collected.`
              : "No collection threshold for this season."
          }
          href="/captain/dues"
        />
        <MiniCard
          icon={ShieldCheck}
          eyebrow="compliance"
          title="Roster compliance"
          body="Open the compliance tab to see USA Hockey + playoff eligibility status per player."
          href="/captain/compliance"
        />
      </section>

      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <Eyebrow>// recent games</Eyebrow>
          <Link
            href="/schedule"
            className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
          >
            See all
          </Link>
        </header>
        <RecentGames teamId={team.id} />
      </section>
    </div>
  );
}

async function RecentGames({ teamId }: { teamId: string }) {
  const completed = await gameOps
    .listGames({ teamId, status: "completed", limit: 3 })
    .catch(() => ({ items: [], nextCursor: null }));
  if (completed.items.length === 0) {
    return (
      <p className="px-5 py-5 text-[13px] text-fg-muted">
        No completed games yet — once finalised games land, they'll appear
        here with score + outcome.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {completed.items.map((g) => (
        <li
          key={g.id}
          className="flex items-center justify-between px-5 py-3 text-[13px]"
        >
          <span className="font-medium text-fg">{formatGameTitle(g, teamId)}</span>
          <span className="font-mono tabular-nums text-fg-muted">
            {g.homeScore}–{g.awayScore}
          </span>
          <Badge tone={outcomeTone(g, teamId)} mono>
            {outcomeLabel(g, teamId)}
          </Badge>
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {new Date(g.scheduledStartTsUtc).toLocaleDateString("en-CA")}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </p>
      <p className="mt-1 text-[22px] font-semibold tabular-nums text-fg">
        {value}
      </p>
    </div>
  );
}

function MiniCard({
  icon: Icon,
  eyebrow,
  title,
  body,
  href
}: {
  icon: typeof CircleDollarSign;
  eyebrow: string;
  title: string;
  body: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col rounded-xl border border-border bg-surface-1 p-5 hover:border-accent"
    >
      <Icon className="h-5 w-5 text-fg-muted group-hover:text-accent" strokeWidth={1.5} />
      <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {eyebrow}
      </p>
      <p className="mt-1 text-[15px] font-medium text-fg">{title}</p>
      <p className="mt-1 text-[12px] text-fg-muted">{body}</p>
      <span className="mt-auto inline-flex items-center gap-1 pt-3 font-mono text-[10px] uppercase tracking-widest text-accent">
        Open <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}

function formatGameTitle(
  g: { homeTeamId: string; awayTeamId: string },
  teamId: string
): string {
  const isHome = g.homeTeamId === teamId;
  return isHome ? "vs opponent" : "@ opponent";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function outcomeTone(
  g: { homeScore: number; awayScore: number; homeTeamId: string },
  teamId: string
): "success" | "danger" | "neutral" {
  const isHome = g.homeTeamId === teamId;
  const ours = isHome ? g.homeScore : g.awayScore;
  const theirs = isHome ? g.awayScore : g.homeScore;
  if (ours > theirs) return "success";
  if (ours < theirs) return "danger";
  return "neutral";
}

function outcomeLabel(
  g: { homeScore: number; awayScore: number; homeTeamId: string },
  teamId: string
): string {
  const isHome = g.homeTeamId === teamId;
  const ours = isHome ? g.homeScore : g.awayScore;
  const theirs = isHome ? g.awayScore : g.homeScore;
  if (ours > theirs) return "W";
  if (ours < theirs) return "L";
  return "T";
}

function formatCents(c: number): string {
  return `$${(c / 100).toFixed(2)}`;
}
