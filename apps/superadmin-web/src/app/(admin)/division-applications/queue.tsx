"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { adminTransfers } from "@/lib/api/browser-api";

type DteItem = {
  id: string;
  entryStatus: string;
  invoiceId: string | null;
  collectedCents: number;
  thresholdCents: number;
  teamId: string;
  teamName: string;
  divisionId: string;
  divisionName: string;
  seasonId: string;
  seasonName: string;
  orgId: string;
  createdAt: string;
};

const STATUS_OPTIONS = [
  // Captain-rollover applies land in pending_approval; this is the
  // primary admin action queue. The list endpoint accepts comma-
  // separated states, so we bundle pending_approval + applied as the
  // default "needs decision" filter (BUG-025).
  {
    value: "pending_approval,applied",
    label: "Needs decision (pending_approval + applied)"
  },
  { value: "pending_approval", label: "Pending approval" },
  { value: "applied", label: "Applied — awaiting threshold or admin" },
  { value: "accepted", label: "Accepted" },
  { value: "confirmed", label: "Confirmed" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "disqualified", label: "Disqualified" }
];

export function DivisionApplicationsQueue({
  initial
}: {
  initial: { items: DteItem[] };
}) {
  const [status, setStatus] = useState("pending_approval,applied");
  const [items, setItems] = useState<DteItem[]>(initial.items);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DteItem | null>(null);

  async function confirmApprove(t: DteItem) {
    setBusy(t.id);
    setError(null);
    try {
      await adminTransfers.approveApplication(t.id);
      setFlash(
        `Approved ${t.teamName} → ${t.divisionName}. Captain can now run the rollover wizard.`
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await adminTransfers.listDivisionEntries({ status });
      setItems(res.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function confirmReject(t: DteItem, reason: string) {
    setBusy(t.id);
    setError(null);
    try {
      await adminTransfers.rejectDivisionEntry(t.id, reason);
      setFlash(
        `Rejected ${t.teamName} → ${t.divisionName}. Invoices voided; paid subs queued for refund assessment.`
      );
      setRejectTarget(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2 rounded-md border border-border bg-bg-subtle p-3">
        <div className="grid w-full max-w-xs gap-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            Status
          </label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
      </div>

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
          No applications in this state.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Team</TH>
              <TH>Division</TH>
              <TH>Season</TH>
              <TH>Threshold</TH>
              <TH>State</TH>
              <TH>Submitted</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((t) => {
              const pct = t.thresholdCents
                ? Math.min(
                    100,
                    Math.round((t.collectedCents / t.thresholdCents) * 100)
                  )
                : 0;
              return (
                <TR key={t.id}>
                  <TD className="font-medium">{t.teamName}</TD>
                  <TD>{t.divisionName}</TD>
                  <TD className="text-fg-muted">{t.seasonName}</TD>
                  <TD>
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-[11px] tabular-nums">
                        ${(t.collectedCents / 100).toFixed(2)} / $
                        {(t.thresholdCents / 100).toFixed(2)}
                      </span>
                      <div className="h-1 w-32 overflow-hidden rounded-full bg-bg-subtle">
                        <div
                          className="h-full bg-accent transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <Badge tone={statusTone(t.entryStatus)}>
                      {t.entryStatus}
                    </Badge>
                  </TD>
                  <TD className="text-[12px] text-fg-muted">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </TD>
                  <TD className="text-right">
                    {t.entryStatus === "pending_approval" ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => confirmApprove(t)}
                          disabled={busy === t.id}
                        >
                          {busy === t.id ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="mr-1 h-3.5 w-3.5" />
                          )}
                          Approve
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRejectTarget(t)}
                          disabled={busy === t.id}
                        >
                          <X className="mr-1 h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    ) : t.entryStatus === "applied" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRejectTarget(t)}
                        disabled={busy === t.id}
                      >
                        <X className="mr-1 h-3.5 w-3.5" /> Reject
                      </Button>
                    ) : (
                      <span className="font-mono text-[10px] uppercase text-fg-muted">
                        no actions
                      </span>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      <RejectDialog
        target={rejectTarget}
        busy={busy === rejectTarget?.id}
        onClose={() => setRejectTarget(null)}
        onConfirm={(reason) =>
          rejectTarget && confirmReject(rejectTarget, reason)
        }
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
  target: DteItem | null;
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
      description={`This voids the master + sub invoices for ${target.divisionName}. Any paid sub-invoice queues a refund assessment for review.`}
    >
      <Field
        label="Reason (min 20 characters)"
        hint="Captain sees this verbatim in DIVISION_APPLICATION_REJECTED."
      >
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <DialogActions>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={() => onConfirm(reason)}
          disabled={reason.trim().length < 20 || busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function statusTone(
  s: string
): "neutral" | "success" | "warning" | "danger" | "info" {
  if (s === "confirmed") return "success";
  if (s === "rejected" || s === "disqualified") return "danger";
  if (s === "applied" || s === "pending_approval") return "warning";
  if (s === "withdrawn") return "neutral";
  return "info";
}
