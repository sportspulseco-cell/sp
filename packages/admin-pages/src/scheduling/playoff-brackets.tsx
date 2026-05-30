"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronRight, Loader2, RefreshCw,
  Trophy, XCircle, Zap
} from "lucide-react";
import {
  Badge, Button, EmptyState, Field, Select
} from "@sportspulse/ui";
import {
  scheduler,
  type BracketView,
  type BracketSlotView
} from "./scheduler-client";

interface Division { id: string; name: string }
interface Props { seasonId: string; divisions: Division[] }

function fmtTs(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
  } catch { return iso ?? "—"; }
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
export function SchedulingPlayoffBrackets({ seasonId, divisions }: Props) {
  const [loading, setLoading] = useState(true);
  const [brackets, setBrackets] = useState<BracketView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genDivision, setGenDivision] = useState<string>(divisions[0]?.id ?? "");
  const [genTopN, setGenTopN] = useState<"4" | "8" | "16">("8");

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
        topN: Number(genTopN) as 4 | 8 | 16
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
              Reads standings, seeds the top N teams, assigns Round 1 into
              your <code>is_playoff_reservation=true</code> ice slots, and
              creates the games. Round 2+ games are created automatically as
              winners are entered.
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
            <Field label="Top N (must be power of 2)">
              <Select
                value={genTopN}
                onChange={(e) => setGenTopN(e.target.value as "4" | "8" | "16")}
                disabled={generating}
              >
                <option value="4">Top 4</option>
                <option value="8">Top 8</option>
                <option value="16">Top 16</option>
              </Select>
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
                Generate
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
            <BracketCard key={b.id} bracket={b} onAdvanced={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function BracketCard({
  bracket,
  onAdvanced
}: { bracket: BracketView; onAdvanced: () => void }) {
  const roundLabels = roundLabelFn(bracket.totalRounds);
  return (
    <div className="rounded-lg border border-border bg-bg p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Trophy className="h-4 w-4" strokeWidth={1.75} />
          <span className="text-fg font-medium">{bracket.divisionName ?? "—"}</span>
          <Badge tone={bracketStateTone(bracket.state)}>{bracket.state}</Badge>
          <Badge tone="neutral" mono>Top {bracket.topN}</Badge>
        </div>
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
  onAdvanced
}: {
  bracketId: string;
  slot: BracketSlotView;
  onAdvanced: () => void;
}) {
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const aIsWinner = slot.winnerTeamId === slot.teamAId;
  const bIsWinner = slot.winnerTeamId === slot.teamBId;
  const canAdvance =
    slot.gameId &&
    slot.gameStatus === "completed" &&
    !slot.winnerTeamId &&
    slot.teamAId &&
    slot.teamBId;

  async function advance(winnerTeamId: string) {
    if (!slot.gameId) return;
    setAdvancing(winnerTeamId); setError(null);
    try {
      await scheduler.advanceBracket({
        bracketId, gameId: slot.gameId, winnerTeamId
      });
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
        label={slot.teamBName ?? "TBD"}
        seed={slot.seedB}
        isWinner={bIsWinner}
        score={slot.awayScore}
      />
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {slot.venueName} · {slot.surfaceLabel}
        </span>
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
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Advance winner:
          </span>
          <Button
            variant="secondary"
            onClick={() => advance(slot.teamAId!)}
            disabled={advancing !== null}
          >
            {advancing === slot.teamAId ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            {slot.teamAName}
          </Button>
          <Button
            variant="secondary"
            onClick={() => advance(slot.teamBId!)}
            disabled={advancing !== null}
          >
            {advancing === slot.teamBId ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            {slot.teamBName}
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
