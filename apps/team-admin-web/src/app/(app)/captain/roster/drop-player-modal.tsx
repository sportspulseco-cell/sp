"use client";

import { useEffect, useState } from "react";
import { Loader2, UserMinus } from "lucide-react";
import { Alert, Button, Dialog, DialogActions } from "@sportspulse/ui";
import { captain } from "@/lib/api/browser-api";

type Target = {
  id: string;
  personId: string;
  personFirstName: string | null;
  personLastName: string | null;
} | null;

const MIN_CHARS = 20;

export function DropPlayerModal({
  target,
  teamId,
  seasonId,
  onClose,
  onDropped
}: {
  target: Target;
  teamId: string;
  seasonId: string | null;
  onClose: () => void;
  onDropped: (msg: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setReason("");
      setError(null);
    }
  }, [target]);

  if (!target || !seasonId) return null;

  const name =
    [target.personFirstName, target.personLastName].filter(Boolean).join(" ") ||
    "Unknown player";
  const charsLeft = Math.max(0, MIN_CHARS - reason.trim().length);
  const canSubmit = reason.trim().length >= MIN_CHARS && !busy;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await captain.roster.drop(teamId, {
        seasonId: seasonId!,
        personId: target!.personId,
        reason: reason.trim()
      });
      const note = res.refundAssessment
        ? `Refund will be assessed by your league admin.`
        : res.voidedInvoiceId
          ? `Sub-invoice voided (no payment recorded).`
          : `Player removed.`;
      onDropped(`Removed ${name}. ${note}`);
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
      title={`Remove ${name} from roster`}
      description="A written reason is required. The player will be notified and any paid dues sent to the league admin for refund assessment."
    >
      <div className="space-y-3">
        <label className="grid gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Reason for removal (required, min {MIN_CHARS} chars)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="e.g. Player notified me they're moving out of state and unable to commit."
            className="w-full rounded-md border border-border bg-surface-1 p-2 text-sm text-fg focus:border-accent focus:outline-none"
          />
          <span className="font-mono text-[10px] text-fg-muted">
            {charsLeft > 0
              ? `${charsLeft} character${charsLeft === 1 ? "" : "s"} until minimum`
              : `${reason.trim().length} / ${MIN_CHARS} minimum met`}
          </span>
        </label>

        <Alert tone="warning">
          If this player has paid any amount, a refund will be assessed by the
          league admin. No immediate refund is issued.
        </Alert>

        {error && (
          <Alert tone="error">
            {error}
          </Alert>
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
                <UserMinus className="mr-2 h-4 w-4" /> Confirm drop
              </>
            )}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}
