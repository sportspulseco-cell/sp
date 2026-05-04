"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, ListTodo, X } from "lucide-react";
import { registration } from "@/lib/api/browser-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

export function ReviewActions({
  id,
  status
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canStart =
    status === "submitted" || status === "draft" || status === "waitlisted";
  const canApprove = ["submitted", "under_review", "waitlisted"].includes(status);
  const canReject = ["submitted", "under_review", "waitlisted"].includes(status);
  const canWaitlist = ["submitted", "under_review"].includes(status);

  function review(action: "approve" | "start_review" | "waitlist", reason?: string) {
    setError(null);
    start(async () => {
      try {
        await registration.reviewRegistration(id, { action, reason });
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function reject() {
    if (!reason.trim()) {
      setError("Reason required");
      return;
    }
    setError(null);
    start(async () => {
      try {
        await registration.reviewRegistration(id, {
          action: "reject",
          reason
        });
        setRejectOpen(false);
        setReason("");
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="flex justify-end gap-1">
      {canStart ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => review("start_review")}
          title="Start review"
        >
          <Clock className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {canWaitlist ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => review("waitlist")}
          title="Waitlist"
        >
          <ListTodo className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {canApprove ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => review("approve")}
          title="Approve"
          className="text-emerald-600 hover:text-emerald-700"
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {canReject ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setRejectOpen(true)}
          title="Reject"
          className="text-rose-600 hover:text-rose-700"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}

      <Dialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject registration"
        description="Provide a reason — it will be recorded and visible to the registrant."
        size="sm"
      >
        <Field label="Reason" htmlFor="reason">
          <Input
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Eligibility verification failed"
          />
        </Field>
        {error ? (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        ) : null}
        <DialogActions>
          <Button variant="ghost" onClick={() => setRejectOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending} onClick={reject}>
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
