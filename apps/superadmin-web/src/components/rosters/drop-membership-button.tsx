"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { roster } from "@/lib/api/browser-api";
import { Button, Dialog, DialogActions, Field, Input, Alert } from "@sportspulse/ui";

export function DropMembershipButton({
  teamId,
  personId,
  seasonId
}: {
  teamId: string;
  personId: string;
  seasonId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await roster.drop({
        teamId,
        personId,
        seasonId,
        reason: reason || undefined
      });
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
        className="gap-1.5 hover:border-[var(--tint-rose-fg)]/50 hover:text-[var(--tint-rose-fg)]"
      >
        Drop
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Drop from roster"
        description="Append a roster move (kind: drop). The current membership closes; the move stays in the event log forever."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            label="Reason"
            htmlFor="dm-reason"
            hint="Optional but recommended. Appears in the audit trail."
          >
            <Input
              id="dm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Released / season-end / disciplinary / …"
            />
          </Field>
          {error ? (
            <Alert tone="error">
              {error}
            </Alert>
          ) : null}
          <DialogActions>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Dropping…
                </>
              ) : (
                "Drop player"
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
