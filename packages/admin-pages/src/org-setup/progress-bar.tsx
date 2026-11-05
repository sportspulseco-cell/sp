"use client";

import { Check } from "lucide-react";
import { cn } from "@sportspulse/ui";
import type { WizardStep } from "./types";

/** Numbered progress for this setup path; completed steps remain reachable. */
export function ProgressBar({
  step,
  labels,
  validation,
  onNavigate,
  lastStep = 6,
  firstStep = 1
}: {
  step: WizardStep;
  labels: Record<WizardStep, string>;
  validation: Record<WizardStep, boolean>;
  onNavigate: (s: WizardStep) => void;
  lastStep?: WizardStep;
  firstStep?: WizardStep;
}) {
  const steps = ([1, 2, 3, 4, 5, 6] as WizardStep[]).filter(s => s >= firstStep && s <= lastStep);
  return <nav aria-label="Season setup progress"><ol className="flex gap-2 sm:gap-4">
    {steps.map((s,i)=>{const active=s===step,done=s<step&&validation[s];return <li key={s} className="min-w-0 flex-1">
      <button type="button" aria-label={'Step '+(i+1)+': '+labels[s]} aria-current={active?'step':undefined}
        disabled={s>=step} onClick={()=>onNavigate(s)}
        className={cn('flex w-full flex-col items-start gap-2 rounded-md py-2 text-left focus-visible:outline-none focus-visible:shadow-focus',s<step?'hover:bg-surface-2 active:bg-surface-2':'cursor-default')}>
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-full border text-[12px] font-medium',active?'border-accent bg-accent text-accent-fg':done?'border-border bg-surface-2 text-fg':'border-border text-fg-muted')}>
          {done?<Check aria-hidden className="h-3.5 w-3.5"/>:i+1}
        </span>
        <span className={cn('hidden whitespace-nowrap text-[12px] sm:block',active?'font-medium text-fg':'text-fg-muted')}>{labels[s]}</span>
      </button>
    </li>})}
  </ol></nav>;
}
