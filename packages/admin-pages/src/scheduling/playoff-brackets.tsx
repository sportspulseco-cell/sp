"use client";

import Link from "next/link";
import { useSlotTime } from "./time-zone";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronRight, Loader2, RefreshCw,
  Trophy, XCircle, Zap
} from "lucide-react";
import {
  Badge, Button, EmptyState, Field, Input, Select
} from "@sportspulse/ui";
import {
  scheduler,
  type BracketView,
  type BracketSlotView
} from "./scheduler-client";

interface Division { id: string; name: string }
interface Props {
  seasonId: string;
  divisions: Division[];
  /**
   * Publish the bracket's games to team schedules through the API (each
   * app binds its SDK: gameOps.publishSchedule with gameType "playoff").
   */
  publishPlayoffGames?: (req: { seasonId: string; divisionId: string }) => Promise<{ gamesPublished: number; notificationsQueued?: number }>;
  /**
   * Link to a game's page in this console. Required, so no console ships
   * a bracket whose games cannot be opened (the org admin's did).
   */
  gameHref: (gameId: string) => string;
}


function bracketStateTone(s: string): "success" | "info" | "neutral" {
  if (s === "complete") return "success";
  if (s === "active") return "info";
  return "neutral";
}

/**
 * SchedulingPlayoffBrackets — pain #3 admin surface.
 *
 *   - Lists every bracket for the season (one per division typically)
 *   - "Generate bracket" form for divisions that don't have one yet
 *   - Per bracket: round-by-round table with seeds, team names, scores,
 *     winner markers, and an inline "Advance winner" action on
 *     completed games
 */
