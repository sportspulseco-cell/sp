"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock,
  Loader2, PlayCircle, RefreshCw, Send, SkipForward, TrendingDown,
  TrendingUp, XCircle
} from "lucide-react";
import {
  Badge, Button, EmptyState, Field, Input, TBody, TD, TH, THead, TR, Table
} from "@sportspulse/ui";
import {
  scheduler,
  type ParityWindowView,
  type ParityRecommendation,
  type ParityDecision
} from "./scheduler-client";

interface Props { seasonId: string }

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric"
    });
  } catch { return iso; }
}

function windowStateTone(
  state: ParityWindowView["state"]
): "success" | "info" | "warning" | "neutral" {
  if (state === "applied") return "success";
  if (state === "review_open") return "info";
  if (state === "skipped" || state === "archived") return "neutral";
  return "warning";
}

function recIcon(r: ParityRecommendation["recommendation"]) {
  if (r === "move_up") return <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.75} />;
  if (r === "move_down") return <TrendingDown className="h-3.5 w-3.5" strokeWidth={1.75} />;
  return <SkipForward className="h-3.5 w-3.5" strokeWidth={1.75} />;
}

function recTone(
  r: ParityRecommendation["recommendation"]
): "success" | "warning" | "neutral" {
  if (r === "move_up") return "success";
  if (r === "move_down") return "warning";
  return "neutral";
}

/**
 * SchedulingParityWindows — pain #6 admin surface.
 *   - lists every parity_windows row for the season
 *   - per row: "Compute" (pending → review_open), "Review" (review_open
 *     → expand inline), "View" (applied/skipped — read-only)
 *   - inline review shows per-team recommendation + override dropdown
 *     + Apply selected / Skip window
 */
