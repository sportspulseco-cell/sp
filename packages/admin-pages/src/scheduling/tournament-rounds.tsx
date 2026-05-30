"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUp, ChevronsRight, Layers,
  Loader2, RefreshCw, Trophy, XCircle, Zap
} from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Select } from "@sportspulse/ui";
import {
  scheduler,
  type TournamentRoundView,
  type TournamentTier
} from "./scheduler-client";

interface Division { id: string; name: string }
interface Team { id: string; name: string; divisionId: string | null }
interface Props {
  seasonId: string;
  divisions: Division[];
  teams: Team[];
}

const TIER_ORDER: TournamentTier[] = ["upper", "middle", "lower"];

function fmtTs(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
  } catch { return iso ?? "—"; }
}

function tierBadgeTone(t: TournamentTier): "success" | "info" | "neutral" {
  if (t === "upper") return "success";
  if (t === "middle") return "info";
  return "neutral";
}

function roundStateTone(s: string): "success" | "info" | "neutral" {
  if (s === "complete") return "success";
  if (s === "active") return "info";
  return "neutral";
}

/**
 * SchedulingTournament — pain #4 admin surface (dynamic tier mode).
 *
 * Workflow:
 *   1. Init Round 1 — pick a division, assign teams to upper / middle /
 *      lower tiers, system generates round-robin fixtures per tier.
 *   2. Admin enters scores; round completes.
 *   3. Advance — system promotes top of each tier and relegates bottom,
 *      creates Round 2 with new tier assignments + fixtures.
 *   4. Repeat.
 *
 * This is Johnny's ask — Avario has no such concept.
 */
