"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, History, Loader2, Pause, XCircle
} from "lucide-react";
import {
  Badge, Button, EmptyState, TBody, TD, TH, THead, TR, Table
} from "@sportspulse/ui";
import {
  scheduler, type ScheduleRunListItem
} from "./scheduler-client";

interface Props { seasonId: string }

function fmtTs(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch { return iso; }
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function statusTone(s: ScheduleRunListItem["status"]):
  "success" | "info" | "warning" | "danger" | "neutral" {
  switch (s) {
    case "completed": return "success";
    case "running":
    case "queued": return "info";
    case "partial": return "warning";
    case "failed": return "danger";
  }
}

function StatusIcon({ status }: { status: ScheduleRunListItem["status"] }) {
  const cls = "h-3.5 w-3.5";
  switch (status) {
    case "completed": return <CheckCircle2 className={cls} strokeWidth={1.75} />;
    case "running":   return <Loader2 className={`${cls} animate-spin`} strokeWidth={1.75} />;
    case "queued":    return <Pause className={cls} strokeWidth={1.75} />;
    case "partial":   return <AlertTriangle className={cls} strokeWidth={1.75} />;
    case "failed":    return <XCircle className={cls} strokeWidth={1.75} />;
  }
}

/**
 * SchedulingRunsList — read view over `schedule_runs` for forensics.
 * Each row is a past CP-SAT run with the stored solution + input
 * hash. Click "Details" → expand the row to show seed, infeasibility
 * summary, and the ran-by user id.
 */
export function SchedulingRunsList({ seasonId }: Props) {
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<ScheduleRunListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await scheduler.listRuns({ seasonId, limit: 100 });
      setRuns(res.runs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [seasonId]);

  if (loading && runs.length === 0) {
    return (
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
        Loading runs…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-bg p-5 text-sm">
        <div className="mb-2 flex items-center gap-2 text-fg">
          <XCircle className="h-4 w-4" strokeWidth={1.75} />
          <span className="font-mono text-[10px] uppercase tracking-widest">
            Load failed
          </span>
        </div>
        <p className="text-fg-muted">{error}</p>
        <div className="mt-3"><Button onClick={load}>Retry</Button></div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No runs yet"
        description="Schedule generation hasn't been run for this season. Click Generate to create the first run."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {runs.length} run{runs.length === 1 ? "" : "s"}
        </span>
        <Button variant="secondary" onClick={load}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
          ) : (
            <Clock className="h-4 w-4" strokeWidth={1.75} />
          )}
          Refresh
        </Button>
      </div>
      <Table>
        <THead>
          <TR>
            <TH>When</TH>
            <TH>Division</TH>
            <TH>Engine</TH>
            <TH>Status</TH>
            <TH className="text-right">Games</TH>
            <TH className="text-right">Duration</TH>
            <TH className="text-right">Details</TH>
          </TR>
        </THead>
        <TBody>
          {runs.map((r) => {
            const isOpen = expanded === r.id;
            return (
              <Fragment key={r.id}>
                <TR>
                  <TD className="font-mono text-[11px] tracking-wide">
                    {fmtTs(r.ranAt)}
                  </TD>
                  <TD className="text-muted-foreground">
                    {r.divisionName ?? (r.divisionId ? "—" : "all")}
                  </TD>
                  <TD className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    {r.engine}
                  </TD>
                  <TD>
                    <Badge tone={statusTone(r.status)}>
                      <StatusIcon status={r.status} />
                      {r.status}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    {r.gamesCreated}
                    {r.gamesLockedPreserved > 0 && (
                      <span className="ml-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                        +{r.gamesLockedPreserved} locked
                      </span>
                    )}
                  </TD>
                  <TD className="text-right text-muted-foreground">
                    {fmtDuration(r.durationMs)}
                  </TD>
                  <TD className="text-right">
                    <Button
                      variant="secondary"
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                    >
                      {isOpen ? "Hide" : "Details"}
                    </Button>
                  </TD>
                </TR>
                {isOpen && (
                  <TR>
                    {/* Native <td> — TD's type doesn't expose colSpan. */}
                    <td colSpan={7} className="bg-bg-subtle">
                      <RunDetails run={r} />
                    </td>
                  </TR>
                )}
              </Fragment>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}

function RunDetails({ run }: { run: ScheduleRunListItem }) {
  return (
    <div className="space-y-3 p-3 text-sm">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Pair label="Run ID" value={<code className="font-mono text-[11px]">{run.id}</code>} />
        <Pair label="Seed" value={<code className="font-mono text-[11px]">{run.seed}</code>} />
        <Pair label="Input hash" value={<code className="font-mono text-[11px]">{run.inputHash.slice(0, 16)}…</code>} />
        <Pair label="Ran by" value={
          <code className="font-mono text-[11px]">
            {run.ranByUserId?.slice(0, 8) ?? "—"}…
          </code>
        } />
      </div>
      {run.infeasibilitySummary && (
        <div className="rounded-md border border-border bg-bg p-3">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Infeasibility summary
          </div>
          <p className="text-fg">{run.infeasibilitySummary}</p>
        </div>
      )}
      <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        The full <code>solution</code> + <code>constraint_snapshot</code> are stored
        on the <code>schedule_runs</code> row (decision #4 — determinism by
        persistence). Forensic deep-dive UI lands when we wire game_provenance
        replay.
      </div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </div>
      <div className="mt-0.5 text-fg">{value}</div>
    </div>
  );
}