export function SchedulingParityWindows({ seasonId }: Props) {
  const [windows, setWindows] = useState<ParityWindowView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [computing, setComputing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");

  async function loadWindows() {
    setLoading(true); setError(null);
    try {
      const res = await scheduler.listParityWindows({ seasonId });
      setWindows(res.windows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadWindows(); }, [seasonId]);

  async function onCompute(windowId: string) {
    setComputing(windowId);
    try {
      await scheduler.computeParityWindow({ seasonId, windowId });
      await loadWindows();
      setExpanded(windowId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setComputing(null); }
  }

  async function onCreate() {
    if (!newStart || !newEnd) {
      setError("Start and end dates are required.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const nextIndex = windows.length > 0
        ? Math.max(...windows.map((w) => w.windowIndex)) + 1
        : 1;
      const created = await scheduler.createParityWindow({
        seasonId,
        windowIndex: nextIndex,
        startDate: newStart,
        endDate: newEnd,
      });
      setShowCreate(false);
      setNewStart("");
      setNewEnd("");
      await loadWindows();
      setExpanded(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  if (loading && windows.length === 0) {
    return (
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
        Loading parity windows…
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
        <div className="mt-3"><Button onClick={loadWindows}>Retry</Button></div>
      </div>
    );
  }

  const createForm = showCreate ? (
    <div className="rounded-lg border border-border bg-bg p-4 space-y-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        // New parity window
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Start date">
          <Input
            type="date"
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
            disabled={creating}
          />
        </Field>
        <Field label="End date">
          <Input
            type="date"
            value={newEnd}
            onChange={(e) => setNewEnd(e.target.value)}
            disabled={creating}
          />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setShowCreate(false);
            setNewStart("");
            setNewEnd("");
          }}
          disabled={creating}
        >
          Cancel
        </Button>
        <Button onClick={onCreate} disabled={creating || !newStart || !newEnd}>
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
          ) : null}
          Create
        </Button>
      </div>
    </div>
  ) : null;

  if (windows.length === 0) {
    return (
      <div className="space-y-3">
        {createForm}
        {!showCreate ? (
          <EmptyState
            icon={Clock}
            title="No parity windows yet"
            description="Create one manually below, or wait for the cron to open the next window per season config."
            action={
              <Button onClick={() => setShowCreate(true)}>Create window</Button>
            }
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {createForm}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {windows.length} window{windows.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          {!showCreate ? (
            <Button variant="secondary" onClick={() => setShowCreate(true)}>
              Create window
            </Button>
          ) : null}
          <Button variant="secondary" onClick={loadWindows} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} strokeWidth={1.75} />
            Refresh
          </Button>
        </div>
      </div>
      <Table>
        <THead>
          <TR>
            <TH className="text-right">#</TH>
            <TH>Window</TH>
            <TH>Review due</TH>
            <TH>State</TH>
            <TH className="text-right">Recs</TH>
            <TH className="text-right">Decisions</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {windows.map((w) => {
            const isOpen = expanded === w.id;
            return (
              <Row key={w.id}>
                <TR>
                  <TD className="text-right font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    {w.windowIndex}
                  </TD>
                  <TD>{fmtDate(w.startDate)} → {fmtDate(w.endDate)}</TD>
                  <TD className="text-muted-foreground">{fmtDate(w.reviewDueDate)}</TD>
                  <TD>
                    <Badge tone={windowStateTone(w.state)}>{w.state.replace(/_/g, " ")}</Badge>
                  </TD>
                  <TD className="text-right">{w.recommendationsCount}</TD>
                  <TD className="text-right">{w.decisionsCount}</TD>
                  <TD className="text-right">
                    {w.state === "pending" ? (
                      <Button
                        onClick={() => onCompute(w.id)}
                        disabled={computing === w.id}
                      >
                        {computing === w.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                        ) : (
                          <PlayCircle className="h-4 w-4" strokeWidth={1.75} />
                        )}
                        Compute
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => setExpanded(isOpen ? null : w.id)}
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" strokeWidth={1.75} />
                        ) : (
                          <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                        )}
                        {w.state === "review_open" ? "Review" : "View"}
                      </Button>
                    )}
                  </TD>
                </TR>
                {isOpen && (
                  <TR>
                    <td colSpan={7} className="bg-bg-subtle">
                      <ReviewPane
                        seasonId={seasonId}
                        windowId={w.id}
                        readOnly={w.state === "applied" || w.state === "archived"}
                        onApplied={() => { setExpanded(null); void loadWindows(); }}
                      />
                    </td>
                  </TR>
                )}
              </Row>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

interface ReviewPaneProps {
  seasonId: string;
  windowId: string;
  readOnly: boolean;
  onApplied: () => void;
}

function ReviewPane({ seasonId, windowId, readOnly, onApplied }: ReviewPaneProps) {
  const [recs, setRecs] = useState<ParityRecommendation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** teamId → confirmed targetDivisionId (string), or empty string for "stay". */
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        // Re-compute to fetch the latest recommendations as a side-effect
        // (idempotent — re-running overwrites recs jsonb in-place).
        const res = await scheduler.computeParityWindow({ seasonId, windowId });
        if (cancelled) return;
        setRecs(res.recommendations);
        const initial: Record<string, string> = {};
        for (const r of res.recommendations) {
          initial[r.teamId] = r.targetDivisionId ?? "";
        }
        setOverrides(initial);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [seasonId, windowId]);

  const decisions: ParityDecision[] = useMemo(() => {
    if (!recs) return [];
    const out: ParityDecision[] = [];
    for (const r of recs) {
      const target = overrides[r.teamId];
      if (target && target !== r.currentDivisionId) {
        out.push({ teamId: r.teamId, targetDivisionId: target });
      }
    }
    return out;
  }, [overrides, recs]);

  async function apply(skip: boolean) {
    setApplying(true); setError(null);
    try {
      await scheduler.applyParityWindow({
        seasonId, windowId,
        decisions: skip ? [] : decisions
      });
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setApplying(false); }
  }

  if (loading) {
    return (
      <div className="p-4 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        <Loader2 className="inline h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />{" "}
        Loading recommendations…
      </div>
    );
  }

  if (error || !recs) {
    return (
      <div className="p-4 text-sm">
        <div className="mb-2 flex items-center gap-2 text-fg">
          <XCircle className="h-4 w-4" strokeWidth={1.75} />
          <span className="font-mono text-[10px] uppercase tracking-widest">Recommendation load failed</span>
        </div>
        <p className="text-fg-muted">{error}</p>
      </div>
    );
  }

  // Build a per-division target options list (unique target division IDs +
  // each team's current as "Stay" option).
  const divisionOptions = uniqueByDivision(recs);

  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="success">
          <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.75} />
          {recs.filter((r) => r.recommendation === "move_up").length} move up
        </Badge>
        <Badge tone="warning">
          <TrendingDown className="h-3.5 w-3.5" strokeWidth={1.75} />
          {recs.filter((r) => r.recommendation === "move_down").length} move down
        </Badge>
        <Badge tone="neutral">
          <SkipForward className="h-3.5 w-3.5" strokeWidth={1.75} />
          {recs.filter((r) => r.recommendation === "stay").length} stay
        </Badge>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Team</TH>
            <TH>Current division</TH>
            <TH>Recommendation</TH>
            <TH>Reasoning</TH>
            <TH>Move to</TH>
          </TR>
        </THead>
        <TBody>
          {recs.map((r) => (
            <TR key={r.teamId}>
              <TD className="font-medium">{r.teamName}</TD>
              <TD className="text-muted-foreground">
                {r.currentDivisionName}
                <span className="ml-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                  #{r.rankInDivision}/{r.divisionSize}
                </span>
              </TD>
              <TD>
                <Badge tone={recTone(r.recommendation)}>
                  {recIcon(r.recommendation)}
                  {r.recommendation.replace(/_/g, " ")}
                </Badge>
              </TD>
              <TD className="text-muted-foreground text-xs">{r.reasoning}</TD>
              <TD>
                <select
                  disabled={readOnly || applying}
                  value={overrides[r.teamId] ?? r.currentDivisionId}
                  onChange={(e) =>
                    setOverrides((prev) => ({ ...prev, [r.teamId]: e.target.value }))
                  }
                  className="rounded-md border border-border bg-bg px-2 py-1 text-xs"
                >
                  <option value={r.currentDivisionId}>
                    Stay in {r.currentDivisionName}
                  </option>
                  {divisionOptions
                    .filter((d) => d.id !== r.currentDivisionId)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        Move to {d.name}
                      </option>
                    ))}
                </select>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      {!readOnly && (
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {decisions.length} move{decisions.length === 1 ? "" : "s"} pending
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => apply(true)}
              disabled={applying}
            >
              {applying ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
              ) : (
                <SkipForward className="h-4 w-4" strokeWidth={1.75} />
              )}
              Skip window
            </Button>
            <Button
              onClick={() => apply(false)}
              disabled={applying || decisions.length === 0}
            >
              {applying ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
              ) : (
                <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
              )}
              Apply {decisions.length || ""}
            </Button>
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="rounded-md border border-border bg-bg p-3">
          <div className="mb-1 flex items-center gap-2 text-fg">
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="font-mono text-[10px] uppercase tracking-widest">
              What happens on Apply
            </span>
          </div>
          <p className="text-fg-muted">
            Each moved team's current division entry is withdrawn and a new
            entry is created in the target division. Future <em>unlocked</em>
            <em> unplayed</em> games for affected divisions are deleted (locked
            + completed games stay), then <code>scheduler-generate</code> is
            kicked off per affected division to re-fill the remaining
            schedule. Untouched divisions are unaffected.
          </p>
        </div>
      )}
    </div>
  );
}

function uniqueByDivision(
  recs: ParityRecommendation[]
): Array<{ id: string; name: string }> {
  const seen = new Map<string, string>();
  for (const r of recs) seen.set(r.currentDivisionId, r.currentDivisionName);
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}
