"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { Alert, Badge, Button, useLocalDate } from "@sportspulse/ui";
import type { FormSubmissionRow, FormSubmissions } from "@sportspulse/api-client";
import { SUBMISSION_STATUS_FILTERS, type SubmissionStatusFilter } from "@sportspulse/kernel";
import { useFormsBuilderApi } from "./context";
import { SectionHeader } from "./section-header";

function matches(filter: SubmissionStatusFilter, status: string): boolean {
  const f = SUBMISSION_STATUS_FILTERS.find((x) => x.value === filter);
  return !f?.statuses || (f.statuses as readonly string[]).includes(status);
}

/**
 * Submissions of one form, with every answer. Rows come from the API's
 * form submissions read (registrations on any version of this form the
 * caller may see). Each row opens to show the answers; Export CSV
 * downloads the same rows, filtered the same way, with one column per
 * answer. Approve and Reject review the registration in place.
 */
export function SubmissionsClient({
  formId,
  submissions
}: {
  formId: string;
  submissions: FormSubmissions;
}) {
  const { registration: regApi } = useFormsBuilderApi();
  const router = useRouter();
  const whenLabel = useLocalDate();
  const [filter, setFilter] = useState<SubmissionStatusFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const items = submissions.items;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of SUBMISSION_STATUS_FILTERS) c[f.value] = items.filter((r) => matches(f.value, r.status)).length;
    return c;
  }, [items]);

  const filtered = useMemo(() => items.filter((r) => matches(filter, r.status)), [items, filter]);

  async function review(r: FormSubmissionRow, action: "approve" | "reject") {
    setBusyId(r.id);
    setError(null);
    setNotice(null);
    try {
      await regApi.reviewRegistration(r.id, { action });
      setNotice(`${r.personName}: ${action === "approve" ? "approved" : "rejected"}.`);
      router.refresh();
    } catch (e) {
      setError(`Could not ${action} ${r.personName}: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function exportCsv() {
    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      const out = await regApi.exportFormSubmissions(formId, { status: filter });
      const blob = new Blob([out.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = out.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNotice(
        `Downloaded ${out.rows} ${out.rows === 1 ? "submission" : "submissions"}${out.truncated ? " (the first 5,000 only)" : ""}.`
      );
    } catch (e) {
      setError(`Export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Submissions"
        subtitle={`${counts.all ?? 0} total · ${counts.pending_review ?? 0} pending review · ${counts.pending_payment ?? 0} pending payment · ${counts.approved ?? 0} approved · ${counts.rejected ?? 0} rejected`}
        action={
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as SubmissionStatusFilter)}
              aria-label="Filter by status"
              className="h-9 rounded-md border border-border bg-surface-1 px-2 text-[12px] text-fg"
            >
              {SUBMISSION_STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label} ({counts[f.value] ?? 0})
                </option>
              ))}
            </select>
            <Button type="button" variant="ghost" size="sm" onClick={exportCsv} disabled={exporting || filtered.length === 0}>
              {exporting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
              )}
              <span className="font-mono text-[10px] uppercase tracking-widest">Export CSV</span>
            </Button>
          </div>
        }
      />

      {error ? (
        <Alert tone="error">
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert tone="success" role="status">
          {notice}
        </Alert>
      ) : null}
      {submissions.truncated ? (
        <p className="text-[12px] text-fg-muted">Showing the newest 5,000 submissions.</p>
      ) : null}

      <ul className="divide-y divide-border rounded-xl border border-border bg-surface-1">
        {filtered.length === 0 ? (
          <li className="px-5 py-8 text-center text-[13px] text-fg-muted">
            {items.length === 0 ? "No one has submitted this form yet." : "No submissions match this filter."}
          </li>
        ) : (
          filtered.map((r) => {
            const answered = submissions.columns.filter((c) => r.answers[c.key]);
            return (
              <li key={r.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-fg">{r.personName}</p>
                    <p className="text-[11px] text-fg-muted">
                      {[r.divisionName, r.teamName, r.email, `submitted ${whenLabel(r.submittedAt ?? r.createdAt)}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Badge status={r.status} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => review(r, "approve")}
                    disabled={busyId === r.id || r.status === "approved"}
                  >
                    {busyId === r.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                    <span className="font-mono text-[10px] uppercase tracking-widest">Approve</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => review(r, "reject")}
                    disabled={busyId === r.id || r.status === "rejected"}
                  >
                    <span className="font-mono text-[10px] uppercase tracking-widest">Reject</span>
                  </Button>
                </div>
                <details className="group mt-2">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] text-fg-muted hover:text-fg">
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                    {answered.length === 0 ? "No answers" : `Answers (${answered.length})`}
                  </summary>
                  {answered.length > 0 ? (
                    <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                      {answered.map((c) => (
                        <div key={c.key} className="min-w-0">
                          <dt className="text-[11px] text-fg-muted">{c.label}</dt>
                          <dd className="break-words text-[13px] text-fg">{r.answers[c.key]}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </details>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
