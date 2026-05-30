"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Loader2, Lock, RefreshCw, XCircle
} from "lucide-react";
import {
  Badge, Button, EmptyState, TBody, TD, TH, THead, TR, Table
} from "@sportspulse/ui";
import {
  createSchedulerSupabaseClient, scheduler, type ConflictPair
} from "./scheduler-client";
import { ResolveConflictDialog } from "./resolve-conflict-dialog";

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
  } catch { return iso; }
}

export function SchedulingConflictsClient({ seasonId }: { seasonId: string }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictPair[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ConflictPair | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "initial") setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const res = await scheduler.listConflicts({ seasonId });
      setConflicts(res.conflicts);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mode === "initial") setLoading(false); else setRefreshing(false);
    }
  }, [seasonId]);

  useEffect(() => { load("initial"); }, [load]);

  useEffect(() => {
    const sb = createSchedulerSupabaseClient();
    const channel = sb.channel(`schedule:season:${seasonId}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    channel.on("broadcast", { event: "schedule_updated" }, (_msg: any) => {
      void load("refresh");
    });
    channel.subscribe();
    return () => { sb.removeChannel(channel); };
  }, [seasonId, load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {loading ? (
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              <Loader2 className="inline h-3 w-3 animate-spin" strokeWidth={1.75} /> Detecting…
            </span>
          ) : (
            <Badge tone={conflicts.length === 0 ? "success" : "warning"}>
              {conflicts.length === 0
                ? <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                : <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />}
              {conflicts.length === 0 ? "No conflicts"
                : `${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"}`}
            </Badge>
          )}
        </div>
        <Button variant="secondary" onClick={() => load("refresh")} disabled={loading || refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.75} />Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-border bg-bg p-5 text-sm">
          <div className="mb-2 flex items-center gap-2 text-fg">
            <XCircle className="h-4 w-4" strokeWidth={1.75} />
            <span className="font-mono text-[10px] uppercase tracking-widest">Detect failed</span>
          </div>
          <p className="text-fg-muted">{error}</p>
        </div>
      )}

      {!loading && !error && conflicts.length === 0 && (
        <EmptyState icon={CheckCircle2}
          title="No team-overlap conflicts"
          description="Every team's games are non-overlapping in this season." />
      )}

      {conflicts.length > 0 && (
        <Table>
          <THead><TR>
            <TH>Team(s) affected</TH><TH>Division</TH>
            <TH>Game A</TH><TH>Game B</TH>
            <TH>Locked</TH><TH className="text-right">Resolve</TH>
          </TR></THead>
          <TBody>
            {conflicts.map((c) => (
              <TR key={`${c.gameAId}:${c.gameBId}`}>
                <TD className="font-medium">{c.sharedTeamNames.join(", ")}</TD>
                <TD className="text-muted-foreground">{c.divisionName ?? "—"}</TD>
                <TD className="text-muted-foreground">
                  <div>{c.gameAHome} @ {c.gameAAway}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    {fmtTime(c.gameAStart)}{c.aLocked ? " · locked" : ""}
                  </div>
                </TD>
                <TD className="text-muted-foreground">
                  <div>{c.gameBHome} @ {c.gameBAway}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    {fmtTime(c.gameBStart)}{c.bLocked ? " · locked" : ""}
                  </div>
                </TD>
                <TD>
                  {c.bothLocked ? (
                    <Badge tone="danger"><Lock className="h-3 w-3" strokeWidth={1.75} />both</Badge>
                  ) : c.aLocked || c.bLocked ? (
                    <Badge tone="warning"><Lock className="h-3 w-3" strokeWidth={1.75} />one</Badge>
                  ) : <Badge tone="neutral">—</Badge>}
                </TD>
                <TD className="text-right">
                  <Button onClick={() => setActive(c)}>Resolve →</Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {active && (
        <ResolveConflictDialog seasonId={seasonId} conflict={active}
          onClose={() => setActive(null)}
          onResolved={() => { setActive(null); void load("refresh"); }} />
      )}
    </div>
  );
}
