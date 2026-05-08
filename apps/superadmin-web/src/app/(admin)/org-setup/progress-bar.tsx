"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardStep } from "./types";

/**
 * 4-circle progress indicator at the top of the wizard. Active circle
 * is filled accent; completed circles show a check on green; future
 * circles are outlined. Connector lines turn green between completed
 * steps. Clickable on completed steps so admins can hop back.
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
                "flex items-center gap-2 sm:gap-3",
                canClick ? "cursor-pointer" : "cursor-default"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-mono text-[12px] font-medium transition-colors",
                  isActive && "border-accent bg-accent text-bg",
                  isDone && "border-emerald-500 bg-emerald-500 text-white",
                  isFuture && "border-border bg-bg-subtle text-fg-muted"
                )}
              >
                {isDone ? <Check className="h-4 w-4" strokeWidth={2.5} /> : s}
              </span>
              <span
                className={cn(
                  "hidden whitespace-nowrap font-mono text-[11px] uppercase tracking-widest sm:inline",
                  isActive && "text-fg",
                  isDone && "text-emerald-600 dark:text-emerald-400",
                  isFuture && "text-fg-muted"
                )}
              >
                {labels[s]}
              </span>
            </button>
            {i < steps.length - 1 ? (
              <div className="h-px flex-1 bg-border">
                <div
                  className={cn(
                    "h-full transition-colors",
                    s < step ? "bg-emerald-500" : "bg-transparent"
                  )}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
