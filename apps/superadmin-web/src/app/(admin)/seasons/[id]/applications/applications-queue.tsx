"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Eye, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { adminTransfers } from "@/lib/api/browser-api";

type Item = {
  id: string;
  entryStatus: string;
  createdAt: string;
  teamId: string;
  teamName: string;
  teamShortName: string | null;
  teamColors: Record<string, unknown> | null;
  teamOrgId: string;
  captainUserId: string | null;
  captainName: string | null;
  captainEmail: string | null;
  divisionId: string;
  divisionName: string;
  divisionMaxTeams: number | null;
  divisionCurrentTeamCount: number;
};

type Initial = {
  season: {
    id: string;
    name: string;
    registrationClosesAt: string | null;
  };
  divisions: Array<{
    id: string;
    name: string;
    maxTeams: number | null;
    currentTeamCount: number;
  }>;
  items: Item[];
};

type StatusFilter = "pending" | "all" | "approved" | "rejected";

export function ApplicationsQueue({
  seasonId,
  initial
}: {
  seasonId: string;
  initial: Initial;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initial.items);
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Item | null>(null);

  async function refresh(status: StatusFilter = statusFilter) {
    try {
      const next = await adminTransfers.listApplications(seasonId, status);
      setItems(next.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (statusFilter !== "pending") {
      void refresh(statusFilter);
    } else {
      setItems(initial.items);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filtered = useMemo(() => {
    if (divisionFilter === "all") return items;
    return items.filter((i) => i.divisionId === divisionFilter);
  }, [items, divisionFilter]);

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

  const pendingCount = items.filter(
    (i) => i.entryStatus === "pending_approval"
  ).length;

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

      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Divisions"
          value={divisionFilter}
          onChange={setDivisionFilter}
          options={[
            { value: "all", label: "All divisions" },
            ...initial.divisions.map((d) => ({
              value: d.id,
              label: d.name
            }))
          ]}
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={[
            { value: "pending", label: "Pending only" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Denied" },
            { value: "all", label: "All states" }
          ]}
        />
      </div>

      <p className="text-[13px] text-fg-muted">
        {filtered.length}{" "}
        {statusFilter === "pending"
          ? `pending application${filtered.length === 1 ? "" : "s"}`
          : `application${filtered.length === 1 ? "" : "s"}`}
        {statusFilter === "all" && pendingCount > 0 && (
          <span className="ml-1">
            (<span className="font-medium text-fg">{pendingCount} pending</span>)
          </span>
        )}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-bg-subtle px-3 py-10 text-center text-[13px] text-fg-muted">
          No applications match this filter.
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((t) => (
            <li key={t.id}>
              <ApplicationCard
                item={t}
                busy={busy === t.id}
                onApprove={() => approve(t)}
                onReject={() => setRejectTarget(t)}
              />
            </li>
          ))}
        </ul>
      )}

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

function ApplicationCard({
  item,
  busy,
  onApprove,
  onReject
}: {
  item: Item;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const max = item.divisionMaxTeams;
  const current = item.divisionCurrentTeamCount;
  const full = max != null && current >= max;
  const spotsLeft = max != null ? Math.max(0, max - current) : null;
  const isPending = item.entryStatus === "pending_approval";
  const initials = teamInitials(item.teamName, item.teamShortName);
  const colorTone =
    item.teamColors && typeof item.teamColors === "object"
      ? extractColor(item.teamColors)
      : null;

  return (
    <article
      className={[
        "rounded-xl border p-5 transition",
        isPending
          ? "border-amber-400/40 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/15"
          : "border-border bg-surface-1"
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar initials={initials} tone={colorTone} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold tracking-tight text-fg">
              {item.teamName}
            </p>
            <p className="mt-0.5 truncate text-[12px] text-fg-muted">
              {item.captainName ? `Captain: ${item.captainName}` : "Captain: —"}
              {item.captainEmail && (
                <>
                  {" · "}
                  <a
                    href={`mailto:${item.captainEmail}`}
                    className="hover:text-fg hover:underline"
                  >
                    {item.captainEmail}
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
        <StatusBadge status={item.entryStatus} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label="Division applied">
          <Link
            href={`/divisions/${item.divisionId}`}
            className="text-[13px] font-medium text-fg hover:text-accent hover:underline"
            title={`Open ${item.divisionName} detail`}
          >
            {item.divisionName}
          </Link>
          {full && (
            <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-3 w-3" strokeWidth={1.75} /> Full
            </p>
          )}
        </Field>
        <Field label="Team capacity">
          <p
            className={[
              "text-[13px] font-medium",
              full ? "text-rose-600 dark:text-rose-400" : "text-fg"
            ].join(" ")}
          >
            {max != null ? `${current} / ${max}` : `${current}`}
          </p>
          {spotsLeft != null && (
            <p
              className={[
                "mt-0.5 text-[11px]",
                full ? "text-rose-600 dark:text-rose-400" : "text-fg-muted"
              ].join(" ")}
            >
              {full
                ? "0 spots left"
                : `${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left`}
            </p>
          )}
        </Field>
        <Field label="Applied">
          <p className="text-[13px] font-medium text-fg">
            {formatDate(item.createdAt)}
          </p>
        </Field>
        <div className="flex items-center gap-1.5">
          <Link
            href={`/teams/${item.teamId}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-bg text-fg-muted hover:bg-bg-subtle hover:text-fg"
            title="View team"
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Link>
          {isPending ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={onReject}
                disabled={busy}
              >
                <X className="mr-1 h-3.5 w-3.5" /> Deny
              </Button>
              <Button
                size="sm"
                onClick={onApprove}
                disabled={busy || full}
                title={
                  full
                    ? "This division is full — cannot approve until a slot opens."
                    : undefined
                }
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Check className="mr-1 h-3.5 w-3.5" /> Approve
                  </>
                )}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Avatar({
  initials,
  tone
}: {
  initials: string;
  tone: string | null;
}) {
  return (
    <span
      className={[
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-semibold uppercase tracking-tight",
        tone ?? "bg-accent/15 text-accent ring-1 ring-accent/30"
      ].join(" ")}
    >
      {initials}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: "warning" | "success" | "danger" | "neutral"; label: string }> = {
    pending_approval: { tone: "warning", label: "pending approval" },
    applied: { tone: "success", label: "applied" },
    accepted: { tone: "success", label: "accepted" },
    confirmed: { tone: "success", label: "confirmed" },
    rejected: { tone: "danger", label: "denied" },
    withdrawn: { tone: "neutral", label: "withdrawn" }
  };
  const entry = map[status] ?? { tone: "neutral" as const, label: status };
  return (
    <Badge tone={entry.tone} mono>
      {entry.label}
    </Badge>
  );
}

function FilterSelect({
  label: _label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-border bg-bg px-3 py-2 text-[13px] text-fg focus:border-accent focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </p>
      <div className="mt-1">{children}</div>
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
      title={`Deny ${target.teamName}`}
      description={`Captain sees this reason verbatim. They can re-apply to a different division in ${target.divisionName ? "this season" : "the season"} immediately.`}
    >
      <DialogField label="Reason (min 10 characters)" hint="Required.">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </DialogField>
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

function DialogField({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] font-medium text-fg">{label}</p>
      {children}
      {hint && <p className="text-[11px] text-fg-muted">{hint}</p>}
    </div>
  );
}

function teamInitials(name: string, shortName: string | null) {
  if (shortName && shortName.length <= 4) return shortName.toUpperCase();
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function extractColor(_colors: Record<string, unknown>): string | null {
  // Could map team colour palette → tailwind class in a follow-up;
  // for now stick with the neutral accent ring so every avatar stays
  // legible against the queue background.
  return null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}
