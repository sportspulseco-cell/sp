"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import type { TransferRequest } from "@sportspulse/api-client";
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

const STATUS_OPTIONS = [
  { value: "pending_admin", label: "Awaiting admin approval" },
  { value: "pending_destination", label: "Awaiting destination captain" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" }
];

export function TransfersQueue({
  initial
}: {
  initial: { items: TransferRequest[] };
}) {
  const [status, setStatus] = useState("pending_admin");
  const [items, setItems] = useState<TransferRequest[]>(initial.items);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TransferRequest | null>(
    null
  );

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await adminTransfers.list({ status });
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

  async function approve(t: TransferRequest) {
    if (
      !confirm(
        "Approve this transfer? This writes drop + add roster_moves and adjusts both teams' sub-invoices."
      )
    )
      return;
    setBusy(t.id);
    setError(null);
    try {
      await adminTransfers.approve(t.id);
      setFlash(`Transfer ${t.id.slice(0, 8)} approved.`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function reject(t: TransferRequest, reason: string) {
    setBusy(t.id);
    setError(null);
    try {
      await adminTransfers.reject(t.id, reason);
      setFlash(`Transfer ${t.id.slice(0, 8)} rejected.`);
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
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
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
          No transfers in this state.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Player</TH>
              <TH>From</TH>
              <TH>To</TH>
              <TH>Reason</TH>
              <TH>State</TH>
              <TH>Initiated</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((t) => (
              <TR key={t.id}>
                <TD className="font-mono text-[11px] uppercase">
                  {t.personId.slice(0, 8)}
                </TD>
                <TD className="font-mono text-[11px] uppercase">
                  {t.fromTeamId.slice(0, 8)}
                </TD>
                <TD className="font-mono text-[11px] uppercase">
                  {t.toTeamId.slice(0, 8)}
                </TD>
                <TD className="max-w-[280px] truncate text-[12px] text-fg-muted">
                  {t.reason ?? "—"}
                </TD>
                <TD>
                  <Badge tone={statusTone(t.status)}>
                    {t.status.replace(/_/g, " ")}
                  </Badge>
                </TD>
                <TD className="text-[12px] text-fg-muted">
                  {new Date(t.initiatedAt).toLocaleDateString()}
                </TD>
                <TD className="text-right">
                  {t.status === "pending_admin" ? (
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
                  ) : (
                    <ShieldCheck className="ml-auto h-3.5 w-3.5 text-fg-muted" />
                  )}
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
        onConfirm={(reason) => rejectTarget && reject(rejectTarget, reason)}
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
  target: TransferRequest | null;
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
      title="Reject transfer"
      description="The player stays on the source team. Both captains are notified."
    >
      <Field
        label="Reason (min 20 characters)"
        hint="Included verbatim in the captain notification."
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
  if (s === "approved") return "success";
  if (s === "rejected" || s === "cancelled") return "danger";
  if (s === "pending_admin") return "warning";
  return "info";
}
