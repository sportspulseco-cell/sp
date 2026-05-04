import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Tone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "primary"
  | "accent";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-muted border border-border",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  info: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  primary: "bg-fg text-bg",
  accent: "bg-[var(--accent-soft)] text-accent"
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** Mono uppercase label style (LOCKED, ROADMAP, BETA…) */
  mono?: boolean;
}

export function Badge({
  tone = "neutral",
  mono,
  className,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md px-2",
        mono
          ? "font-mono text-[10px] font-medium uppercase tracking-wide"
          : "text-[11px] font-medium tracking-tight",
        TONES[tone],
        className
      )}
      {...rest}
    />
  );
}

export function statusTone(status: string): Tone {
  switch (status) {
    case "active":
    case "approved":
    case "eligible":
    case "completed":
    case "published":
      return "success";
    case "pending":
    case "draft":
    case "submitted":
    case "under_review":
    case "in_progress":
    case "registration_open":
    case "playoffs":
    case "waitlisted":
      return "info";
    case "suspended":
    case "warning":
      return "warning";
    case "rejected":
    case "withdrawn":
    case "deleted":
    case "ineligible":
    case "dissolved":
    case "archived":
      return "danger";
    default:
      return "neutral";
  }
}
