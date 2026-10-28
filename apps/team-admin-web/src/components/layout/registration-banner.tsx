import Link from "next/link";
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Clock,
  Sparkles,
  XCircle
} from "lucide-react";
import {
  registrationCallHref,
  registrationCallLabel,
  type RegistrationCall
} from "@/lib/registration-call";

/**
 * Registration call-to-action strip under the TopBar.
 *
 * Renders whenever `deriveRegistrationCall` returns a call: an open
 * season the team has not applied to, a denial the captain can act
 * on, a pending application, or an approved one whose roster + dues
 * set-up is still to do. Pairs with the sidebar CTA; both come from
 * the same value in (app)/layout.tsx so they appear and disappear
 * together.
 */
export function RegistrationBanner({ call }: { call: RegistrationCall }) {
  const closesAt = call.registrationClosesAt
    ? new Date(call.registrationClosesAt)
    : null;
  const daysLeft = closesAt
    ? Math.max(
        0,
        Math.ceil((closesAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      )
    : null;
  const urgent = daysLeft !== null && daysLeft <= 3;
  const tone = TONES[call.kind];
  const Icon = tone.icon;

  return (
    <div
      className={`relative overflow-hidden border-b ${tone.border} ${tone.bg}`}
      data-registration-call={call.kind}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
            {call.kind === "open" || call.kind === "setup" ? (
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full ${tone.ping}`}
              />
            ) : null}
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${tone.dot}`}
            />
          </span>
          <div className="min-w-0">
            <p
              className={`flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] ${tone.fg}`}
            >
              
              <span>{tone.eyebrow}</span>
            </p>
            <p className="mt-0.5 truncate text-[14px] font-medium text-fg">
              <span className="font-semibold">{call.seasonName}</span>{" "}
              <span className="text-fg-muted">·</span>{" "}
              <span className="text-fg-muted">
                {call.kind === "open"
                  ? call.leagueName
                  : `${call.divisionName} · ${tone.detail}`}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {daysLeft !== null && call.kind !== "pending" ? (
            <span
              className={
                urgent
                  ? "inline-flex h-7 items-center gap-1.5 rounded-full bg-[var(--tint-rose-bg)] px-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--tint-rose-fg)]"
                  : `inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 font-mono text-[10px] uppercase tracking-[0.18em] ${tone.chip}`
              }
            >
              <CalendarRange className="h-3 w-3" strokeWidth={2} />
              {daysLeft === 0
                ? "closes today"
                : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
            </span>
          ) : null}
          <Link
            href={registrationCallHref(call)}
            className={`group inline-flex h-8 items-center gap-2 rounded-full px-4 font-mono text-[10px] uppercase tracking-[0.18em] text-white transition-transform hover:scale-[1.02] ${tone.button}`}
          >
            <Icon className="h-3 w-3" strokeWidth={2} />
            {registrationCallLabel(call)}
            <ArrowRight
              className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2}
            />
          </Link>
        </div>
      </div>
    </div>
  );
}

const TONES: Record<
  RegistrationCall["kind"],
  {
    eyebrow: string;
    detail: string;
    icon: typeof Sparkles;
    border: string;
    bg: string;
    fg: string;
    dot: string;
    ping: string;
    chip: string;
    button: string;
  }
> = {
  open: {
    eyebrow: "Registration open",
    detail: "",
    icon: Sparkles,
    border: "border-[var(--tint-emerald-fg)]/30",
    bg: "bg-[var(--success)]/[0.06]",
    fg: "text-[var(--tint-emerald-fg)]",
    dot: "bg-[var(--success)]",
    ping: "bg-[var(--tint-emerald-bg)]",
    chip: "bg-[var(--tint-emerald-bg)] text-[var(--tint-emerald-fg)]",
    button: "bg-[var(--success)] hover:bg-[var(--success)]"
  },
  setup: {
    eyebrow: "Application approved",
    detail: "set-up pending",
    icon: CheckCircle2,
    border: "border-[var(--tint-emerald-fg)]/30",
    bg: "bg-[var(--success)]/[0.06]",
    fg: "text-[var(--tint-emerald-fg)]",
    dot: "bg-[var(--success)]",
    ping: "bg-[var(--tint-emerald-bg)]",
    chip: "bg-[var(--tint-emerald-bg)] text-[var(--tint-emerald-fg)]",
    button: "bg-[var(--success)] hover:bg-[var(--success)]"
  },
  pending: {
    eyebrow: "Application pending review",
    detail: "awaiting league admin",
    icon: Clock,
    border: "border-[var(--tint-amber-fg)]/30",
    bg: "bg-[var(--tint-amber-bg)]",
    fg: "text-[var(--tint-amber-fg)]",
    dot: "bg-[var(--tint-amber-fg)]",
    ping: "bg-[var(--tint-amber-bg)]",
    chip: "bg-[var(--tint-amber-bg)] text-[var(--tint-amber-fg)]",
    button: "bg-fg hover:bg-fg text-bg"
  },
  denied: {
    eyebrow: "Application not approved",
    detail: "apply to a different division",
    icon: XCircle,
    border: "border-[var(--tint-rose-fg)]/30",
    bg: "bg-[var(--tint-rose-bg)]",
    fg: "text-[var(--tint-rose-fg)]",
    dot: "bg-[var(--tint-rose-fg)]",
    ping: "bg-[var(--tint-rose-bg)]",
    chip: "bg-[var(--tint-rose-bg)] text-[var(--tint-rose-fg)]",
    button: "bg-[var(--success)] hover:bg-[var(--success)]"
  }
};
