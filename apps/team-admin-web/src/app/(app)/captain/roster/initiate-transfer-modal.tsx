"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { Button, Dialog, DialogActions } from "@sportspulse/ui";
import type { Team } from "@sportspulse/api-client";
import { captain, leagueMgmt } from "@/lib/api/browser-api";

type Target = {
  id: string;
  personId: string;
  personFirstName: string | null;
  personLastName: string | null;
} | null;

const MIN_CHARS = 20;

/**
 * Workflow 7B · Case 6 step 1 — source captain initiates a transfer.
 * Creates a transfer_requests row in `pending_destination`. The
 * destination captain must accept before an admin can approve.
 */
export function InitiateTransferModal({
  target,
  fromTeamId,
  seasonId,
  onClose,
  onInitiated
}: {
  target: Target;
  fromTeamId: string;
  seasonId: string | null;
  onClose: () => void;
  onInitiated: (msg: string) => void;
}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [toTeamId, setToTeamId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setReason("");
      setToTeamId("");
      setError(null);
    }
  }, [target]);

  useEffect(() => {
    if (!target) return;
    leagueMgmt
      .listTeams({ status: "active" })
      .then((page) =>
        setTeams(page.items.filter((t) => t.id !== fromTeamId))
      )
      .catch(() => setTeams([]));
  }, [target, fromTeamId]);

  if (!target || !seasonId) return null;

  const name =
    [target.personFirstName, target.personLastName].filter(Boolean).join(" ") ||
    target.personId.slice(0, 8);
  const charsLeft = Math.max(0, MIN_CHARS - reason.trim().length);
  const canSubmit =
    !busy && !!toTeamId && reason.trim().length >= MIN_CHARS;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await captain.roster.transfers.initiate(fromTeamId, {
        personId: target!.personId,
        toTeamId,
        reason: reason.trim()
      });
      onInitiated(`Transfer request sent. ${name} stays on your roster until approved.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={true}
      onClose={onClose}
      title={`Initiate transfer · ${name}`}
      description="The destination captain must accept first; a league admin gives the final approval. Player stays on your roster meanwhile."
      size="lg"
    >
      <div className="space-y-3">
        <label className="grid gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Destination team
          </span>
          <select
            value={toTeamId}
            onChange={(e) => setToTeamId(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
          >
            <option value="">— pick a team —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Reason (required, min {MIN_CHARS} chars)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="e.g. Player asked to move closer to home / position fit on the other team's lineup."
            className="w-full rounded-md border border-border bg-surface-1 p-2 text-sm text-fg focus:border-accent focus:outline-none"
          />
          <span className="font-mono text-[10px] text-fg-muted">
            {charsLeft > 0
              ? `${charsLeft} character${charsLeft === 1 ? "" : "s"} until minimum`
              : `${reason.trim().length} / ${MIN_CHARS} minimum met`}
          </span>
        </label>

        {error && (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        <DialogActions>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!canSubmit}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <ArrowRightLeft className="mr-2 h-4 w-4" /> Send request
              </>
            )}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}
