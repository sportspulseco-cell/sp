import Link from "next/link";
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Clock,
  Sparkles,
  XCircle
} from "lucide-react";
import { Eyebrow, LocalDate } from "@sportspulse/ui";
import {
  registrationCallHref,
  registrationCallLabel,
  type RegistrationCall
} from "@/lib/registration-call";

/**
 * Home-page card for the registration call-to-action. One card, one
 * decision: register for the open season, re-apply after a denial (with
 * the admin's reason), wait on a pending application, or finish the
 * roster + dues set-up for an approved one.
 */
export function RegistrationCallCard({ call }: { call: RegistrationCall }) {
  const tone = TONE[call.kind];
  const Icon = tone.icon;
  const closes = call.registrationClosesAt ? (
    <LocalDate iso={call.registrationClosesAt} format="date" />
  ) : null;

  return (
    <section
      className={`rounded-2xl border p-6 ${tone.box}`}
      data-registration-call={call.kind}
    >
      <Eyebrow className={tone.fg}>// {tone.eyebrow}</Eyebrow>
      <div className="mt-2 flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.fg}`} strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-semibold tracking-tight text-fg">
            {TITLE[call.kind](call)}
          </h2>
          <p className="mt-1 text-[13px] text-fg-muted">{DETAIL[call.kind](call)}</p>
          {call.kind === "denied" && call.reason ? (
            <div className="mt-3 rounded-lg border border-[var(--tint-rose-fg)]/30 bg-bg-subtle p-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--tint-rose-fg)]">
                Reason from admin
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-fg">{call.reason}</p>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href={registrationCallHref(call)}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium ${tone.button}`}
            >
              {registrationCallLabel(call, "long")}
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Link>
            {closes && call.kind !== "pending" ? (
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-fg-muted">
                <CalendarRange className="h-3.5 w-3.5" strokeWidth={1.75} />
                Registration closes {closes}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

const TITLE: Record<RegistrationCall["kind"], (c: RegistrationCall) => string> = {
  open: (c) => `Registration is open for ${c.seasonName}`,
  setup: (c) => `Approved for ${c.seasonName}`,
  pending: (c) => `Application pending for ${c.seasonName}`,
  denied: (c) => `Application not approved for ${c.seasonName}`
};

const DETAIL: Record<RegistrationCall["kind"], (c: RegistrationCall) => string> = {
  open: (c) =>
    c.kind === "open" && c.openCount > 1
      ? `${c.leagueName}. ${c.openCount} seasons are open; this one closes first.`
      : `${c.leagueName}. Pick a division and apply; the league admin reviews it.`,
  setup: (c) =>
    c.kind === "setup"
      ? `${c.divisionName}. Invite your players and set the dues split to confirm the spot.`
      : "",
  pending: (c) =>
    c.kind === "pending"
      ? `${c.divisionName}. The league admin is reviewing it; you will be notified.`
      : "",
  denied: (c) =>
    c.kind === "denied"
      ? `${c.divisionName} was not approved by the league admin. You can apply to a different division while registration is open.`
      : ""
};

const TONE: Record<
  RegistrationCall["kind"],
  { eyebrow: string; icon: typeof Sparkles; box: string; fg: string; button: string }
> = {
  open: {
    eyebrow: "registration open",
    icon: Sparkles,
    box: "border-[var(--tint-emerald-fg)]/30 bg-[var(--tint-emerald-bg)]",
    fg: "text-[var(--tint-emerald-fg)]",
    button: "bg-[var(--success)] text-white hover:bg-[var(--success)]"
  },
  setup: {
    eyebrow: "application approved",
    icon: CheckCircle2,
    box: "border-[var(--tint-emerald-fg)]/30 bg-[var(--tint-emerald-bg)]",
    fg: "text-[var(--tint-emerald-fg)]",
    button: "bg-[var(--success)] text-white hover:bg-[var(--success)]"
  },
  pending: {
    eyebrow: "application pending",
    icon: Clock,
    box: "border-[var(--tint-amber-fg)]/30 bg-[var(--tint-amber-bg)]",
    fg: "text-[var(--tint-amber-fg)]",
    button: "border border-border bg-bg text-fg hover:bg-surface-1"
  },
  denied: {
    eyebrow: "application not approved",
    icon: XCircle,
    box: "border-[var(--tint-rose-fg)]/30 bg-[var(--tint-rose-bg)]",
    fg: "text-[var(--tint-rose-fg)]",
    button: "bg-[var(--success)] text-white hover:bg-[var(--success)]"
  }
};
