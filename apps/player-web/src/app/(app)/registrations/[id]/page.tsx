import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarRange,
  Check,
  CheckCircle2,
  Clock,
  Layers,
  ScrollText,
  Trophy,
  Users,
  XCircle
} from "lucide-react";
import { Badge, Eyebrow } from "@sportspulse/ui";
import { registration } from "@/lib/api/server-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Registration — SportsPulse" };

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

const STATUS_TONE: Record<
  string,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  draft: "neutral",
  submitted: "warning",
  under_review: "warning",
  approved: "success",
  rejected: "danger",
  waitlisted: "info",
  withdrawn: "neutral",
  pending_verification: "warning",
  pending_consent: "warning",
  pending_payment: "warning",
  pending_offline: "warning",
  pending_review: "warning",
  incomplete: "neutral",
  cancelled: "neutral"
};

export default async function RegistrationDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const r = await registration.getMyRegistration(id).catch(() => null);
  if (!r) notFound();

  const isApproved = r.status === "approved";
  const isRejected = r.status === "rejected";
  const headline =
    r.seasonName ||
    r.leagueName ||
    r.formName ||
    r.orgName ||
    `Registration ${r.id.slice(0, 8)}`;
  const subtitle = [r.formName, r.orgName].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <Link
        href="/registrations"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        My registrations
      </Link>

      {/* Hero */}
      <section
        className={[
          "rounded-2xl border p-6",
          isApproved
            ? "border-emerald-400/40 bg-emerald-50/70 dark:border-emerald-700/40 dark:bg-emerald-950/30"
            : isRejected
              ? "border-rose-400/40 bg-rose-50/70 dark:border-rose-700/40 dark:bg-rose-950/30"
              : "border-amber-400/40 bg-amber-50/70 dark:border-amber-700/40 dark:bg-amber-950/30"
        ].join(" ")}
      >
        <div className="flex flex-col items-center text-center">
          <div
            className={[
              "flex h-12 w-12 items-center justify-center rounded-full ring-1",
              isApproved
                ? "bg-emerald-500/15 text-emerald-600 ring-emerald-500/40 dark:text-emerald-400"
                : isRejected
                  ? "bg-rose-500/15 text-rose-600 ring-rose-500/40 dark:text-rose-400"
                  : "bg-amber-500/15 text-amber-700 ring-amber-500/40 dark:text-amber-300"
            ].join(" ")}
          >
            {isApproved ? (
              <CheckCircle2 className="h-6 w-6" strokeWidth={1.75} />
            ) : isRejected ? (
              <XCircle className="h-6 w-6" strokeWidth={1.75} />
            ) : (
              <Clock className="h-6 w-6" strokeWidth={1.75} />
            )}
          </div>
          <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-fg">
            {isApproved
              ? "You're in!"
              : isRejected
                ? "Registration not approved"
                : "Registration in progress"}
          </h1>
          <p className="mt-1.5 max-w-md text-[13px] text-fg-muted">
            {isApproved ? (
              <>
                You're registered for{" "}
                <span className="font-medium text-fg">{headline}</span>
                {r.orgName ? (
                  <>
                    {" "}
                    with{" "}
                    <span className="font-medium text-fg">{r.orgName}</span>
                  </>
                ) : null}
                . Your admin will follow up with next steps below.
              </>
            ) : isRejected ? (
              <>
                Your application for{" "}
                <span className="font-medium text-fg">{headline}</span> was not
                approved.
              </>
            ) : (
              <>
                {headline} — see the next-steps timeline below to finish your
                registration.
              </>
            )}
          </p>
          <div className="mt-3">
            <Badge mono tone={STATUS_TONE[r.status] ?? "neutral"}>
              {r.status.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>

        {/* Detail table */}
        <dl className="mt-6 divide-y divide-border rounded-xl border border-border bg-bg-subtle text-[13px]">
          <DetailRow label="Registration form" value={r.formName ?? "—"} />
          <DetailRow label="Organisation" value={r.orgName ?? "—"} />
          {r.seasonName && <DetailRow label="Season" value={r.seasonName} />}
          {r.leagueName && <DetailRow label="League" value={r.leagueName} />}
          {r.divisionName && (
            <DetailRow label="Division" value={r.divisionName} />
          )}
          {r.teamName && <DetailRow label="Team" value={r.teamName} />}
          <DetailRow
            label={r.submittedAt ? "Submitted" : "Started"}
            value={fmt(r.submittedAt ?? r.createdAt)}
          />
          {r.reviewedAt && (
            <DetailRow label="Reviewed" value={fmt(r.reviewedAt)} />
          )}
          {r.decisionReason && (
            <DetailRow label="Reason" value={r.decisionReason} />
          )}
          <DetailRow label="Ref" value={r.id.slice(0, 8)} mono />
        </dl>

        {/* What's next */}
        <div className="mt-6 space-y-2 text-left">
          <Eyebrow>// what's next</Eyebrow>
          {isApproved ? (
            <ol className="space-y-2 text-[13px]">
              <StepDone>Registration submitted</StepDone>
              <StepDone>Admin approved your application</StepDone>
              {r.teamName ? (
                <StepDone>You're on {r.teamName}</StepDone>
              ) : (
                <StepCurrent index={3}>
                  Waiting for team assignment by your admin — they'll add you
                  to a roster when one is set.
                </StepCurrent>
              )}
              <StepFuture index={r.teamName ? 4 : 4}>
                Once rostered, schedule + stats unlock on your home dashboard.
              </StepFuture>
            </ol>
          ) : isRejected ? (
            <p className="rounded-md border border-rose-500/30 bg-rose-100/60 px-3 py-2 text-[13px] text-fg dark:bg-rose-950/40">
              Contact your league admin to discuss the decision. You can submit
              a fresh registration for a different season.
            </p>
          ) : (
            <ol className="space-y-2 text-[13px]">
              <StepDone>Registration submitted</StepDone>
              <StepCurrent index={2}>
                Admin is reviewing — you'll get an email when there's an
                update.
              </StepCurrent>
              <StepFuture index={3}>
                If approved, you'll be cleared to play and added to a team.
              </StepFuture>
            </ol>
          )}
        </div>

        {/* CTAs */}
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-[13px] font-medium text-fg hover:bg-surface-1"
          >
            <ScrollText className="h-3.5 w-3.5" strokeWidth={1.75} />
            Back to my dashboard
          </Link>
          {isApproved ? (
            <Link
              href="/compliance"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-[13px] font-medium text-white hover:bg-emerald-700"
            >
              Check compliance docs
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
            </Link>
          ) : isRejected ? (
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-fg px-3 py-2 text-[13px] font-medium text-bg hover:opacity-90"
            >
              Find another season
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
            </Link>
          ) : (
            <Link
              href={`/register?resume=${r.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-600 px-3 py-2 text-[13px] font-medium text-white hover:bg-amber-700"
            >
              Resume registration
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
            </Link>
          )}
        </div>
      </section>

      {/* Context chips card */}
      {(r.leagueName ||
        r.seasonName ||
        r.divisionName ||
        r.teamName ||
        r.orgName) && (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <Eyebrow>// context</Eyebrow>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-fg-muted">
            {r.leagueName && (
              <span className="inline-flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span className="text-fg">{r.leagueName}</span>
              </span>
            )}
            {r.seasonName && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarRange className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span className="text-fg">{r.seasonName}</span>
              </span>
            )}
            {r.divisionName && (
              <span className="inline-flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span className="text-fg">{r.divisionName}</span>
              </span>
            )}
            {r.teamName && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span className="text-fg">{r.teamName}</span>
              </span>
            )}
            {r.orgName && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span className="text-fg">{r.orgName}</span>
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              {subtitle}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd
        className={
          mono ? "font-mono text-fg" : "text-right font-medium text-fg"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function StepDone({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-700 ring-1 ring-emerald-500/40 dark:text-emerald-300">
        <Check className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
      <span className="pt-0.5 font-medium text-fg">{children}</span>
    </li>
  );
}

function StepCurrent({
  index,
  children
}: {
  index: number;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-bg">
        {index}
      </span>
      <span className="pt-0.5 font-medium text-fg">{children}</span>
    </li>
  );
}

function StepFuture({
  index,
  children
}: {
  index: number;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-medium text-fg-muted">
        {index}
      </span>
      <span className="pt-0.5 text-fg-muted">{children}</span>
    </li>
  );
}
