"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Paperclip, X } from "lucide-react";
import { Alert, Badge, Button, TBody, TD, TH, THead, TR, Table, LocalDate, Input } from "@sportspulse/ui";
import { orgAdminRegistrations, registrationV2Admin } from "@/lib/api/browser-api";
import { canAdminDecide, registrationWaitingOn } from "@sportspulse/kernel";

interface Item {
  id: string;
  name: string | null;
  email: string | null;
  season: string | null;
  status: string;
  submittedAt: string | null;
  /** Files uploaded on the registration form (FR-3.4.5). */
  files: Array<{ key: string; fileName: string }>;
}

function fmtDate(iso: string | null) {
  if (!iso) return "draft";
  return <LocalDate iso={iso} format="date" />;
}

// Approve / Reject only where the state rules allow them; a "pending
// payment" row is the player's move, not the admin's (the API refused it
// with "Illegal registration transition").
function isReviewable(s: string): boolean {
  return s === "submitted" || canAdminDecide(s).approve;
}

export function RegistrationsTable({ items }: { items: Item[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The status the server returned for a decision, shown at once. A
  // refresh that started while the page's link prefetches were in flight
  // was sometimes dropped, leaving "pending review" on an approved row.
  const [decided, setDecided] = useState<Record<string, string>>({});

  // Same signed link the super admin review dialog opens (5 minutes).
  async function openFile(id: string, key: string) {
    setError(null);
    try {
      const link = await registrationV2Admin.fileLink(id, key);
      window.open(link.url, "_blank", "noopener");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function decide(id: string, action: "approve" | "reject", reason?: string) {
    setError(null);
    setBusy(id);
    try {
      const res = await orgAdminRegistrations.review(id, { action, reason });
      setDecided((d) => ({ ...d, [id]: res.status }));
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
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Table>
        <THead>
          <TR>
            <TH>Player</TH>
            <TH>Email</TH>
            <TH>Season</TH>
            <TH>Status</TH>
            <TH>Submitted</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {items.map((row) => {
            const r = decided[row.id] ? { ...row, status: decided[row.id]! } : row;
            return (
            <TR key={r.id}>
              <TD className="text-[13px] font-medium text-fg">
                {r.name ?? "Unnamed"}
                {r.files.length > 0 ? (
                  <div className="mt-1 flex flex-col items-start gap-0.5">
                    {r.files.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => openFile(r.id, f.key)}
                        className="inline-flex items-center gap-1 text-[11px] font-normal text-accent underline"
                      >
                        <Paperclip className="h-3 w-3" strokeWidth={1.75} />
                        Open {f.fileName}
                      </button>
                    ))}
                  </div>
                ) : null}
              </TD>
              <TD className="text-[12px] text-fg-muted">{r.email ?? "Not provided"}</TD>
              <TD className="text-[12px] text-fg-muted">{r.season ?? "No season"}</TD>
              <TD>
                <Badge status={r.status} />
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
                        className="text-[var(--tint-rose-fg)] hover:bg-[var(--tint-rose-bg)]"
                      >
                        <X className="mr-1 h-3 w-3" strokeWidth={2} />
                        Reject
                      </Button>
                    </div>
                  )
                ) : (
                  <span className="text-[12px] text-fg-muted">{registrationWaitingOn(r.status) ?? "—"}</span>
                )}
              </TD>
            </TR>
            );
          })}
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
      <Input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        disabled={busy}
        maxLength={500}
        className="h-8 w-48 px-2 text-[12px]"
      />
      <Button
        size="sm"
        onClick={() => onSubmit(reason.trim())}
        disabled={busy}
        className="text-[var(--tint-rose-fg)]"
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
