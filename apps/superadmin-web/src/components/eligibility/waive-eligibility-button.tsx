"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { compliance } from "@/lib/api/browser-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@sportspulse/ui";

export function WaiveEligibilityButton({ id }: { id: string }) {
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
      await compliance.waiveEligibility(id, reason);
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
        Waive
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Waive eligibility"
        description="Admin override. Record a reason that's auditable."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            label="Reason"
            htmlFor="waive-reason"
            hint="Required. Will appear on the audit trail."
          >
            <Input
              id="waive-reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Birth certificate verified offline"
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
            <Button type="submit" disabled={loading || !reason}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Waiving…
                </>
              ) : (
                "Waive eligibility"
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
