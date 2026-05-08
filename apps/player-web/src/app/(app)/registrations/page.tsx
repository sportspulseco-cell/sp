import Link from "next/link";
import { ArrowRight, ScrollText, ShieldAlert } from "lucide-react";
import { Badge, EmptyState } from "@sportspulse/ui";
import type { Registration } from "@sportspulse/api-client";
import { iam, registration } from "@/lib/api/server-api";
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
  withdrawn: "neutral"
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
      return "An admin is currently reviewing.";
    case "approved":
      return "Approved — you're cleared for the season.";
    case "rejected":
      return "Rejected. Contact your admin or check the decision reason.";
    case "waitlisted":
      return "Waitlisted — admin will reach out if a spot opens.";
    case "withdrawn":
      return "Withdrawn.";
    default:
      return "";
  }
}

export default async function MyRegistrationsPage() {
  const scope = await iam.meScope().catch(() => null);
  const personId = scope?.personId ?? null;

  if (!personId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// MY REGISTRATIONS" title="My registrations" />
        <EmptyState
          icon={ShieldAlert}
          title="Finish onboarding first"
          description="We need a person record linked to your account before showing your registrations."
        />
      </div>
    );
  }

  const page = await registration
    .listRegistrations({ subjectPersonId: personId })
    .catch(() => ({ items: [] as Registration[], nextCursor: null }));

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