export function SchedulingTournament({ seasonId, divisions, teams }: Props) {
  const [loading, setLoading] = useState(true);
  const [rounds, setRounds] = useState<TournamentRoundView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [initOpen, setInitOpen] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await scheduler.listTournamentRounds({ seasonId });
      setRounds(res.rounds);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [seasonId]);

  const activeRound = rounds.find((r) => r.state === "active");
  const canInit = !activeRound;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {rounds.length} round{rounds.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          {canInit && (
            <Button onClick={() => setInitOpen((o) => !o)}>
              <Layers className="h-4 w-4" strokeWidth={1.75} />
              {initOpen ? "Cancel" : "Start tournament"}
            </Button>
          )}
          <Button variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} strokeWidth={1.75} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-bg p-4 text-sm text-fg-muted">
        <p>
          <span className="text-fg font-medium">Dynamic tournament mode.</span>{" "}
          Each round, teams play a round-robin within their tier. When the
          round is complete, the top quarter of each tier promotes and the
          bottom quarter relegates — automatically generating fixtures for
          the next round. Adjust promote / relegate fractions per round in
          the advance dialog.
        </p>
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

      {initOpen && canInit && (
        <InitRoundForm
          seasonId={seasonId}
          divisions={divisions}
          teams={teams}
          onDone={async () => { setInitOpen(false); await load(); }}
        />
      )}

      {loading && rounds.length === 0 ? (
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
          Loading rounds…
        </div>
      ) : rounds.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No tournament yet"
          description="Click Start tournament to seed Round 1 with initial tier assignments."
        />
      ) : (
        <div className="space-y-4">
          {rounds.map((r) => (
            <RoundCard
              key={r.id}
              round={r}
              isActive={r.id === activeRound?.id}
              onAdvanced={load}
              seasonId={seasonId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InitRoundForm({
  seasonId, divisions, teams, onDone
}: {
  seasonId: string;
  divisions: Division[];
  teams: Team[];
  onDone: () => void | Promise<void>;
}) {
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [perTeamTier, setPerTeamTier] = useState<Record<string, TournamentTier>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = useMemo(
    () => teams.filter((t) => t.divisionId === divisionId),
    [teams, divisionId]
  );

  function tierFor(teamId: string): TournamentTier {
    return perTeamTier[teamId] ?? "middle";
  }

  async function submit() {
    if (!divisionId || eligible.length < 2) return;
    setSubmitting(true); setError(null);
    try {
      await scheduler.initTournamentRound({
        seasonId,
        divisionId,
        roundIndex: 1,
        label: "Round 1",
        startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
        assignments: eligible.map((t) => ({ teamId: t.id, tier: tierFor(t.id) }))
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setSubmitting(false); }
  }

  return (
    <div className="rounded-lg border border-border bg-bg p-5 space-y-4">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Start tournament · Round 1
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          Pick a division, assign each team to upper / middle / lower, and
          set the round time window. The system will generate round-robin
          fixtures within each tier using available ice slots in that
          window.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Division">
          <Select
            value={divisionId}
            onChange={(e) => setDivisionId(e.target.value)}
            disabled={submitting}
          >
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Round starts (optional)">
          <Input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            disabled={submitting}
          />
        </Field>
        <Field label="Round ends (optional)">
          <Input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            disabled={submitting}
          />
        </Field>
      </div>

      {eligible.length === 0 ? (
        <div className="rounded-md border border-border bg-bg-subtle p-3 text-sm text-fg-muted">
          No teams in this division. Add teams via Org Setup first.
        </div>
      ) : (
        <div className="rounded-md border border-border bg-bg-subtle p-3 space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Tier assignment · {eligible.length} teams
          </div>
          {eligible.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3">
              <span className="text-sm text-fg">{t.name}</span>
              <Select
                value={tierFor(t.id)}
                onChange={(e) =>
                  setPerTeamTier((prev) => ({
                    ...prev, [t.id]: e.target.value as TournamentTier
                  }))
                }
                disabled={submitting}
              >
                {TIER_ORDER.map((tier) => (
                  <option key={tier} value={tier}>{tier}</option>
                ))}
              </Select>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="font-mono text-[10px] uppercase tracking-widest text-fg-danger">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          onClick={submit}
          disabled={submitting || !divisionId || eligible.length < 2}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
          ) : (
            <Zap className="h-4 w-4" strokeWidth={1.75} />
          )}
          Generate Round 1
        </Button>
      </div>
    </div>
  );
}

function RoundCard({
  round, isActive, onAdvanced, seasonId
}: {
  round: TournamentRoundView;
  isActive: boolean;
  onAdvanced: () => void | Promise<void>;
  seasonId: string;
}) {
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const allComplete =
    round.fixtureCount > 0 && round.completedCount === round.fixtureCount;
  const byTier: Record<TournamentTier, typeof round.assignments> = {
    upper: [], middle: [], lower: []
  };
  for (const a of round.assignments) byTier[a.tier].push(a);

  return (
    <div className="rounded-lg border border-border bg-bg p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Layers className="h-4 w-4" strokeWidth={1.75} />
          <span className="text-fg font-medium">
            {round.label ?? `Round ${round.roundIndex}`}
          </span>
          <Badge tone={roundStateTone(round.state)}>{round.state}</Badge>
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {round.completedCount}/{round.fixtureCount} games played
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          <span>{fmtTs(round.startsAt)}</span>
          <ArrowRight className="h-3 w-3" strokeWidth={1.75} />
          <span>{fmtTs(round.endsAt)}</span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {TIER_ORDER.map((tier) => (
          <div key={tier} className="rounded-md border border-border bg-bg-subtle p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Badge tone={tierBadgeTone(tier)} mono>{tier}</Badge>
              <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                {byTier[tier].length}
              </span>
            </div>
            {byTier[tier].length === 0 ? (
              <div className="text-sm italic text-fg-muted">no teams</div>
            ) : (
              <ul className="space-y-1">
                {byTier[tier].map((a) => (
                  <li key={a.teamId} className="text-sm text-fg">
                    {a.teamName}
                    {a.reasoning && (
                      <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                        {a.reasoning}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {isActive && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {allComplete
              ? "All games complete — ready to advance to next round."
              : `${round.fixtureCount - round.completedCount} games remaining before advancing.`}
          </span>
          <Button
            onClick={() => setAdvanceOpen((o) => !o)}
            disabled={!allComplete}
          >
            <ChevronsRight className="h-4 w-4" strokeWidth={1.75} />
            {advanceOpen ? "Cancel" : "Advance to next round"}
          </Button>
        </div>
      )}

      {advanceOpen && (
        <AdvancePane
          round={round}
          seasonId={seasonId}
          onDone={async () => { setAdvanceOpen(false); await onAdvanced(); }}
        />
      )}
    </div>
  );
}

function AdvancePane({
  round, seasonId, onDone
}: {
  round: TournamentRoundView;
  seasonId: string;
  onDone: () => void | Promise<void>;
}) {
  const [topFraction, setTopFraction] = useState("0.25");
  const [bottomFraction, setBottomFraction] = useState("0.25");
  const [newStartsAt, setNewStartsAt] = useState("");
  const [newEndsAt, setNewEndsAt] = useState("");
  const [newLabel, setNewLabel] = useState(`Round ${round.roundIndex + 1}`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      await scheduler.advanceTournamentRound({
        seasonId,
        fromRoundId: round.id,
        newLabel: newLabel || undefined,
        newStartsAt: newStartsAt ? new Date(newStartsAt).toISOString() : undefined,
        newEndsAt: newEndsAt ? new Date(newEndsAt).toISOString() : undefined,
        topFraction: Number(topFraction),
        bottomFraction: Number(bottomFraction)
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setSubmitting(false); }
  }

  return (
    <div className="rounded-md border border-border bg-bg-subtle p-4 space-y-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        Advance to Round {round.roundIndex + 1}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Promote fraction (top of tier)">
          <Input
            type="number" step="0.05" min="0" max="1"
            value={topFraction}
            onChange={(e) => setTopFraction(e.target.value)}
            disabled={submitting}
          />
        </Field>
        <Field label="Relegate fraction (bottom of tier)">
          <Input
            type="number" step="0.05" min="0" max="1"
            value={bottomFraction}
            onChange={(e) => setBottomFraction(e.target.value)}
            disabled={submitting}
          />
        </Field>
        <Field label="Next round label">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            disabled={submitting}
          />
        </Field>
        <div />
        <Field label="Next round starts (optional)">
          <Input
            type="datetime-local"
            value={newStartsAt}
            onChange={(e) => setNewStartsAt(e.target.value)}
            disabled={submitting}
          />
        </Field>
        <Field label="Next round ends (optional)">
          <Input
            type="datetime-local"
            value={newEndsAt}
            onChange={(e) => setNewEndsAt(e.target.value)}
            disabled={submitting}
          />
        </Field>
      </div>
      <div className="flex items-center gap-2 text-sm text-fg-muted">
        <ArrowUp className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.75} />
        <span>Top {(Number(topFraction) * 100).toFixed(0)}% promotes</span>
        <ArrowDown className="h-3.5 w-3.5 text-rose-500" strokeWidth={1.75} />
        <span>Bottom {(Number(bottomFraction) * 100).toFixed(0)}% relegates</span>
      </div>
      {error && (
        <div className="font-mono text-[10px] uppercase tracking-widest text-fg-danger">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button onClick={submit} disabled={submitting}>
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
          ) : (
            <ChevronsRight className="h-4 w-4" strokeWidth={1.75} />
          )}
          Advance
        </Button>
      </div>
    </div>
  );
}
