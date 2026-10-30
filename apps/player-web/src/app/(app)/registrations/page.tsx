import Link from "next/link";
import { ArrowRight, Building2, CalendarRange, CheckCircle2, Layers, ScrollText, Trophy, Users } from "lucide-react";
import { Badge, EmptyState, PageHeader, LoadError, LocalDate } from "@sportspulse/ui";
import { load } from "@sportspulse/api-client";
import { registration } from "@/lib/api/server-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "My registrations · Player" };

type Row = Awaited<
  ReturnType<typeof registration.listMyRegistrations>
>["items"][number];

function statusCopy(status: string): string {
  switch (status) {
    case "draft":
      return "Started but not submitted yet. Finish the steps to submit.";
    case "submitted":
      return "Submitted. Admin will review shortly.";
    case "under_review":
    case "pending_review":
      return "An admin is currently reviewing.";
    case "approved":
      return "Approved. You're cleared for the season.";
    case "rejected":
      return "Rejected. Contact your admin or check the decision reason.";
    case "waitlisted":
      return "Waitlisted. Your admin will reach out if a spot opens.";
    case "withdrawn":
      return "Withdrawn.";
    case "pending_verification":
      return "Verify your email to continue.";
    case "pending_consent":
      return "Awaiting parental consent.";
    case "pending_payment":
      return "Payment outstanding. Finish checkout to submit.";
    case "pending_offline":
      return "Offline payment pending. Your admin will mark it received.";
    case "incomplete":
      return "Resume your registration to finish it.";
    case "cancelled":
      return "Cancelled.";
    default:
      return "";
  }
}

export default async function MyRegistrationsPage() {
  const result = await load(registration.listMyRegistrations());
  const items: Row[] = result.ok ? (result.data.items ?? []) : [];
  const sorted = items.slice().sort((a, b) => {
    const at = a.submittedAt ?? a.createdAt;
    const bt = b.submittedAt ?? b.createdAt;
    return bt.localeCompare(at);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="MY REGISTRATIONS"
        title="My registrations"
        description="Every registration you've submitted across leagues. Drafts can be resumed; approved ones unlock the rest of the dashboard."
      />

      {!result.ok ? (
        <LoadError what="your registrations" status={result.status} message={result.message} />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No registrations yet"
          description="Pick a season + form to start. They'll show up here once submitted."
        />
      ) : (
        <ul className="space-y-3">
          {sorted.map((r) => (
            <RegistrationRow key={r.id} r={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RegistrationRow({ r }: { r: Row }) {
  const isApproved = r.status === "approved";
  // Statuses the player finishes themselves: Resume reopens the sign-up.
  const isDraftish = ["draft", "rejected", "pending_payment", "incomplete", "pending_verification"].includes(r.status);
  const title =
    r.seasonName ||
    r.formName ||
    r.leagueName ||
    r.orgName ||
    "Registration";
  const subtitle = [r.formName, r.orgName].filter(Boolean).join(" · ");
  return (
    <li
      className={[
        "rounded-xl border bg-surface-1 p-5",
        isApproved
          ? "border-[var(--tint-emerald-fg)]/30 bg-[var(--success)]/[0.04]"
          : "border-border"
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={[
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              isApproved
                ? "bg-[var(--tint-emerald-bg)] text-[var(--tint-emerald-fg)] ring-1 ring-[var(--tint-emerald-fg)]/40 dark:text-[var(--tint-emerald-fg)]"
                : "bg-fg-muted/10 text-fg-muted"
            ].join(" ")}
          >
            {isApproved ? (
              <CheckCircle2 className="h-5 w-5" strokeWidth={1.75} />
            ) : (
              <ScrollText className="h-5 w-5" strokeWidth={1.75} />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[15px] font-semibold tracking-tight text-fg">
                {title}
              </p>
              <Badge status={r.status} />
            </div>
            {subtitle && (
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                {subtitle}
              </p>
            )}
            <p className="mt-2 text-[13px] text-fg-muted">
              {statusCopy(r.status)}
            </p>
            {r.decisionReason && (
              <p className="mt-1 text-[12px] text-fg-muted">
                Reason: <span className="text-fg">{r.decisionReason}</span>
              </p>
            )}

            {/* Detail chips */}
            {(r.leagueName ||
              r.divisionName ||
              r.teamName ||
              r.seasonName) && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-fg-muted">
                {r.leagueName && (
                  <span className="inline-flex items-center gap-1">
                    <Trophy className="h-3 w-3" strokeWidth={1.75} />
                    {r.leagueName}
                  </span>
                )}
                {r.seasonName && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarRange className="h-3 w-3" strokeWidth={1.75} />
                    {r.seasonName}
                  </span>
                )}
                {r.divisionName && (
                  <span className="inline-flex items-center gap-1">
                    <Layers className="h-3 w-3" strokeWidth={1.75} />
                    {r.divisionName}
                  </span>
                )}
                {r.teamName && (
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" strokeWidth={1.75} />
                    {r.teamName}
                  </span>
                )}
                {r.orgName && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3 w-3" strokeWidth={1.75} />
                    {r.orgName}
                  </span>
                )}
              </div>
            )}

            <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              Ref {r.id.slice(0, 8)} ·{" "}
              {r.submittedAt ? (
                <>Submitted <LocalDate iso={r.submittedAt} format="date" /></>
              ) : (
                <>Started <LocalDate iso={r.createdAt} format="date" /></>
              )}
              {r.reviewedAt ? (
                <> · Reviewed <LocalDate iso={r.reviewedAt} format="date" /></>
              ) : null}
            </p>
          </div>
        </div>

        {isApproved ? (
          <Link
            href={`/registrations/${r.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--success)] px-3 font-mono text-[10px] font-medium uppercase tracking-widest text-white hover:bg-[var(--success)]"
          >
            View details
            <ArrowRight className="h-3 w-3" strokeWidth={2} />
          </Link>
        ) : isDraftish ? (
          <Link
            href={`/register?resume=${r.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--tint-amber-fg)]/30 bg-[var(--tint-amber-bg)] px-3 font-mono text-[10px] uppercase tracking-widest text-[var(--tint-amber-fg)] hover:bg-[var(--tint-amber-bg)] dark:text-[var(--tint-amber-fg)]"
          >
            Resume
            <ArrowRight className="h-3 w-3" strokeWidth={2} />
          </Link>
        ) : (
          <Link
            href={`/registrations/${r.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:bg-bg-subtle"
          >
            View details
            <ArrowRight className="h-3 w-3" strokeWidth={2} />
          </Link>
        )}
      </div>
    </li>
  );
}
