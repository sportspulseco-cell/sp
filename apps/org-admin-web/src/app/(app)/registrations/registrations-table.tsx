"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import {
  Badge,
  Button,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import { orgAdminRegistrations } from "@/lib/api/browser-api";

interface Item {
  id: string;
  subjectPersonId: string;
  status: string;
  submittedAt: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "draft";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function statusTone(s: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (s === "approved") return "success";
  if (s === "rejected" || s === "withdrawn" || s === "cancelled") return "danger";
  if (s.startsWith("pending") || s === "submitted") return "warning";
  return "info";
}

function isReviewable(s: string): boolean {
  return s === "submitted" || s.startsWith("pending");
}

export function RegistrationsTable({ items }: { items: Item[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, action: "approve" | "reject", reason?: string) {
    setError(null);
    setBusy(id);
    try {
      await orgAdminRegistrations.review(id, { action, reason });
      setOpenId(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-600 dark:text-red-300">
          {error}
        </div>
      ) : null}
      <Table>
        <THead>
          <TR>
            <TH>Reference</TH>
            <TH>Subject</TH>
            <TH>Status</TH>
            <TH>Submitted</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {items.map((r) => (
            <TR key={r.id}>
              <TD className="font-mono text-[11px] text-fg-muted">
                {r.id.slice(0, 8)}
              </TD>
              <TD className="font-mono text-[11px] text-fg-muted">
                {r.subjectPersonId.slice(0, 8)}
              </TD>
              <TD>
                <Badge mono tone={statusTone(r.status)}>
                  {r.status.replace(/_/g, " ")}
                </Badge>
              </TD>
              <TD className="text-[12px] text-fg-muted">
                {fmtDate(r.submittedAt)}
              </TD>
              <TD className="text-right">
                {isReviewable(r.status) ? (
                  openId === r.id ? (
                    <RejectReason
                      onCancel={() => setOpenId(null)}
                      onSubmit={(reason) => decide(r.id, "reject", reason)}
                      busy={busy === r.id}
                    />
                  ) : (
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => decide(r.id, "approve")}
                        disabled={busy === r.id}
                      >
                        {busy === r.id ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" strokeWidth={2} />
                        ) : (
                          <Check className="mr-1 h-3 w-3" strokeWidth={2} />
                        )}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOpenId(r.id)}
                        disabled={busy === r.id}
                        className="text-red-600 hover:bg-red-500/10 dark:text-red-400"
                      >
                        <X className="mr-1 h-3 w-3" strokeWidth={2} />
                        Reject
                      </Button>
                    </div>
                  )
                ) : (
                  <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    —
                  </span>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function RejectReason({
  onCancel,
  onSubmit,
  busy
}: {
  onCancel: () => void;
  onSubmit: (reason: string) => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="flex items-center justify-end gap-2">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        disabled={busy}
        maxLength={500}
        className="h-8 w-48 rounded-md border border-border bg-surface-1 px-2 text-[12px] text-fg placeholder:text-fg-muted focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50"
      />
      <Button
        size="sm"
        onClick={() => onSubmit(reason.trim())}
        disabled={busy}
        className="text-red-600 dark:text-red-400"
      >
        {busy ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" strokeWidth={2} />
        ) : null}
        Confirm
      </Button>
      <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
    </div>
  );
}