export function SchedulingPlayoffBrackets({ seasonId, divisions, publishPlayoffGames, gameHref }: Props) {
  const [loading, setLoading] = useState(true);
  const [brackets, setBrackets] = useState<BracketView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genDivision, setGenDivision] = useState<string>(divisions[0]?.id ?? "");
  const [genTeams, setGenTeams] = useState("");

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await scheduler.listBrackets({ seasonId });
      setBrackets(res.brackets);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [seasonId]);

  async function onGenerate() {
    if (!genDivision) return;
    setGenerating(true); setError(null);
    try {
      await scheduler.generateBracket({
        seasonId,
        divisionId: genDivision,
        teamCount: genTeams ? Number(genTeams) : undefined
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setGenerating(false); }
  }

  const divisionsWithoutBracket = divisions.filter(
    (d) => !brackets.some((b) => b.divisionId === d.id && b.state !== "archived")
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {brackets.length} bracket{brackets.length === 1 ? "" : "s"}
        </span>
        <Button variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} strokeWidth={1.75} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-border bg-bg p-4 text-sm">
          <div className="mb-1 flex items-center gap-2 text-fg">
            <XCircle className="h-4 w-4" strokeWidth={1.75} />
            <span className="font-mono text-[10px] uppercase tracking-widest">Error</span>
          </div>
          <p className="text-fg-muted">{error}</p>
        </div>
      )}

      {divisionsWithoutBracket.length > 0 && (
        <div className="rounded-lg border border-border bg-bg p-5 space-y-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              Generate new bracket
            </div>
            <p className="mt-1 text-sm text-fg-muted">
              Seeds teams by the division standings, gives the top seeds a bye
              when the count is not 4, 8 or 16, and places each game on playoff
              ice. Later rounds are created as winners go through. Games stay
              drafts until you publish them.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Division">
              <Select
                value={genDivision}
                onChange={(e) => setGenDivision(e.target.value)}
                disabled={generating}
              >
                {divisionsWithoutBracket.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Teams in the bracket" hint="Leave blank for every team in the division">
              <Input
                type="number"
                min={2}
                value={genTeams}
                placeholder="All teams"
                onChange={(e) => setGenTeams(e.target.value)}
                disabled={generating}
              />
            </Field>
            <div className="flex items-end">
              <Button
                onClick={onGenerate}
                disabled={generating || !genDivision}
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                ) : (
                  <Zap className="h-4 w-4" strokeWidth={1.75} />
                )}
                Generate bracket
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading && brackets.length === 0 ? (
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
          Loading brackets…
        </div>
      ) : brackets.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No brackets yet"
          description="Once the regular season ends, generate a bracket above to seed the playoffs."
        />
      ) : (
        <div className="space-y-6">
          {brackets.map((b) => (
            <BracketCard
              key={b.id}
              bracket={b}
              seasonId={seasonId}
              onAdvanced={load}
              publish={publishPlayoffGames}
              gameHref={gameHref}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BracketCard({
  bracket,
  seasonId,
  onAdvanced,
  publish,
  gameHref
}: {
  bracket: BracketView;
  seasonId: string;
  onAdvanced: () => void;
  publish?: Props["publishPlayoffGames"];
  gameHref?: (gameId: string) => string;
}) {
  const roundLabels = roundLabelFn(bracket.totalRounds);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<string | null>(null);
  const [pubError, setPubError] = useState<string | null>(null);
  const unpublished = bracket.slots.filter((s) => s.gameId && s.published === false).length;
  async function onPublish() {
    if (!publish || !bracket.divisionId) return;
    setPublishing(true); setPubError(null); setPublished(null);
    try {
      const r = await publish({ seasonId, divisionId: bracket.divisionId });
      setPublished(
        r.gamesPublished === 0
          ? "Nothing left to publish."
          : `${r.gamesPublished} playoff ${r.gamesPublished === 1 ? "game" : "games"} published to team schedules.`
      );
      onAdvanced();
    } catch (err) {
      setPubError(err instanceof Error ? err.message : String(err));
    } finally { setPublishing(false); }
  }
  return (
    <div className="rounded-lg border border-border bg-bg p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Trophy className="h-4 w-4" strokeWidth={1.75} />
          <span className="text-fg font-medium">{bracket.divisionName ?? "—"}</span>
          <Badge tone={bracketStateTone(bracket.state)}>{bracket.state}</Badge>
          <Badge tone="neutral" mono>{bracket.topN} teams</Badge>
        </div>
        {publish && unpublished > 0 ? (
          <Button onClick={onPublish} disabled={publishing}>
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />}
            Publish {unpublished} playoff {unpublished === 1 ? "game" : "games"}
          </Button>
        ) : null}
        {bracket.championTeamName && (
          <span className="flex items-center gap-1.5 text-fg">
            <Trophy className="h-4 w-4 text-amber-500" strokeWidth={1.75} />
            <span className="font-medium">{bracket.championTeamName}</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              champion
            </span>
          </span>
        )}
      </div>

      {published ? <p className="text-sm text-fg">{published}</p> : null}
      {pubError ? <p className="text-sm text-fg-danger" role="alert">{pubError}</p> : null}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: bracket.totalRounds }, (_, i) => i + 1).map(
          (round) => {
            const slotsInRound = bracket.slots.filter((s) => s.round === round);
            return (
              <div key={round} className="space-y-2">
                <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                  {roundLabels(round)}
                </div>
                <div className="space-y-2">
                  {slotsInRound.map((s) => (
                    <SlotCard
                      key={`${round}-${s.position}`}
                      bracketId={bracket.id}
                      slot={s}
                      onAdvanced={onAdvanced}
                      gameHref={gameHref}
                    />
                  ))}
                </div>
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}

function roundLabelFn(totalRounds: number) {
  return (round: number): string => {
    const fromLast = totalRounds - round;
    if (fromLast === 0) return "Final";
    if (fromLast === 1) return "Semifinals";
    if (fromLast === 2) return "Quarterfinals";
    return `Round ${round}`;
  };
}

function SlotCard({
  bracketId,
  slot,
  onAdvanced,
  gameHref
}: {
  bracketId: string;
  slot: BracketSlotView;
  onAdvanced: () => void;
  gameHref?: (gameId: string) => string;
}) {
  // The rink's clock with its zone: "Nov 4, 9:00 PM EST" (SCH-28).
  const fmtTs = useSlotTime({ withZone: true });
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const aIsWinner = slot.winnerTeamId === slot.teamAId;
  const bIsWinner = slot.winnerTeamId === slot.teamBId;
  // The server takes the winner from the final score.
  const canAdvance =
    slot.gameId &&
    (slot.gameStatus === "completed" || slot.gameStatus === "forfeited") &&
    !slot.winnerTeamId &&
    slot.teamAId &&
    slot.teamBId;

  async function advance(key: string) {
    if (!slot.gameId) return;
    setAdvancing(key); setError(null);
    try {
      await scheduler.advanceBracket({ bracketId, gameId: slot.gameId });
      onAdvanced();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setAdvancing(null); }
  }

  return (
    <div className="rounded-md border border-border bg-bg-subtle p-3 space-y-2">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        <span>
          {slot.seedA && slot.seedB
            ? `${slot.seedA} vs ${slot.seedB}`
            : `Slot ${slot.position + 1}`}
        </span>
        <span>{fmtTs(slot.startTsUtc)}</span>
      </div>
      <TeamLine
        label={slot.teamAName ?? "TBD"}
        seed={slot.seedA}
        isWinner={aIsWinner}
        score={slot.homeScore}
      />
      <TeamLine
        label={slot.bye ? "Bye" : slot.teamBName ?? "TBD"}
        seed={slot.seedB}
        isWinner={bIsWinner}
        score={slot.awayScore}
      />
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {slot.bye ? "Goes through without a game" : `${slot.venueName ?? "Rink"} · ${slot.surfaceLabel ?? ""}`}
        </span>
        {slot.gameId && gameHref ? (
          <Link href={gameHref(slot.gameId)} className="text-[12px] font-medium text-fg underline-offset-2 hover:underline">
            Open game{slot.published === false ? " (draft)" : ""}
          </Link>
        ) : null}
        {slot.gameStatus && (
          <Badge tone={
            slot.gameStatus === "completed" ? "success"
              : slot.gameStatus === "in_play" ? "info"
                : "neutral"
          }>
            {slot.gameStatus.replace(/_/g, " ")}
          </Badge>
        )}
      </div>
      {canAdvance && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <Button
            variant="secondary"
            onClick={() => advance("go")}
            disabled={advancing !== null}
          >
            {advancing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            Send the winner through
          </Button>
        </div>
      )}
      {error && (
        <div className="font-mono text-[10px] uppercase tracking-widest text-fg-danger">
          {error}
        </div>
      )}
    </div>
  );
}

function TeamLine({
  label, seed, isWinner, score
}: {
  label: string;
  seed: number | null;
  isWinner: boolean;
  score: number | null;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 ${isWinner ? "text-fg font-medium" : "text-fg-muted"}`}>
      <span className="flex items-center gap-2">
        {seed !== null && (
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded bg-bg px-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {seed}
          </span>
        )}
        <span className={isWinner ? "" : "italic"}>{label}</span>
        {isWinner && (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.75} />
        )}
      </span>
      <span className="font-mono text-[12px] tabular-nums">
        {score ?? "—"}
      </span>
    </div>
  );
}
