"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { stats } from "@/lib/api/browser-api";
import type { Leaderboard } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Eyebrow } from "@/components/ui/eyebrow";

interface LeagueLite {
  id: string;
  name: string;
  sportCode: string;
}
interface DivisionLite {
  id: string;
  name: string;
  /** Post-flip — divisions live under seasons. */
  seasonId: string;
}

const METRICS: Record<string, string[]> = {
  HOCKEY_ICE: ["goals", "assists", "points", "saves", "penalty_minutes"],
  SOCCER: ["goals", "assists", "points", "saves"],
  BASKETBALL: ["points", "rebounds", "assists", "steals", "blocks"],
  BASEBALL: ["hits", "runs", "rbi", "home_runs"],
  CRICKET: ["runs", "wickets", "boundaries"],
  __default: ["goals", "assists", "points"]
};

export function BuildLeaderboardForm({
  leagues,
  divisions,
  teamMap
}: {
  leagues: LeagueLite[];
  divisions: DivisionLite[];
  teamMap: [string, string][];
}) {
  const teamLookup = useMemo(() => new Map(teamMap), [teamMap]);

  const [form, setForm] = useState({
    scopeType: "league" as "platform" | "org" | "league" | "division",
    leagueId: leagues[0]?.id ?? "",
    divisionId: "",
    sportCode: leagues[0]?.sportCode ?? "HOCKEY_ICE",
    metric: "goals",
    windowKind: "season" as "season" | "last_n" | "all_time",
    topN: 10
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Leaderboard | null>(null);

  // Post-flip: divisions belong to seasons, seasons belong to leagues.
  // We don't have a season filter here yet — show all divisions and
  // let the admin pick. (League-scoped narrowing will come back when
  // the leaderboard form learns about seasons.)
  const eligibleDivisions = divisions;

  const metricOptions = METRICS[form.sportCode] ?? METRICS.__default!;

  function onLeagueChange(leagueId: string) {
    const league = leagues.find((l) => l.id === leagueId);
    if (!league) return;
    const nextMetric =
      METRICS[league.sportCode]?.[0] ?? METRICS.__default![0]!;
    setForm((f) => ({
      ...f,
      leagueId,
      sportCode: league.sportCode,
      divisionId: "",
      metric: nextMetric
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body = await stats.buildLeaderboard({
        scopeType: form.scopeType,
        scopeId:
          form.scopeType === "division"
            ? form.divisionId
            : form.scopeType === "league"
              ? form.leagueId
              : null,
        metric: form.metric,
        windowKind: form.windowKind,
        sportCode: form.sportCode,
        topN: Number(form.topN),
        leagueId: form.leagueId || undefined,
        divisionId: form.divisionId || undefined
      });
      setResult(body);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-xl border border-border bg-surface-1 p-5"
      >
        <Eyebrow>Build leaderboard</Eyebrow>
        <Field label="Scope" htmlFor="scopeType">
          <Select
            id="scopeType"
            value={form.scopeType}
            onChange={(e) =>
              setForm({ ...form, scopeType: e.target.value as typeof form.scopeType })
            }
          >
            <option value="platform">Platform</option>
            <option value="league">League</option>
            <option value="division">Division</option>
          </Select>
        </Field>
        <Field label="League" htmlFor="leagueId">
          <Select
            id="leagueId"
            value={form.leagueId}
            onChange={(e) => onLeagueChange(e.target.value)}
          >
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {l.sportCode}
              </option>
            ))}
          </Select>
        </Field>
        {form.scopeType === "division" && eligibleDivisions.length > 0 ? (
          <Field label="Division" htmlFor="divisionId">
            <Select
              id="divisionId"
              required
              value={form.divisionId}
              onChange={(e) => setForm({ ...form, divisionId: e.target.value })}
            >
              <option value="">Select division</option>
              {eligibleDivisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Metric" htmlFor="metric">
          <Select
            id="metric"
            value={form.metric}
            onChange={(e) => setForm({ ...form, metric: e.target.value })}
          >
            {metricOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Window" htmlFor="windowKind">
            <Select
              id="windowKind"
              value={form.windowKind}
              onChange={(e) =>
                setForm({
                  ...form,
                  windowKind: e.target.value as typeof form.windowKind
                })
              }
            >
              <option value="season">Season</option>
              <option value="last_n">Last N</option>
              <option value="all_time">All time</option>
            </Select>
          </Field>
          <Field label="Top N" htmlFor="topN">
            <Input
              id="topN"
              type="number"
              min={1}
              max={100}
              value={form.topN}
              onChange={(e) => setForm({ ...form, topN: Number(e.target.value) })}
            />
          </Field>
        </div>
        {error ? (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Ranking…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" /> Build
            </>
          )}
        </Button>
      </form>

      <div className="rounded-xl border border-border bg-surface-1">
        {result ? (
          <ResultPanel result={result} teamLookup={teamLookup} />
        ) : (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <Sparkles
              className="h-5 w-5 text-[var(--tint-violet-fg)]"
              strokeWidth={1.5}
            />
            <p className="text-sm font-medium text-fg">No leaderboard yet</p>
            <p className="max-w-sm text-sm text-fg-muted">
              Pick a scope and metric, then build to rank players from
              projected stat lines.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultPanel({
  result,
  teamLookup
}: {
  result: Leaderboard;
  teamLookup: Map<string, string>;
}) {
  return (
    <div className="divide-y divide-border">
      <header className="flex items-center justify-between px-6 py-4">
        <div>
          <Eyebrow>{result.metric}</Eyebrow>
          <p className="mt-1 text-[13px] text-fg-muted">
            {result.scopeType} · {result.windowKind} · {result.sportCode} · top{" "}
            {result.entries.length}
          </p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
          {new Date(result.rankedAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
          })}
        </span>
      </header>
      {result.entries.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-fg-muted">
          No entries — no stat lines match this scope/metric yet.
        </p>
      ) : (
        <ol className="divide-y divide-border">
          {result.entries.map((e) => (
            <li
              key={`${e.personId}-${e.rank}`}
              className="flex items-center gap-4 px-6 py-3"
            >
              <span className="w-8 font-mono text-[12px] text-fg-muted">
                #{e.rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[12px] text-fg">
                  {e.personId.slice(0, 8)}
                </p>
                <p className="text-[11px] text-fg-muted">
                  {teamLookup.get(e.teamId) ?? e.teamId.slice(0, 8)}
                </p>
              </div>
              <span className="font-mono text-[16px] font-semibold tabular-nums text-fg">
                {e.value}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
