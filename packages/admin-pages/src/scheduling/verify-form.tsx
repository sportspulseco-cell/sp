"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, GripVertical, Info,
  Loader2, PlayCircle, RotateCcw, XCircle
} from "lucide-react";
import {
  Badge, Button, EmptyState, Field, Select,
  TBody, TD, TH, THead, TR, Table
} from "@sportspulse/ui";
import {
  scheduler, type RankedTeamRow, type TiebreakerRule, type VerifyResponse
} from "./scheduler-client";

interface Division { id: string; name: string }
interface Props { seasonId: string; divisions: Division[] }

const ALL_DIVISIONS = "__all__";

const DEFAULT_RULES: TiebreakerRule[] = [
  "head_to_head", "wins", "goal_diff", "goals_for",
  "away_goals", "home_goals", "goals_against"
];

const RULE_LABELS: Record<TiebreakerRule, string> = {
  head_to_head: "Head-to-head",
  wins: "Wins",
  goal_diff: "Goal differential",
  goals_for: "Goals for",
  away_goals: "Away goals",
  home_goals: "Home goals",
  goals_against: "Goals against (fewer wins)"
};

interface RuleState { rule: TiebreakerRule; enabled: boolean }

function defaultRuleState(): RuleState[] {
  return DEFAULT_RULES.map((rule) => ({ rule, enabled: true }));
}

