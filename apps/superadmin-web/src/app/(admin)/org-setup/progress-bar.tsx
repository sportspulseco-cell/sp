"use client";

import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { WizardStep } from "./types";

/**
 * Editorial 4-step progress indicator — chapter-numbered nodes (01..04)
 * connected by an animated rail that fills as steps are completed.
 * Active node gets the layoutId-animated accent halo so it slides
 * between positions when you navigate. Completed steps get a check
 * mark on emerald; future steps are outlined and disabled.
 */
export function ProgressBar({
  step,
  labels,
  validation,
  onNavigate
}: {
  step: WizardStep;
  labels: Record<WizardStep, string>;
  validation: Record<WizardStep, boolean>;
  onNavigate: (s: WizardStep) => void;
}) {
  const steps: WizardStep[] = [1, 2, 3, 4];
  return (
    <div className="flex items-center gap-2 sm:gap-4">
      {steps.map((s, i) => {
        const isActive = s === step;
        const isDone = s < step && validation[s];
        const isFuture = s > step;
        const canClick = !isFuture && !isActive;
        return (
          <div key={s} className="flex flex-1 items-center gap-2 sm:gap-3">
            <button
              type="button"
              disabled={!canClick}
              onClick={() => onNavigate(s)}
              className={cn(
                "group relative flex items-center gap-2 sm:gap-3",
                canClick ? "cursor-pointer" : "cursor-default"
              )}
            >
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
                {isActive ? (
                  <motion.span
                    layoutId="org-setup-active-halo"
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-[--accent]/15 ring-1 ring-[--accent]/30"
                    transition={{
                      type: "spring",
                      stiffness: 380,
                      damping: 32
                    }}
                  />
                ) : null}
                <span
                  className={cn(
                    "relative flex h-8 w-8 items-center justify-center rounded-full border-2 font-mono text-[11px] font-medium tabular-nums transition-colors",
                    isActive && "border-[--accent] bg-[--accent] text-bg",
                    isDone && "border-emerald-500 bg-emerald-500 text-white",
                    isFuture &&
                      "border-border bg-bg-subtle text-fg-muted group-hover:border-fg-muted"
                  )}
                >
                  {isDone ? (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  ) : (
                    String(s).padStart(2, "0")
                  )}
                </span>
              </span>
              <span
                className={cn(
                  "hidden whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.22em] transition-colors sm:inline",
                  isActive && "text-fg",
                  isDone && "text-emerald-600",
                  isFuture && "text-fg-muted group-hover:text-fg"
                )}
              >
                {labels[s]}
              </span>
            </button>
            {i < steps.length - 1 ? (
              <div className="relative h-px flex-1 overflow-hidden bg-border">
                <motion.div
                  initial={false}
                  animate={{ width: s < step ? "100%" : "0%" }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-y-0 left-0 bg-emerald-500"
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
