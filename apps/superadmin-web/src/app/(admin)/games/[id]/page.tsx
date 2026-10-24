import { fetchAll, load } from "@sportspulse/api-client";
import { ArrowLeft, BarChart3 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LoadError } from "@sportspulse/ui";
import {
  GAME_ENDING_LABELS,
  HOCKEY_INFRACTION_LABELS
} from "@sportspulse/kernel";
import { gameOps, iam, leagueMgmt, stats } from "@/lib/api/server-api";
import { GameOfficialsPanel } from "@/components/games/officials-panel";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { GameStatusBadge } from "@/components/games/game-status-badge";
import { GameActions } from "@/components/games/game-actions";
import { AppendEventButton } from "@/components/games/append-event-button";

export const metadata = { title: "Game — SportsPulse" };

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function fmtClock(sec: number | null) {
  if (sec === null || sec === undefined) return null;
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default async function GameDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const gameResult = await load(gameOps.getGame(id));
  if (!gameResult.ok) {
    if (gameResult.status === 404) notFound();
    return (
      <LoadError
        what="this game"
        status={gameResult.status}
        message={gameResult.message}
        action={
          <Link
            href="/games"
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

  const [events, statLines, teamsPage, leaguesPage, officials, personsPage, division] = await Promise.all([
    gameOps.eventsForGame(id).catch(() => []),
    stats.linesForGame(id).catch(() => []),
    fetchAll((cursor) => leagueMgmt.listTeams({ limit: 100, cursor })).catch(() => ({ items: [], nextCursor: null })),
    fetchAll((cursor) => leagueMgmt.listLeagues({ limit: 100, cursor })).catch(() => ({ items: [], nextCursor: null })),
    gameOps.listOfficials(id).catch(() => []),
    fetchAll((cursor) => iam.listPersons({ limit: 100, cursor })).catch(() => ({ items: [], nextCursor: null })),
    game.divisionId ? leagueMgmt.getDivision(game.divisionId).catch(() => null) : Promise.resolve(null)
  ]);
  const can = (p: string) => (game.viewerPermissions ?? []).includes(p);
  const leagueOrgId = leaguesPage.items.find((l) => l.id === game.leagueId)?.orgId ?? null;
  // Regulation length from the division's game rules (org setup), else 3.
  const gameRules = (division?.ruleSetOverrides as { gameRules?: { numberOfPeriods?: unknown } } | undefined)
    ?.gameRules;
  const regulationPeriods =
    typeof gameRules?.numberOfPeriods === "number" && gameRules.numberOfPeriods > 0
      ? gameRules.numberOfPeriods
      : 3;
  const lastMove = game.reschedules?.length ? game.reschedules[game.reschedules.length - 1] : null;

  const teamMap = new Map(
    teamsPage.items.map((t) => [t.id, t.shortName ?? t.name])
  );
  const teamFullMap = new Map(teamsPage.items.map((t) => [t.id, t.name]));
  const leagueMap = new Map(leaguesPage.items.map((l) => [l.id, l.name]));
  const personMap = new Map(
    personsPage.items.map((p) => [
      p.id,
      p.preferredName ?? `${p.legalFirstName} ${p.legalLastName}`
    ])
  );

  const homeName = teamFullMap.get(game.homeTeamId) ?? "Home";
  const awayName = teamFullMap.get(game.awayTeamId) ?? "Away";
  const homeShort = teamMap.get(game.homeTeamId) ?? homeName;
  const awayShort = teamMap.get(game.awayTeamId) ?? awayName;

  const showScore =
    game.status === "in_play" ||
    game.status === "completed" ||
    game.status === "forfeited";

  return (
    <div className="space-y-8">
      <Link
        href="/games"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All games
      </Link>

      {/* Scoreboard */}
      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <div className="space-y-1">
            <Eyebrow>{leagueMap.get(game.leagueId) ?? game.sportCode}</Eyebrow>
            <p className="text-[13px] text-fg-muted">
              {fmtTime(game.scheduledStartTsUtc)} ·{" "}
              <span className="font-mono text-[11px]">{game.tz}</span>
              {game.venueName ? ` · ${game.venueName}` : ""}
              {game.surfaceLabel ? ` · ${game.surfaceLabel}` : ""}
            </p>
            {lastMove ? (
              <p className="text-[12px] text-fg-muted">
                Moved from {fmtTime(lastMove.from.startTsUtc)}
                {lastMove.from.venueName ? ` at ${lastMove.from.venueName}` : ""}
                {lastMove.reason ? `. Reason: ${lastMove.reason}` : ""}
                {lastMove.overriddenConflicts.length ? ". Clash overridden." : ""}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {!game.publishedAt && game.status !== "cancelled" ? (
              <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Draft
              </span>
            ) : null}
            <GameStatusBadge status={game.status} />
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 px-6 py-8 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <TeamCell name={awayName} subtitle="Away" />
          <div className="flex items-center justify-center gap-4 font-mono text-[44px] font-semibold tabular-nums tracking-tight text-fg">
            {showScore ? (
              <>
                <span>{game.awayScore}</span>
                <span className="text-fg-muted">–</span>
                <span>{game.homeScore}</span>
              </>
            ) : (
              <span className="font-sans text-base font-medium uppercase tracking-[0.08em] text-fg-muted">
                vs
              </span>
            )}
          </div>
          <TeamCell name={homeName} subtitle="Home" align="end" />
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

      {/* Action panel */}
      <section className="rounded-xl border border-border bg-surface-1 p-6">
        <Eyebrow>Actions</Eyebrow>
        <div className="mt-5">
          <GameActions
            game={game}
            homeName={homeName}
            awayName={awayName}
            orgId={leagueOrgId}
            regulationPeriods={regulationPeriods}
          />
        </div>
      </section>

      {/* Officials */}
      <GameOfficialsPanel
        gameId={game.id}
        officials={officials}
        persons={personsPage.items}
        personMap={Array.from(personMap.entries())}
        canEdit={can("game.assign_officials")}
      />

      {/* Event log + stat lines */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-1 lg:col-span-2">
          <header className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <Eyebrow>Event log</Eyebrow>
              <p className="mt-1 text-[13px] text-fg-muted">
                Append-only · {events.length}{" "}
                {events.length === 1 ? "entry" : "entries"}
              </p>
            </div>
            {game.status === "in_play" && can("game_event.write") ? (
              <AppendEventButton
                gameId={game.id}
                sportCode={game.sportCode}
                seasonId={game.seasonId}
                homeTeam={{ id: game.homeTeamId, label: homeShort }}
                awayTeam={{ id: game.awayTeamId, label: awayShort }}
              />
            ) : null}
          </header>

          {events.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-fg-muted">
              No events yet. Start play and log goals, assists, penalties.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((e) => {
                const teamLabel = e.teamId ? teamMap.get(e.teamId) : null;
                const clock = fmtClock(e.clockRemainingSec);
                return (
                  <li
                    key={e.id}
                    className="flex items-start gap-4 px-6 py-3.5"
                  >
                    <div className="w-16 shrink-0 font-mono text-[11px] text-fg-muted">
                      {e.period ? `P${e.period}` : "—"}
                      {clock ? <span className="ml-1.5">{clock}</span> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-fg">
                        {e.eventType.replace(/_/g, " ")}
                        {teamLabel ? (
                          <span className="ml-2 text-fg-muted">
                            · {teamLabel}
                          </span>
                        ) : null}
                      </p>
                      {e.primaryPersonId ? (
                        <p className="mt-0.5 text-[12px] text-fg-muted">
                          {personMap.get(e.primaryPersonId) ?? "Unknown player"}
                          {e.secondaryPersonIds?.length
                            ? ` · Assists: ${e.secondaryPersonIds
                                .map((pid) => personMap.get(pid) ?? "Unknown player")
                                .join(", ")}`
                            : ""}
                        </p>
                      ) : null}
                      {e.eventType === "penalty" &&
                      typeof e.attributes?.minutes === "number" ? (
                        <p className="mt-0.5 text-[12px] text-fg-muted">
                          {HOCKEY_INFRACTION_LABELS[String(e.attributes.infraction)] ?? "Penalty"},{" "}
                          {e.attributes.minutes} min
                        </p>
                      ) : null}
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                      {fmtTime(e.tsUtc)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface-1">
          <header className="flex items-center gap-2 border-b border-border px-6 py-4">
            <BarChart3
              className="h-4 w-4 text-[var(--tint-violet-fg)]"
              strokeWidth={1.75}
            />
            <div>
              <Eyebrow>Stat lines</Eyebrow>
              <p className="mt-0.5 text-[13px] text-fg-muted">
                Projected from events
              </p>
            </div>
          </header>
          {statLines.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-fg-muted">
              {game.status === "completed"
                ? "No player stat lines. No event in the log names a player."
                : "Player stats are built when the game is finalized."}
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Player</TH>
                  <TH>Team</TH>
                  <TH className="text-right">Core</TH>
                </TR>
              </THead>
              <TBody>
                {statLines.map((l) => (
                  <TR key={l.id}>
                    <TD className="text-fg">
                      {l.personName ?? personMap.get(l.personId) ?? "Unknown player"}
                    </TD>
                    <TD className="text-fg-muted">
                      {teamMap.get(l.teamId) ?? l.teamName ?? "Unnamed team"}
                    </TD>
                    <TD className="text-right">
                      <CoreSummary core={l.core} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}

function TeamCell({
  name,
  subtitle,
  align = "start"
}: {
  name: string;
  subtitle: string;
  align?: "start" | "end";
}) {
  return (
    <div
      className={
        align === "end"
          ? "text-right"
          : "text-left"
      }
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-muted">
        {subtitle}
      </p>
      <p className="mt-1 text-[20px] font-semibold tracking-tight text-fg">
        {name}
      </p>
    </div>
  );
}

function CoreSummary({ core }: { core: Record<string, number> }) {
  const entries = Object.entries(core).filter(([, v]) => Number(v) > 0);
  if (entries.length === 0)
    return <span className="text-fg-muted">—</span>;
  return (
    <span className="inline-flex flex-wrap justify-end gap-1.5 font-mono text-[11px] text-fg">
      {entries.map(([k, v]) => (
        <span
          key={k}
          className="rounded border border-border bg-surface-2 px-1.5 py-px"
        >
          <span className="text-fg-muted">{k}</span>{" "}
          <span className="text-fg">{v}</span>
        </span>
      ))}
    </span>
  );
}
