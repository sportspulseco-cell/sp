"use client";

import { useState, type FormEvent } from "react";
import {
  AlertTriangle, CheckCircle2, Loader2, PlayCircle, XCircle
} from "lucide-react";
import {
  Badge, Button, EmptyState, Field, Input, Select,
  TBody, TD, TH, THead, TR, Table
} from "@sportspulse/ui";
import { scheduler, type FairnessResponse } from "./scheduler-client";

interface Division { id: string; name: string }
interface Props { seasonId: string; divisions: Division[] }

const ALL_DIVISIONS = "__all__";

function pct(n: number): string { return `${(n * 100).toFixed(1)}%`; }

function BandBar({
  early, mid, late
}: { early: number; mid: number; late: number }) {
  const total = early + mid + late;
  if (total === 0)
    return <div className="h-2 w-full rounded-full bg-bg-subtle" aria-hidden />;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-bg-subtle"
      role="img" aria-label={`early ${early}, mid ${mid}, late ${late}`}>
      <span className="bg-blue-400/80"
        style={{ width: `${(early / total) * 100}%` }} title={`Early: ${early}`} />
      <span className="bg-emerald-400/80"
        style={{ width: `${(mid / total) * 100}%` }} title={`Mid: ${mid}`} />
      <span className="bg-amber-400/80"
        style={{ width: `${(late / total) * 100}%` }} title={`Late: ${late}`} />
    </div>
  );
}

export function SchedulingFairnessForm({ seasonId, divisions }: Props) {
  const [divisionId, setDivisionId] = useState<string>(ALL_DIVISIONS);
  const [tolerance, setTolerance] = useState("0.10");
  const [maxLate, setMaxLate] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FairnessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setResult(null); setSubmitting(true);
    try {
      const res = await scheduler.fairnessReport({
        seasonId,
        divisionId: divisionId === ALL_DIVISIONS ? undefined : divisionId,
        tolerance: Number(tolerance) || 0.1,
        maxLateFraction: maxLate.trim() === "" ? undefined : Number(maxLate)
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="rounded-lg border border-border bg-bg p-6 space-y-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Division" hint="Leave on All for season-wide report">
            <Select value={divisionId} onChange={(e) => setDivisionId(e.target.value)} disabled={submitting}>
              <option value={ALL_DIVISIONS}>All divisions</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Tolerance" hint="Max abs deviation per band (0–1)">
            <Input type="number" min="0" max="1" step="0.01" value={tolerance}
              onChange={(e) => setTolerance(e.target.value)} disabled={submitting} />
          </Field>
          <Field label="Late cap" hint="Hard cap on any team's late share (0–1, blank = none)">
            <Input type="number" min="0" max="1" step="0.01" value={maxLate}
              onChange={(e) => setMaxLate(e.target.value)} disabled={submitting}
              placeholder="0.30" />
          </Field>
        </div>
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <><Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />Computing…</>
          ) : (
            <><PlayCircle className="h-4 w-4" strokeWidth={1.75} />Compute</>
          )}
        </Button>
      </form>

      {error && (
        <div className="rounded-lg border border-border bg-bg p-5 text-sm">
          <div className="mb-2 flex items-center gap-2 text-fg">
            <XCircle className="h-4 w-4" strokeWidth={1.75} />
            <span className="font-mono text-[10px] uppercase tracking-widest">Request failed</span>
          </div>
          <p className="text-fg-muted">{error}</p>
        </div>
      )}

      {result && (
        <FairnessResult result={result}
          tolerance={Number(tolerance) || 0.1}
          maxLateFraction={maxLate.trim() === "" ? undefined : Number(maxLate)} />
      )}
    </div>
  );
}

function FairnessResult({
  result, tolerance, maxLateFraction
}: {
  result: FairnessResponse;
  tolerance: number;
  maxLateFraction: number | undefined;
}) {
  const { report } = result;

  if (result.gameCount === 0) {
    return (
      <EmptyState icon={AlertTriangle}
        title="No banded games in scope"
        description="Run Generate first, or ensure ice_slots carry a band (early / mid / late)." />
    );
  }

  const offenders = report.teams.filter((t) => t.exceedsTolerance).length;

  return (
    <div className="rounded-lg border border-border bg-bg p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Badge tone={report.toleranceMet ? "success" : "warning"}>
            {report.toleranceMet ? (
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
            )}
            {report.toleranceMet ? "Within tolerance" : `${offenders} team${offenders === 1 ? "" : "s"} exceed`}
          </Badge>
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {result.teamCount} teams · {result.gameCount} games · tolerance ±{pct(tolerance)}
            {maxLateFraction !== undefined ? ` · late cap ${pct(maxLateFraction)}` : ""}
          </span>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          league avg · early {pct(report.leagueAverage.early)} · mid {pct(report.leagueAverage.mid)} · late {pct(report.leagueAverage.late)}
        </div>
      </div>
      <Table>
        <THead><TR>
          <TH>Team</TH><TH>Distribution</TH>
          <TH className="text-right">Early</TH><TH className="text-right">Mid</TH>
          <TH className="text-right">Late</TH><TH className="text-right">Total</TH>
          <TH className="text-right">Max dev.</TH><TH>Status</TH>
        </TR></THead>
        <TBody>
          {report.teams.map((t) => (
            <TR key={t.teamId}>
              <TD className="font-mono text-[11px] tracking-wide">{t.teamId.slice(0, 8)}…</TD>
              <TD className="w-[180px]"><BandBar early={t.counts.early} mid={t.counts.mid} late={t.counts.late} /></TD>
              <TD className="text-right">{t.counts.early}</TD>
              <TD className="text-right">{t.counts.mid}</TD>
              <TD className="text-right">{t.counts.late}</TD>
              <TD className="text-right font-medium">{t.total}</TD>
              <TD className="text-right text-muted-foreground">{pct(t.maxDeviation)}</TD>
              <TD>
                {t.exceedsTolerance ? (
                  <Badge tone="warning">
                    {maxLateFraction !== undefined && t.lateFraction > maxLateFraction
                      ? `late ${pct(t.lateFraction)}` : "deviates"}
                  </Badge>
                ) : <Badge tone="success">within</Badge>}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4 text-[11px] text-fg-muted">
        <Legend swatch="bg-blue-400/80" label="early" />
        <Legend swatch="bg-emerald-400/80" label="mid" />
        <Legend swatch="bg-amber-400/80" label="late" />
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-3 rounded-sm ${swatch}`} aria-hidden />
      <span className="font-mono uppercase tracking-widest">{label}</span>
    </span>
  );
}
