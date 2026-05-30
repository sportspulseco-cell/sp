"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Lock, XCircle } from "lucide-react";
import {
  Badge, Button, Dialog, DialogActions
} from "@sportspulse/ui";
import {
  scheduler, type ConflictPair, type ResolveResponse
} from "./scheduler-client";

interface Props {
  seasonId: string;
  conflict: ConflictPair;
  onClose: () => void;
  onResolved: () => void;
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
  } catch { return iso; }
}

export function ResolveConflictDialog({
  seasonId, conflict, onClose, onResolved
}: Props) {
  const [proposing, setProposing] = useState(true);
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ResolveResponse | null>(null);

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function go() {
      setProposing(true); setProposeError(null);
      try {
        const res = await scheduler.resolveConflict({
          seasonId, gameAId: conflict.gameAId, gameBId: conflict.gameBId
        });
        if (cancelled) return;
        setProposal(res);
        if (res.options.length > 0) setSelectedOptionId(res.options[0]!.optionId);
      } catch (err) {
        if (cancelled) return;
        setProposeError(err instanceof Error ? err.message : String(err));
      } finally { if (!cancelled) setProposing(false); }
    }
    void go();
    return () => { cancelled = true; };
  }, [seasonId, conflict.gameAId, conflict.gameBId]);

  const selectedOption = proposal?.options.find((o) => o.optionId === selectedOptionId);

  async function onApply() {
    if (!selectedOption) return;
    setApplyError(null); setApplying(true);
    try {
      await scheduler.applyConflictResolution({
        seasonId,
        gameId: selectedOption.delta.gameId,
        toSlotId: selectedOption.delta.toSlotId,
        reason: reason.trim() || undefined
      });
      onResolved();
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : String(err));
    } finally { setApplying(false); }
  }

  return (
    <Dialog open onClose={onClose} title="Resolve conflict"
      description={`${conflict.sharedTeamNames.join(", ")} · ${conflict.divisionName ?? "—"}`}
      size="lg">
      <div className="space-y-5 text-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ConflictCard heading="Game A" home={conflict.gameAHome} away={conflict.gameAAway}
            startTs={conflict.gameAStart} locked={conflict.aLocked} />
          <ConflictCard heading="Game B" home={conflict.gameBHome} away={conflict.gameBAway}
            startTs={conflict.gameBStart} locked={conflict.bLocked} />
        </div>

        {proposing && (
          <div className="rounded-md border border-border bg-bg-subtle p-4 text-fg-muted">
            <Loader2 className="inline h-4 w-4 animate-spin" strokeWidth={1.75} />{" "}
            Computing pre-validated options…
          </div>
        )}

        {proposeError && (
          <div className="rounded-md border border-border bg-bg-subtle p-4">
            <div className="mb-1 flex items-center gap-2 text-fg">
              <XCircle className="h-4 w-4" strokeWidth={1.75} />
              <span className="font-mono text-[10px] uppercase tracking-widest">
                Could not propose options
              </span>
            </div>
            <p className="text-fg-muted">{proposeError}</p>
          </div>
        )}

        {proposal && (
          <>
            <div className="rounded-md border border-border bg-bg-subtle p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                {proposal.conflictKind}
              </div>
              <p className="mt-1 text-fg">{proposal.diagnosis}</p>
            </div>

            {proposal.options.length === 0 ? (
              <div className="rounded-md border border-border bg-bg-subtle p-4 text-fg-muted">
                No feasible alternative slots found in this scope. Unlock a game, add slot inventory, or widen the search window.
              </div>
            ) : (
              <fieldset className="space-y-2">
                <legend className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                  Pre-validated options
                </legend>
                {proposal.options.map((opt) => {
                  const active = opt.optionId === selectedOptionId;
                  return (
                    <label key={opt.optionId}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                        active ? "border-fg bg-bg" : "border-border bg-bg-subtle hover:border-fg-muted"
                      }`}>
                      <input type="radio" name="resolution-option" value={opt.optionId}
                        checked={active} onChange={() => setSelectedOptionId(opt.optionId)}
                        className="mt-1" />
                      <div className="flex-1">
                        <div className="font-medium text-fg">{opt.label}</div>
                        <div className="mt-1 text-fg-muted">{opt.description}</div>
                        <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                          → {opt.delta.toVenueName} · {opt.delta.toSurfaceLabel} · {fmtTime(opt.delta.toStartTsUtc)}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </fieldset>
            )}

            {proposal.rejected.length > 0 && (
              <details className="rounded-md border border-border bg-bg-subtle p-3">
                <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                  {proposal.rejected.length} candidate slot{proposal.rejected.length === 1 ? "" : "s"} rejected
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-fg-muted">
                  {proposal.rejected.map((r, i) => (
                    <li key={i}>
                      <span className="font-mono">{r.slotId.slice(0, 8)}…</span> — {r.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {proposal.options.length > 0 && (
              <div>
                <label htmlFor="resolve-reason"
                  className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                  Reason (stored in provenance)
                </label>
                <input id="resolve-reason" type="text" value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Captain emailed re. overlap with travel"
                  disabled={applying}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-fg-muted focus:outline-none" />
              </div>
            )}

            {applyError && (
              <div className="rounded-md border border-border bg-bg-subtle p-3 text-xs">
                <div className="mb-1 flex items-center gap-2 text-fg">
                  <XCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span className="font-mono text-[10px] uppercase tracking-widest">Apply failed</span>
                </div>
                <p className="text-fg-muted">{applyError}</p>
              </div>
            )}
          </>
        )}
      </div>

      <DialogActions>
        <Button variant="secondary" onClick={onClose} disabled={applying}>Cancel</Button>
        <Button onClick={onApply}
          disabled={applying || !selectedOption || !proposal || proposal.options.length === 0}>
          {applying ? (
            <><Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />Applying…</>
          ) : (
            <><CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />Apply</>
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ConflictCard({
  heading, home, away, startTs, locked
}: {
  heading: string; home: string; away: string; startTs: string; locked: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-bg-subtle p-3">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">{heading}</div>
        {locked && (
          <Badge tone="warning"><Lock className="h-3 w-3" strokeWidth={1.75} />locked</Badge>
        )}
      </div>
      <div className="mt-1 text-fg">{home} @ {away}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {fmtTime(startTs)}
      </div>
    </div>
  );
}
