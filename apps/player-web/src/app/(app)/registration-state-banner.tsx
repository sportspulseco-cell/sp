import Link from "next/link";
import {
  ArrowRight,
  CalendarRange,
  Clock,
  UserPlus
} from "lucide-react";
import type { Registration } from "@sportspulse/api-client";

/**
 * Workflow-5 §3 registration-state detector. Renders a banner above the
 * dashboard content based on the player's registration history:
 *
 *   - S1 (no registrations ever) — bright welcome card pointing to the
 *     public funnel
 *   - S2 (had-prior, no current) — green "season X is open" callout
 *   - S3 (current submission incomplete) — amber resume callout with
 *     a "Resume" button deep-linking back into the funnel step
 *
 * Approved or pending-review submissions render nothing — the user is
 * already in the dashboard's normal state.
 *
 * The full pre-dashboard standalone screens from the spec ship in a
 * follow-up (this is the inline banner version that's more honest
 * given we can't gate the dashboard on every render without an extra
 * API call).
 */
export function RegistrationStateBanner({
  registrations
}: {
  registrations: Registration[];
}) {
  const state = detectState(registrations);
  if (state.kind === "active") return null;
  if (state.kind === "new") return <NewPlayerBanner />;
  if (state.kind === "returning") return <ReturningBanner />;
  return <ResumeBanner registration={state.registration} />;
}

type RegState =
  | { kind: "active" }
  | { kind: "new" }
  | { kind: "returning" }
  | { kind: "in_progress"; registration: Registration };

function detectState(regs: Registration[]): RegState {
  if (regs.length === 0) return { kind: "new" };
  const incomplete = regs.find((r) => {
    const s = r.status as string;
    return (
      s === "draft" ||
      s.startsWith("pending_") ||
      s === "incomplete"
    );
  });
  if (incomplete) return { kind: "in_progress", registration: incomplete };
  const hasActive = regs.some((r) => {
    const s = r.status as string;
    return s === "approved" || s === "submitted" || s === "under_review";
  });
  if (hasActive) return { kind: "active" };
  return { kind: "returning" };
}

function NewPlayerBanner() {
  return (
    <section className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" strokeWidth={1.75} />
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-widest text-blue-700 dark:text-blue-300">
              // New here?
            </p>
            <p className="text-[14px] font-medium text-fg">
              Register for a season to unlock your dashboard
            </p>
            <p className="text-[12px] text-fg-muted">
              You're signed in but haven't registered yet. Find a team or
              browse open seasons to start the funnel.
            </p>
          </div>
        </div>
        <Link
          href="/register"
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-blue-600 px-3 font-mono text-[10px] font-medium uppercase tracking-widest text-white hover:bg-blue-700"
        >
          Register
          <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>
    </section>
  );
}

function ReturningBanner() {
  return (
    <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <CalendarRange className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
              // Welcome back
            </p>
            <p className="text-[14px] font-medium text-fg">
              A new season is open — register again to keep playing
            </p>
            <p className="text-[12px] text-fg-muted">
              Your last season's data still shows below. Re-register to start
              tracking the new one.
            </p>
          </div>
        </div>
        <Link
          href="/register"
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-emerald-600 px-3 font-mono text-[10px] font-medium uppercase tracking-widest text-white hover:bg-emerald-700"
        >
          Register
          <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>
    </section>
  );
}

function ResumeBanner({ registration }: { registration: Registration }) {
  const status = registration.status as string;
  const stoppedAt =
    status === "incomplete"
      ? "Admin requested a resubmission"
      : status === "pending_consent"
        ? "Parental consent still needed"
        : status === "pending_payment"
          ? "Payment not yet completed"
          : status === "pending_verification"
            ? "Identity verification pending"
            : "Some steps remain";
  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={1.75} />
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-widest text-amber-700 dark:text-amber-300">
              // Registration in progress
            </p>
            <p className="text-[14px] font-medium text-fg">
              Resume your registration
            </p>
            <p className="text-[12px] text-fg-muted">
              Ref{" "}
              <span className="font-mono">{registration.id.slice(0, 8)}</span>{" "}
              · {stoppedAt}.
            </p>
          </div>
        </div>
        <Link
          href={`/register?resume=${registration.id}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-amber-600 px-3 font-mono text-[10px] font-medium uppercase tracking-widest text-white hover:bg-amber-700"
        >
          Resume
          <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>
    </section>
  );
}
