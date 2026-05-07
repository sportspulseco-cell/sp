import { ChartBar } from "lucide-react";
import {
  Badge,
  EmptyState,
  Eyebrow,
  IconTile,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import type { Game, StatLine } from "@sportspulse/api-client";
import { gameOps, iam, stats } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Stats — SportsPulse" };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function num(s: StatLine, key: string): number {
  const v = s.core?.[key];
  return typeof v === "number" ? v : 0;
}

export default async function StatsPage() {
  const scope = await iam.meScope().catch(() => null);
  const personId = scope?.personId ?? null;
  const myTeamId = scope?.teamIds[0] ?? null;

  if (!personId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="// Stats"
          title="Stats"
          description="Season totals + game-by-game log."
        />
        <EmptyState
          icon={ChartBar}
          title="No person record"
          description="Once your registration is approved, your stats will start tracking here."
        />
      </div>
    );
  }

  // Pull stat lines for this player. seasonId filter would scope to
  // the current season — left wide here so the page works before the
  // season-selector ships.
  const [linesPage, gamesPage] = await Promise.all([
    stats
      .listLines({ personId, limit: 100 })
      .catch(() => ({ items: [], nextCursor: null })),
    myTeamId
      ? gameOps
          .listGames({ teamId: myTeamId, limit: 100 })
          .catch(() => ({ items: [], nextCursor: null }))
      : Promise.resolve({ items: [], nextCursor: null })
  ]);

  const lines: StatLine[] = linesPage.items;
  const games: Game[] = gamesPage.items;
  const gameById = new Map<string, Game>(games.map((g: Game) => [g.id, g]));

  // Aggregate season totals from individual stat lines. The
  // `core` JSONB holds the canonical stats keys per sport — here we
  // assume hockey-style keys (goals, assists, shots, pim) since
  // PPHL is the seed data; other sports just won't render values.
  const totals = lines.reduce(
    (acc, s: StatLine) => {
      acc.gp += s.gpIncrement;
      acc.goals += num(s, "goals");
      acc.assists += num(s, "assists");
      acc.shots += num(s, "shots_on_goal");
      acc.pim += num(s, "penalty_minutes");
      acc.plusMinus += num(s, "plus_minus");
      return acc;
    },
    { gp: 0, goals: 0, assists: 0, shots: 0, pim: 0, plusMinus: 0 }
  );
  const points = totals.goals + totals.assists;
  const shotPct =
    totals.shots > 0 ? ((totals.goals / totals.shots) * 100).toFixed(1) : "0.0";

  // Game-by-game log — sorted newest first.
  const log = lines
    .slice()
    .sort(
      (a: StatLine, b: StatLine) =>
        new Date(b.derivedAt).getTime() - new Date(a.derivedAt).getTime()
    );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Stats"
        title="Stats"
        description="Season totals and game-by-game log. Per-season selector + ranks vs. division leader land in a follow-up."
      />

      {lines.length === 0 ? (
        <EmptyState
          icon={ChartBar}
          title="No stats yet"
          description="Stats will appear here after your first game once the scorekeeper finalises the scoresheet."
        />
      ) : (
        <>
          {/* Headline metrics */}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Goals"
              value={String(totals.goals)}
              hint={`${totals.gp} GP`}
              tint="blue"
            />
            <Kpi
              label="Assists"
              value={String(totals.assists)}
              hint={`${totals.gp} GP`}
              tint="emerald"
            />
            <Kpi
              label="Points"
              value={String(points)}
              hint={
                totals.gp > 0
                  ? `${(points / totals.gp).toFixed(2)} per game`
                  : "—"
              }
              tint="violet"
            />
            <Kpi
              label="+/−"
              value={
                totals.plusMinus === 0
                  ? "±0"
                  : (totals.plusMinus > 0 ? "+" : "") + totals.plusMinus
              }
              hint={`${totals.gp} GP`}
              tint={
                totals.plusMinus > 0
                  ? "emerald"
                  : totals.plusMinus < 0
                    ? "rose"
                    : "neutral"
              }
            />
          </section>

          {/* Shooting + discipline */}
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface-1 p-5">
              <Eyebrow>// Shooting</Eyebrow>
              <dl className="mt-4 space-y-3 text-[12px]">
                <Row label="Shots on goal" value={String(totals.shots)} />
                <Row label="Shot %" value={`${shotPct}%`} />
              </dl>
            </div>
            <div className="rounded-xl border border-border bg-surface-1 p-5">
              <Eyebrow>// Discipline</Eyebrow>
              <dl className="mt-4 space-y-3 text-[12px]">
                <Row label="Penalty minutes" value={String(totals.pim)} />
              </dl>
            </div>
          </section>

          {/* Game log */}
          <section className="rounded-xl border border-border bg-surface-1">
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <Eyebrow>// Game log</Eyebrow>
              <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                {log.length} games
              </span>
            </header>
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Opponent</TH>
                  <TH className="text-right">G</TH>
                  <TH className="text-right">A</TH>
                  <TH className="text-right">PTS</TH>
                  <TH className="text-right">+/−</TH>
                  <TH>Result</TH>
                </TR>
              </THead>
              <TBody>
                {log.slice(0, 30).map((s: StatLine) => {
                  const g = gameById.get(s.gameId);
                  const isHome = g?.homeTeamId === myTeamId;
                  const us = g
                    ? isHome
                      ? g.homeScore
                      : g.awayScore
                    : null;
                  const them = g
                    ? isHome
                      ? g.awayScore
                      : g.homeScore
                    : null;
                  const result =
                    us == null || them == null
                      ? "—"
                      : us > them
                        ? "W"
                        : us < them
                          ? "L"
                          : "T";
                  const tone =
                    result === "W"
                      ? "success"
                      : result === "L"
                        ? "danger"
                        : "neutral";
                  const goals = num(s, "goals");
                  const assists = num(s, "assists");
                  const pm = num(s, "plus_minus");
                  return (
                    <TR key={s.id}>
                      <TD className="text-[12px] text-fg-muted">
                        {g
                          ? fmtDate(g.scheduledStartTsUtc)
                          : fmtDate(s.derivedAt)}
                      </TD>
                      <TD className="font-mono text-[11px] uppercase">
                        {g
                          ? (isHome ? g.awayTeamId : g.homeTeamId).slice(0, 8)
                          : "—"}
                      </TD>
                      <TD className="text-right font-mono tabular-nums">
                        {goals}
                      </TD>
                      <TD className="text-right font-mono tabular-nums">
                        {assists}
                      </TD>
                      <TD className="text-right font-mono tabular-nums font-semibold">
                        {goals + assists}
                      </TD>
                      <TD
                        className={
                          "text-right font-mono tabular-nums " +
                          (pm > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : pm < 0
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-fg-muted")
                        }
                      >
                        {pm === 0 ? "±0" : (pm > 0 ? "+" : "") + pm}
                      </TD>
                      <TD>
                        {result === "—" ? (
                          <span className="text-fg-muted">—</span>
                        ) : (
                          <Badge mono tone={tone}>
                            {result} {us}–{them}
                          </Badge>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tint
}: {
  label: string;
  value: string;
  hint: string;
  tint: "blue" | "violet" | "amber" | "rose" | "emerald" | "cyan" | "neutral";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <Eyebrow>{label}</Eyebrow>
        <IconTile icon={ChartBar} tint={tint} size="sm" />
      </div>
      <p className="mt-5 font-mono text-[24px] font-semibold tabular-nums tracking-tight text-fg">
        {value}
      </p>
      <p className="mt-1 truncate text-[12px] text-fg-muted">{hint}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-mono tabular-nums text-fg">{value}</dd>
    </div>
  );
}
