"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cn, useNav } from "@sportspulse/ui";
import {
  registrationCallHref,
  registrationCallLabel,
  type RegistrationCall
} from "@/lib/registration-call";

const CTA_EYEBROW: Record<RegistrationCall["kind"], string> = {
  open: "season open",
  setup: "approved",
  pending: "pending review",
  denied: "not approved"
};

const CTA_TONE: Record<RegistrationCall["kind"], { box: string; fg: string; dot: string; ping: boolean }> = {
  open: {
    box: "border-[var(--tint-emerald-fg)]/30 bg-[var(--success)]/[0.08] hover:bg-[var(--success)]/[0.12]",
    fg: "text-[var(--tint-emerald-fg)]",
    dot: "bg-[var(--success)]",
    ping: true
  },
  setup: {
    box: "border-[var(--tint-emerald-fg)]/30 bg-[var(--success)]/[0.08] hover:bg-[var(--success)]/[0.12]",
    fg: "text-[var(--tint-emerald-fg)]",
    dot: "bg-[var(--success)]",
    ping: true
  },
  pending: {
    box: "border-[var(--tint-amber-fg)]/30 bg-[var(--tint-amber-bg)]",
    fg: "text-[var(--tint-amber-fg)]",
    dot: "bg-[var(--tint-amber-fg)]",
    ping: false
  },
  denied: {
    box: "border-[var(--tint-rose-fg)]/30 bg-[var(--tint-rose-bg)]",
    fg: "text-[var(--tint-rose-fg)]",
    dot: "bg-[var(--tint-rose-fg)]",
    ping: false
  }
};

/**
 * Registration CTA at the top of the sidebar. Copy and tone follow the
 * call kind so the captain reads the same signal here and in the
 * RegistrationBanner: "Register the team" (open season or a denial to
 * act on), "View application" (pending), "Set up roster & dues"
 * (approved, wizard not run).
 */
export function RegistrationCta({ call }: { call: RegistrationCall }) {
  const { setOpen } = useNav();
  const tone = CTA_TONE[call.kind];
  return (
    <div className="border-b border-border p-2">
      <Link
        href={registrationCallHref(call)}
        onClick={() => setOpen(false)}
        className={cn(
          "group relative flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-all",
          tone.box
        )}
        data-registration-call={call.kind}
      >
        <span className="relative inline-flex h-2 w-2 shrink-0">
          {tone.ping ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--tint-emerald-bg)]" />
          ) : null}
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", tone.dot)} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.2em]", tone.fg)}>
            <Sparkles className="h-2.5 w-2.5" strokeWidth={2} />
            {CTA_EYEBROW[call.kind]} · {call.seasonName}
          </p>
          <p className="mt-0.5 truncate text-[12px] font-medium text-fg">
            {registrationCallLabel(call)}
          </p>
        </div>
      </Link>
    </div>
  );
}
