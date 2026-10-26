"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Gavel, Loader2 } from "lucide-react";
import { SUSPENSION_ISSUE_KINDS, SUSPENSION_KIND_LABELS, SUSPENSION_MAX_GAMES, validateLiftReason, validateSuspensionIssue, type SuspensionKind } from "@sportspulse/kernel";
import { gameOps } from "@/lib/api/browser-api";
import { Button, Dialog, DialogActions, Field, Input, Select, Alert } from "@sportspulse/ui";

const TEXTAREA =
  "w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus";

/** "YYYY-MM-DD" for a local date offset by `days` from today. */
function localDay(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * "Suspend" (UC-14, COMP-10). Opened from the person page (no penalty)
 * or from a penalty row on the game page (`source` set). The server
 * checks scope and permission and counts served games when games are
 * finalized; this dialog only collects the decision.
 */
export function IssueSuspensionButton({
  personId,
  personName,
  source,
  defaultReason = "",
  triggerLabel = "Issue suspension",
  compact = false
}: {
  personId: string;
  personName: string;
  /** The penalty this suspension comes from. */
  source?: { eventId: string; label: string };
  defaultReason?: string;
  triggerLabel?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SuspensionKind>("n_games");
  const [games, setGames] = useState("1");
  const [until, setUntil] = useState(localDay(7));
  const [reason, setReason] = useState(defaultReason);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setKind("n_games");
    setGames("1");
    setUntil(localDay(7));
    setReason(defaultReason);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    // The date input is a local calendar day; the player may play again
    // from the start of that day in this browser's time zone.
    const endAt = kind === "time_bounded" && until ? new Date(`${until}T00:00`).toISOString() : null;
    const nGames = kind === "n_games" ? Number(games) : null;
    const problem = validateSuspensionIssue({ kind, nGames, endAt, reason }, new Date());
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await gameOps.issueSuspension({
        personId,
        kind,
        sourceEventId: source?.eventId ?? null,
        nGames,
        endAt,
        reason: reason.trim()
      });
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {compact ? (
        <Button
          type="button"
          onClick={() => setOpen(true)}
          variant="outline"
          size="sm"
          className="gap-1.5"
        >
          <Gavel className="h-3 w-3" strokeWidth={1.75} />
          {triggerLabel}
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Gavel className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
          {triggerLabel}
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Suspend ${personName}`}
        description={
          source
            ? `From the penalty: ${source.label}. The player sits out every team's games until it is served or lifted.`
            : "The player sits out every team's games until it is served or lifted."
        }
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Length">
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value as SuspensionKind)}
            >
              {SUSPENSION_ISSUE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {SUSPENSION_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          {kind === "n_games" ? (
            <Field
              label="Games to sit out"
              hint="Counted down automatically each time the player's team finalizes a game."
            >
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={SUSPENSION_MAX_GAMES}
                step={1}
                required
                value={games}
                onChange={(e) => setGames(e.target.value)}
              />
            </Field>
          ) : kind === "time_bounded" ? (
            <Field label="May play again on" hint="The player may play from the start of this day.">
              <Input
                type="date"
                required
                min={localDay(1)}
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </Field>
          ) : (
            <p className="text-[13px] text-fg-muted">
              The player sits out every game until an admin lifts the suspension.
            </p>
          )}
          <Field label="Reason" hint="Required. The player is told this reason.">
            <textarea
              required
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Game misconduct, Nov 2 vs Ice Hawks"
              className={TEXTAREA}
            />
          </Field>
          {error ? (
            <Alert tone="error">
              {error}
            </Alert>
          ) : null}
          <DialogActions>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={loading || reason.trim().length === 0}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Suspending…
                </>
              ) : (
                "Suspend player"
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}

/**
 * "Change games" on a standing suspension (UC-14 override): reduce or
 * extend it, or give a match penalty a length after its hearing. Reason
 * required; games already served stay counted.
 */
export function ChangeSuspensionGamesButton({
  suspensionId,
  personName,
  label,
  currentGames,
  servedCount
}: {
  suspensionId: string;
  personName: string;
  label: string;
  /** Null for a suspension until lifted. */
  currentGames: number | null;
  servedCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [games, setGames] = useState(String(currentGames ?? 1));
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    const n = Number(games);
    if (!Number.isInteger(n) || n < 1 || n > SUSPENSION_MAX_GAMES) {
      setError(`Games must be a whole number from 1 to ${SUSPENSION_MAX_GAMES}.`);
      return;
    }
    const problem = validateLiftReason(reason);
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await gameOps.changeSuspensionGames(suspensionId, n, reason.trim());
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        variant="outline"
        size="sm"
        className="gap-1.5"
      >
        Change games
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Change ${personName}'s suspension`}
        description={`Currently: ${label}. ${servedCount} game${servedCount === 1 ? "" : "s"} already served stay counted.`}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Games in total" hint={`1 to ${SUSPENSION_MAX_GAMES}. At or below games served, it ends now.`}>
            <Input type="number" min={1} max={SUSPENSION_MAX_GAMES} value={games} onChange={(e) => setGames(e.target.value)} />
          </Field>
          <Field label="Reason" hint="Required. Kept on the suspension record and sent to the player.">
            <textarea
              required
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reduced to one game after review"
              className={TEXTAREA}
            />
          </Field>
          {error ? (
            <Alert tone="error">
              {error}
            </Alert>
          ) : null}
          <DialogActions>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || reason.trim().length === 0}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save games"
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}

/** "Lift" on a standing suspension. Reason required; it is kept on the record. */
export function LiftSuspensionButton({
  suspensionId,
  personName,
  label
}: {
  suspensionId: string;
  personName: string;
  /** What is being lifted, e.g. "1 of 2 games left". */
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    const problem = validateLiftReason(reason);
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await gameOps.liftSuspension(suspensionId, reason.trim());
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        variant="outline"
        size="sm"
        className="gap-1.5"
      >
        Lift
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Lift ${personName}'s suspension`}
        description={`Currently: ${label}. The player may play in the next game once lifted.`}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Reason" hint="Required. Kept on the suspension record and sent to the player.">
            <textarea
              required
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Appeal upheld by the league"
              className={TEXTAREA}
            />
          </Field>
          {error ? (
            <Alert tone="error">
              {error}
            </Alert>
          ) : null}
          <DialogActions>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || reason.trim().length === 0}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lifting…
                </>
              ) : (
                "Lift suspension"
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
