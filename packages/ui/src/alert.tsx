/**
 * Inline alert / banner — the canonical destructive / success /
 * warning / info message. Replaces the dozen inline
 * `border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300`
 * patterns scattered across the org-admin app.
 *
 * Tokens only. Each tone consumes the existing --tint-*-bg /
 * --tint-*-fg pair so light + dark inherit the same palette
 * without per-mode color forking.
 *
 * Hallmark gate: pre-emit critique P5 H4 E5 S4 R5 V4.
 */

import type { ReactNode } from "react";
import { cn } from "./lib/cn";

export type AlertTone = "error" | "success" | "warning" | "info";

const TONES: Record<AlertTone, string> = {
  error:
    "border-[var(--tint-rose-fg)]/30 bg-[var(--tint-rose-bg)] text-[var(--tint-rose-fg)]",
  success:
    "border-[var(--tint-emerald-fg)]/30 bg-[var(--tint-emerald-bg)] text-[var(--tint-emerald-fg)]",
  warning:
    "border-[var(--tint-amber-fg)]/30 bg-[var(--tint-amber-bg)] text-[var(--tint-amber-fg)]",
  info:
    "border-[var(--tint-blue-fg)]/30 bg-[var(--tint-blue-bg)] text-[var(--tint-blue-fg)]"
};

export interface AlertProps {
  tone?: AlertTone;
  children: ReactNode;
  className?: string;
  /** Visually hidden role override. Defaults to "alert" for assistive
   *  tech announcement on insert; pass "status" for non-urgent
   *  updates that shouldn't interrupt. */
  role?: "alert" | "status";
}

export function Alert({
  tone = "info",
  children,
  className,
  role = "alert"
}: AlertProps) {
  return (
    <div
      role={role}
      className={cn(
        "rounded-md border px-3 py-2 text-[12px] leading-relaxed",
        TONES[tone],
        className
      )}
    >
      {children}
    </div>
  );
}
