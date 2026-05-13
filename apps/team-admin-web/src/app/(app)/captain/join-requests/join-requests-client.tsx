"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Mail, X } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogActions
} from "@sportspulse/ui";
import { registration } from "@/lib/api/browser-api";

type Item = {
  id: string;
  status: string;
  appliedAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
  message: string | null;
  seasonId: string | null;
  playerPersonId: string;
  playerName: string | null;
  playerEmail: string | null;
};

export function JoinRequestsClient({
  teamId,
  initial
}: {
  teamId: string;
  initial: Item[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Item | null>(null);

  async function approve(item: Item) {
    if (!confirm(`Add ${item.playerName ?? "this player"} to the roster?`)) return;
    setBusy(item.id);
    setError(null);
    try {
      await registration.captainDecideJoinRequest(item.id, {
        action: "approve"
      });
      setItems((arr) => arr.filter((i) => i.id !== item.id));
      setFlash(`Approved ${item.playerName ?? "player"}.`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function rejectConfirm(item: Item, reason: string) {
    setBusy(item.id);
    setError(null);
    try {
      await registration.captainDecideJoinRequest(item.id, {
        action: "reject",
        reason: reason.trim() || undefined
      });
      setItems((arr) => arr.filter((i) => i.id !== item.id));
      setRejectTarget(null);
      setFlash(`Denied ${item.playerName ?? "player"} — they'll be notified.`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  void teamId;

  return (
    <div className="space-y-3">
      {flash && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {flash}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {items.map((item) => {
          const initials = (item.playerName ?? "??")
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase() || "??";
          return (
            <li
              key={item.id}
              className="rounded-xl border border-amber-400/40 bg-amber-50/40 p-5 dark:border-amber-700/40 dark:bg-amber-950/20"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-[12px] font-semibold uppercase text-accent">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold tracking-tight text-fg">
                      {item.playerName ?? "(unknown player)"}
                    </p>
                    {item.playerEmail && (
                      <p className="mt-0.5 text-[12px] text-fg-muted">
                        <a
                          href={`mailto:${item.playerEmail}`}
                          className="hover:text-fg hover:underline"
                        >
                          <Mail className="mr-0.5 inline h-3 w-3" />
                          {item.playerEmail}
                        </a>
                      </p>
                    )}
                    {item.message && (
                      <p className="mt-2 rounded-md border border-border bg-bg px-3 py-2 text-[13px] text-fg">
                        “{item.message}”
                      </p>
                    )}
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                      Applied{" "}
                      {new Date(item.appliedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge tone="warning" mono>
                    pending
                  </Badge>
                  <div className="flex gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRejectTarget(item)}
                      disabled={busy === item.id}
                    >
                      <X className="mr-1 h-3.5 w-3.5" strokeWidth={1.75} />
                      Deny
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => approve(item)}
                      disabled={busy === item.id}
                    >
                      {busy === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Check className="mr-1 h-3.5 w-3.5" strokeWidth={1.75} />
                          Approve
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <RejectDialog
        target={rejectTarget}
        busy={busy === rejectTarget?.id}
        onClose={() => setRejectTarget(null)}
        onConfirm={(reason) =>
          rejectTarget && rejectConfirm(rejectTarget, reason)
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
      title={`Deny ${target.playerName ?? "player"}`}
      description="Optionally tell the player why so they know whether to try a different team. The reason is visible to the player verbatim."
    >
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="Reason (optional)"
        className="w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px] text-fg focus:border-accent focus:outline-none"
      />
      <DialogActions>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => onConfirm(reason)} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Deny"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
