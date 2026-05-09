import Link from "next/link";
import { ArrowRight, ScrollText } from "lucide-react";
import { Badge, EmptyState } from "@sportspulse/ui";
import type { Registration } from "@sportspulse/api-client";
import { registration } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "My registrations — SportsPulse" };

const STATUS_TONE: Record<
  Registration["status"],
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  draft: "neutral",
  submitted: "warning",
  under_review: "warning",
  approved: "success",
  rejected: "danger",
  waitlisted: "info",
  withdrawn: "neutral",
  // Registration v2 states.
  pending_verification: "warning",
  pending_consent: "warning",
  pending_payment: "warning",
  pending_offline: "warning",
  pending_review: "warning",
  incomplete: "neutral",
  cancelled: "neutral"
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function statusCopy(status: Registration["status"]): string {
  switch (status) {
    case "draft":
      return "Started but not yet submitted — finish the funnel to submit.";
    case "submitted":
      return "Submitted. Admin will review shortly.";
    case "under_review":
    case "pending_review":
      return "An admin is currently reviewing.";
    case "approved":
      return "Approved — you're cleared for the season.";
    case "rejected":
      return "Rejected. Contact your admin or check the decision reason.";
    case "waitlisted":
      return "Waitlisted — admin will reach out if a spot opens.";
    case "withdrawn":
      return "Withdrawn.";
    case "pending_verification":
      return "Verify your email to continue.";
    case "pending_consent":
      return "Awaiting parental consent.";
    case "pending_payment":
      return "Payment outstanding — finish checkout to submit.";
    case "pending_offline":
      return "Offline payment pending — admin will mark received.";
    case "incomplete":
      return "Resume the funnel to fill missing details.";
    case "cancelled":
      return "Cancelled.";
    default:
      return "";
  }
}

export default async function MyRegistrationsPage() {
  // Self-scoped endpoint — handles the persons.userId lookup AND the
  // legacy-orphan back-fill server-side, so we don't have to gate on
  // meScope's personId here. Returns an empty list (not an error) when
  // the user has zero linked registrations.
  const page = await registration
    .listMyRegistrations()
    .catch(() => ({ items: [] as Registration[] }));

  const items: Registration[] = page.items ?? [];
  const sorted = items.slice().sort((a, b) => {
    const at = a.submittedAt ?? a.createdAt;
    const bt = b.submittedAt ?? b.createdAt;
    return bt.localeCompare(at);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// MY REGISTRATIONS"
        title="My registrations"
        description="Every registration you've submitted across leagues. Drafts can be resumed; approved ones unlock the rest of the dashboard."
      />

      {sorted.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No registrations yet"
          description="Pick a season + form to start. They'll show up here once submitted."
        />
      ) : (
        <ul className="space-y-3">
          {sorted.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface-1 p-5"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    // Ref
                  </span>
                  <span className="font-mono text-[12px] text-fg">
                    {r.id.slice(0, 8)}
                  </span>
                  <Badge mono tone={STATUS_TONE[r.status]}>
                    {r.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <p className="text-[13px] text-fg">{statusCopy(r.status)}</p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                  {r.submittedAt
                    ? `Submitted ${fmtDate(r.submittedAt)}`
                    : `Started ${fmtDate(r.createdAt)}`}
                  {r.reviewedAt ? ` · Reviewed ${fmtDate(r.reviewedAt)}` : ""}
                </p>
                {r.decisionReason ? (
                  <p className="text-[12px] text-fg-muted">
                    Reason: {r.decisionReason}
                  </p>
                ) : null}
              </div>
              {r.status === "draft" || r.status === "rejected" ? (
                <Link
                  href={`/register?resume=${r.id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 font-mono text-[10px] uppercase tracking-widest text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                >
                  Resume
                  <ArrowRight className="h-3 w-3" strokeWidth={2} />
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
