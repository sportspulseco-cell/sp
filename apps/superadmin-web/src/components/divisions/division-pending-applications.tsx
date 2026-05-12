"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { adminTransfers } from "@/lib/api/browser-api";

type PendingApplication = {
  id: string;
  entryStatus: string;
  createdAt: string;
  teamId: string;
  teamName: string;
  captainUserId: string | null;
  captainName: string | null;
  captainEmail: string | null;
  divisionId: string;
  divisionName: string;
  divisionMaxTeams: number | null;
  divisionCurrentTeamCount: number;
};

export function DivisionPendingApplications({
  divisionId,
  divisionName,
  initial
}: {
  divisionId: string;
  divisionName: string;
  initial: PendingApplication[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<PendingApplication[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingApplication | null>(
    null
  );

  async function approve(t: PendingApplication) {
    if (!confirm(`Approve ${t.teamName} for ${divisionName}?`)) return;
    setBusy(t.id);
    setError(null);
    try {
      await adminTransfers.approveApplication(t.id);
      setFlash(`Approved ${t.teamName}.`);
      setItems((arr) => arr.filter((i) => i.id !== t.id));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function rejectConfirm(t: PendingApplication, reason: string) {
    setBusy(t.id);
    setError(null);
    try {
      await adminTransfers.rejectApplication(t.id, reason);
      setFlash(`Denied ${t.teamName} — captain notified.`);
      setItems((arr) => arr.filter((i) => i.id !== t.id));
      setRejectTarget(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-400/40 bg-amber-50/40 p-6 dark:border-amber-700/40 dark:bg-amber-950/20">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-amber-700 dark:text-amber-300">
            // pending applications
          </p>
          <p className="mt-1 text-[14px] font-semibold tracking-tight text-fg">
            {items.length} captain{items.length === 1 ? "" : "s"} waiting on
            your review
          </p>
        </div>
      </header>

      {flash && (
        <p className="mt-3 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {flash}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {items.map((t) => {
          const max = t.divisionMaxTeams;
          const current = t.divisionCurrentTeamCount;
          const full = max != null && current >= max;
          const spotsLeft = max != null ? Math.max(0, max - current) : null;
          const initials = (t.teamName ?? "??")
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();
          return (
            <li
              key={t.id}
              className="rounded-md border border-border bg-bg p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 font-mono text-[11px] font-semibold uppercase text-accent">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold tracking-tight text-fg">
                      <Link href={`/teams/${t.teamId}`} className="hover:underline">
                        {t.teamName}
                      </Link>
                    </p>
                    <p className="mt-0.5 text-[12px] text-fg-muted">
                      {t.captainName ? `Captain: ${t.captainName}` : "Captain: —"}
                      {t.captainEmail && (
                        <>
                          {" · "}
                          <a
                            href={`mailto:${t.captainEmail}`}
                            className="hover:text-fg hover:underline"
                          >
                            <Mail className="mr-0.5 inline h-3 w-3" />
                            {t.captainEmail}
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <Badge tone="warning" mono>
                  pending approval
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-3">
                  <Stat
                    label="Team capacity"
                    value={max != null ? `${current} / ${max}` : `${current}`}
                    tone={full ? "rose" : "neutral"}
                  />
                  <Stat
                    label="Spots left"
                    value={
                      spotsLeft == null
                        ? "—"
                        : full
                          ? "0 — full"
                          : `${spotsLeft}`
                    }
                    tone={full ? "rose" : "neutral"}
                  />
                  <Stat
                    label="Applied"
                    value={new Date(t.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric"
                    })}
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRejectTarget(t)}
                    disabled={busy === t.id}
                  >
                    <X className="mr-1 h-3.5 w-3.5" strokeWidth={1.75} />
                    Deny
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => approve(t)}
                    disabled={busy === t.id || full}
                    title={
                      full
                        ? "Division is full — open a spot before approving."
                        : undefined
                    }
                  >
                    {busy === t.id ? (
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
    </section>
  );
}

function Stat({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "rose" | "neutral";
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </p>
      <p
        className={
          "mt-0.5 text-[13px] font-medium " +
          (tone === "rose"
            ? "text-rose-600 dark:text-rose-400"
            : "text-fg")
        }
      >
        {value}
      </p>
    </div>
  );
}

function RejectDialog({
  target,
  busy,
  onClose,
  onConfirm
}: {
  target: PendingApplication | null;
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
      title={`Deny ${target.teamName}`}
      description={`Captain sees this reason verbatim. They can re-apply to a different division in this season immediately.`}
    >
      <label className="space-y-1.5 block">
        <p className="text-[12px] font-medium text-fg">
          Reason (min 10 characters)
        </p>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        <p className="text-[11px] text-fg-muted">Required.</p>
      </label>
      <DialogActions>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={() => onConfirm(reason)}
          disabled={reason.trim().length < 10 || busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Deny"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
