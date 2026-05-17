"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { Badge, Button } from "@sportspulse/ui";
import type { Division, Registration } from "@sportspulse/api-client";
import { useFormsBuilderApi } from "./context";
import { SectionHeader } from "./section-header";

const STATUS_TONE: Record<
  string,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  approved: "success",
  rejected: "danger",
  withdrawn: "neutral",
  cancelled: "neutral",
  draft: "neutral",
  submitted: "info",
  under_review: "info",
  pending_payment: "warning",
  pending_consent: "warning",
  pending_verification: "warning",
  pending_review: "warning",
  pending_offline: "warning",
  incomplete: "warning",
  waitlisted: "info"
};

function statusLabel(status: string): string {
  // The mockup shows "approved" / "pending review" / "pending payment".
  if (status === "under_review" || status === "pending_review") return "pending review";
  if (status === "pending_payment") return "pending payment";
  if (status === "pending_consent") return "pending consent";
  if (status === "pending_verification") return "pending verification";
  return status.replace(/_/g, " ");
}

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "approved", label: "Approved only" },
  { value: "pending_review", label: "Pending review" },
  { value: "pending_payment", label: "Pending payment" },
  { value: "rejected", label: "Rejected" }
] as const;

/**
 * Mockup's Submissions panel. Status dropdown filter + CSV export +
 * row actions (Approve, Reject, Email). Hits registration.reviewRegistration
 * via the injected SDK context.
 */
export function SubmissionsClient({
  registrations,
  divisions
}: {
  registrations: Registration[];
  divisions: Division[];
}) {
  const { registration: regApi } = useFormsBuilderApi();
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]["value"]>(
    "all"
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = registrations.length;
  const pendingCount = registrations.filter(
    (r) =>
      r.status === "submitted" ||
      r.status === "under_review" ||
      r.status === "pending_review" ||
      r.status === "pending_payment"
  ).length;
  const approvedCount = registrations.filter((r) => r.status === "approved").length;
  const rejectedCount = registrations.filter((r) => r.status === "rejected").length;

  const divisionMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of divisions) m.set(d.id, d.name);
    return m;
  }, [divisions]);

  const filtered = useMemo(() => {
    if (filter === "all") return registrations;
    if (filter === "pending_review") {
      return registrations.filter(
        (r) => r.status === "submitted" || r.status === "under_review" || r.status === "pending_review"
      );
    }
    if (filter === "pending_payment") {
      return registrations.filter((r) => r.status === "pending_payment");
    }
    return registrations.filter((r) => r.status === filter);
  }, [registrations, filter]);

  async function review(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      await regApi.reviewRegistration(id, { action });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  function exportCsv() {
    const rows = [
      ["id", "division", "status", "submitted_at"],
      ...filtered.map((r) => [
        r.id,
        r.divisionId ? divisionMap.get(r.divisionId) ?? "" : "",
        r.status,
        r.submittedAt ?? r.createdAt
      ])
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `submissions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Submissions"
        subtitle={`${total} total · ${pendingCount} pending review · ${approvedCount} approved · ${rejectedCount} rejected`}
        action={
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) =>
                setFilter(
                  e.target.value as (typeof STATUS_FILTERS)[number]["value"]
                )
              }
              className="h-9 rounded-md border border-border bg-surface-1 px-2 text-[12px] text-fg"
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <Button type="button" variant="ghost" size="sm" onClick={exportCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="font-mono text-[10px] uppercase tracking-widest">
                Export CSV
              </span>
            </Button>
          </div>
        }
      />

      {error ? (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-border rounded-xl border border-border bg-surface-1">
        {filtered.length === 0 ? (
          <li className="px-5 py-8 text-center text-[13px] text-fg-muted">
            No submissions match this filter.
          </li>
        ) : (
          filtered.map((r) => {
            const divName = r.divisionId
              ? divisionMap.get(r.divisionId) ?? "—"
              : "—";
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  aria-label={`Select ${r.id}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-fg truncate">
                    {(r as Registration & { teamName?: string }).teamName ?? r.id.slice(0, 8)}
                  </p>
                  <p className="font-mono text-[11px] text-fg-muted">{divName}</p>
                </div>
                <Badge mono tone={STATUS_TONE[r.status] ?? "neutral"}>
                  {statusLabel(r.status)}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => review(r.id, "approve")}
                  disabled={busyId === r.id || r.status === "approved"}
                >
                  {busyId === r.id ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : null}
                  <span className="font-mono text-[10px] uppercase tracking-widest">
                    Approve
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => review(r.id, "reject")}
                  disabled={busyId === r.id || r.status === "rejected"}
                >
                  <span className="font-mono text-[10px] uppercase tracking-widest">
                    Reject
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled
                  title="Email composer ships with the notifications worker — placeholder"
                >
                  <span className="font-mono text-[10px] uppercase tracking-widest">
                    Email
                  </span>
                </Button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