export function SchedulingVerifyForm({ seasonId, divisions }: Props) {
  const [divisionId, setDivisionId] = useState<string>(ALL_DIVISIONS);
  const [rules, setRules] = useState<RuleState[]>(defaultRuleState);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeRuleset = useMemo(
    () => rules.filter((r) => r.enabled).map((r) => r.rule),
    [rules]
  );

  function move(index: number, delta: -1 | 1) {
    setRules((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }
  function toggle(index: number) {
    setRules((prev) => prev.map((r, i) => i === index ? { ...r, enabled: !r.enabled } : r));
  }
  function reset() { setRules(defaultRuleState()); }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setResult(null); setSubmitting(true);
    try {
      const res = await scheduler.verify({
        seasonId,
        divisionId: divisionId === ALL_DIVISIONS ? undefined : divisionId,
        ruleset: activeRuleset
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="rounded-lg border border-border bg-bg p-6 space-y-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Division" hint="Leave on All for season-wide verify">
            <Select value={divisionId} onChange={(e) => setDivisionId(e.target.value)} disabled={submitting}>
              <option value={ALL_DIVISIONS}>All divisions</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <div className="flex items-end justify-end gap-2">
            <Button type="button" variant="secondary" onClick={reset} disabled={submitting}>
              <RotateCcw className="h-4 w-4" strokeWidth={1.75} />Reset
            </Button>
            <Button type="submit" disabled={submitting || activeRuleset.length === 0}>
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />Verifying…</>
              ) : (
                <><PlayCircle className="h-4 w-4" strokeWidth={1.75} />Verify</>
              )}
            </Button>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              Ruleset (top = highest priority)
            </div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              {activeRuleset.length} active · {rules.length - activeRuleset.length} off
            </div>
          </div>
          <ul className="space-y-1.5">
            {rules.map((r, i) => (
              <li key={r.rule}
                className={`flex items-center gap-2 rounded-md border p-2 ${
                  r.enabled ? "border-border bg-bg" : "border-border bg-bg-subtle opacity-60"
                }`}>
                <GripVertical className="h-4 w-4 text-fg-muted" strokeWidth={1.75} aria-hidden />
                <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">{i + 1}.</span>
                <input type="checkbox" checked={r.enabled} onChange={() => toggle(i)}
                  disabled={submitting} aria-label={`Enable ${RULE_LABELS[r.rule]}`}
                  className="cursor-pointer" />
                <span className="flex-1 text-fg">{RULE_LABELS[r.rule]}</span>
                <button type="button" onClick={() => move(i, -1)} disabled={submitting || i === 0}
                  aria-label="Move up"
                  className="rounded p-1 hover:bg-bg-subtle disabled:opacity-30">
                  <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={submitting || i === rules.length - 1}
                  aria-label="Move down"
                  className="rounded p-1 hover:bg-bg-subtle disabled:opacity-30">
                  <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </form>

      {error && (
        <div className="rounded-lg border border-border bg-bg p-5 text-sm">
          <div className="mb-2 flex items-center gap-2 text-fg">
            <XCircle className="h-4 w-4" strokeWidth={1.75} />
            <span className="font-mono text-[10px] uppercase tracking-widest">Verify failed</span>
          </div>
          <p className="text-fg-muted">{error}</p>
        </div>
      )}

      {result && <VerifyResult result={result} />}
    </div>
  );
}

function VerifyResult({ result }: { result: VerifyResponse }) {
  const ambiguousTeamIds = useMemo(() => {
    const s = new Set<string>();
    for (const g of result.ambiguities) for (const id of g.teamIds) s.add(id);
    return s;
  }, [result.ambiguities]);

  if (result.teamCount === 0) {
    return (
      <EmptyState icon={Info}
        title="No standings to verify against"
        description="The standings table is empty for this scope. Finalise some games (or recompute standings) before running verify." />
    );
  }

  const ambiguousCount = result.ambiguities.reduce((acc, g) => acc + g.teamIds.length, 0);

  return (
    <div className="rounded-lg border border-border bg-bg p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Badge tone={result.rulesetSufficient ? "success" : "warning"}>
            {result.rulesetSufficient
              ? <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
              : <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />}
            {result.rulesetSufficient ? "Ruleset sufficient" : `${ambiguousCount} team${ambiguousCount === 1 ? "" : "s"} ambiguous`}
          </Badge>
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {result.teamCount} teams · ruleset of {result.ruleset.length}
          </span>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {result.ruleset.join(" → ") || "(empty)"}
        </div>
      </div>

      {result.staticWarnings.length > 0 && (
        <div className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Static warnings</div>
          <ul className="space-y-1.5">
            {result.staticWarnings.map((w, i) => (
              <li key={i} className="rounded-md border border-border bg-bg-subtle p-3 text-sm text-fg">
                <AlertTriangle className="mr-2 inline h-3.5 w-3.5" strokeWidth={1.75} />{w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.ambiguities.length > 0 && (
        <div className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Residual ambiguities</div>
          <ul className="space-y-1.5">
            {result.ambiguities.map((g, i) => (
              <li key={i} className="rounded-md border border-border bg-bg-subtle p-3 text-sm">
                <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                  Rank {g.startingRank}–{g.startingRank + g.teamIds.length - 1}
                </span>
                <div className="mt-1 text-fg">
                  {g.teamNames.join(" · ")} — ruleset exhausted, only the stable team-id sort separated them.
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Table>
        <THead><TR>
          <TH className="text-right">#</TH><TH>Team</TH>
          <TH>Resolved by</TH><TH>Note</TH>
        </TR></THead>
        <TBody>
          {result.ranked.map((r) => (
            <TR key={r.teamId}
              className={ambiguousTeamIds.has(r.teamId) ? "bg-amber-500/5" : undefined}>
              <TD className="text-right font-medium">{r.rank}</TD>
              <TD className="font-medium">{r.teamName}</TD>
              <TD className="text-muted-foreground"><ResolutionBadge row={r} /></TD>
              <TD className="text-muted-foreground text-xs">{r.note ?? ""}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function ResolutionBadge({ row }: { row: RankedTeamRow }) {
  if (row.resolvedBy === "points") return <Badge tone="neutral">points</Badge>;
  if (row.resolvedBy === "teamId") return <Badge tone="warning">team-id fallback</Badge>;
  return <Badge tone="info">{row.resolvedBy.replace(/_/g, " ")}</Badge>;
}
