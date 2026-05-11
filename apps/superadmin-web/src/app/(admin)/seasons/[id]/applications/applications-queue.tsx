"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { adminTransfers } from "@/lib/api/browser-api";

type Item = {
  id: string;
  entryStatus: string;
  createdAt: string;
  teamId: string;
  teamName: string;
  divisionId: string;
  divisionName: string;
};

export function ApplicationsQueue({
  seasonId,
  initial
}: {
  seasonId: string;
  initial: { items: Item[] };
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initial.items);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Item | null>(null);

  async function refresh() {
    try {
      const next = await adminTransfers.listApplications(seasonId);
      setItems(next.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function approve(t: Item) {
    if (!confirm(`Approve ${t.teamName} for ${t.divisionName}?`)) return;
    setBusy(t.id);
    setError(null);
    try {
      await adminTransfers.approveApplication(t.id);
      setFlash(`Approved ${t.teamName} — they're now applied to ${t.divisionName}.`);
      await refresh();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function rejectConfirm(t: Item, reason: string) {
    setBusy(t.id);
    setError(null);
    try {
      await adminTransfers.rejectApplication(t.id, reason);
      setFlash(`Rejected ${t.teamName} — captain notified.`);
      setRejectTarget(null);
      await refresh();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {flash && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {flash}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-bg-subtle px-3 py-8 text-center text-[13px] text-fg-muted">
          No applications pending review for this season.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Team</TH>
              <TH>Division</TH>
              <TH>Applied</TH>
              <TH>State</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((t) => (
              <TR key={t.id}>
                <TD className="font-medium">{t.teamName}</TD>
                <TD>{t.divisionName}</TD>
                <TD className="text-[12px] text-fg-muted">
                  {new Date(t.createdAt).toLocaleDateString()}
                </TD>
                <TD>
                  <Badge tone="warning" mono>
                    {t.entryStatus.replace(/_/g, " ")}
                  </Badge>
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRejectTarget(t)}
                      disabled={busy === t.id}
                    >
                      <X className="mr-1 h-3.5 w-3.5" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => approve(t)}
                      disabled={busy === t.id}
                    >
                      {busy === t.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Check className="mr-1 h-3.5 w-3.5" /> Approve
                        </>
                      )}
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <RejectDialog
        target={rejectTarget}
        busy={busy === rejectTarget?.id}
        onClose={() => setRejectTarget(null)}
        onConfirm={(reason) => rejectTarget && rejectConfirm(rejectTarget, reason)}
      />
    </div>
  );
}

function RejectDialog({
  target,
  busy,
  onClose,
  onConfirm
}: {
  target: Item | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!target) setReason("");
  }, [target]);
  if (!target) return null;
  return (
    <Dialog
      open={true}
      onClose={onClose}
      title={`Reject ${target.teamName}`}
      description={`Captain sees this reason verbatim. They can re-apply to a different division in ${target.divisionName ? "this season" : "the season"} immediately.`}
    >
      <Field label="Reason (min 10 characters)" hint="Required.">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <DialogActions>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={() => onConfirm(reason)}
          disabled={reason.trim().length < 10 || busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
