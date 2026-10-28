import { cn } from "./lib/cn";
import type { HTMLAttributes } from "react";
import { statusLabel, statusTone, type StatusDomain } from "@sportspulse/kernel";

type Tone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "primary"
  | "accent";

const TONES: Record<Tone, string> = {
  neutral: "bg-bg-subtle text-fg-muted border border-border",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  danger: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  info: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  primary: "bg-fg text-bg",
  accent: "bg-[var(--accent-soft)] text-[--accent]"
};

const DOT_TONES: Record<Tone, string> = {
  neutral: "bg-fg-muted",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  info: "bg-blue-500",
  primary: "bg-bg",
  accent: "bg-[--accent]"
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** Mono uppercase label style (LOCKED, ROADMAP, BETA…) */
  mono?: boolean;
  /** Render a tone-coloured dot inside the badge (pairs with mono). */
  dot?: boolean;
  /**
   * A record status (registration, invoice, game, invite, payment,
   * roster...). Sets the shared tone and, without children, the shared
   * word. Renders mono unless `mono={false}`.
   */
  status?: string | null;
  /** Where the same word means something else (store orders, notifications, games, compliance, brackets). */
  domain?: StatusDomain;
}

export function Badge({
  tone,
  mono,
  dot,
  status,
  domain,
  className,
  children,
  ...rest
}: BadgeProps) {
  const isStatus = status !== undefined;
  const resolvedTone: Tone = tone ?? (isStatus ? statusTone(status, domain) : "neutral");
  const resolvedMono = mono ?? isStatus;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md px-2",
        resolvedMono
          ? "text-[12px] font-medium"
          : "text-[11px] font-medium tracking-tight",
        TONES[resolvedTone],
        className
      )}
      {...rest}
    >
      {dot ? (
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 rounded-full", DOT_TONES[resolvedTone])}
        />
      ) : null}
      {children ?? (isStatus ? statusLabel(status, domain) : null)}
    </span>
  );
}

/**
 * One word and one colour per status in every app: the map lives in
 * @sportspulse/kernel (status-display.ts). Prefer `<Badge status={s} />`.
 */
export { statusLabel, statusTone } from "@sportspulse/kernel";
