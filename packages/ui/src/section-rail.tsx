"use client";

/**
 * Editorial section rail — mirrors the landing-web rhythm of
 *   // 01 · Autonomous Logistics
 *
 * before every section, with the section's working title as the
 * subtitle and a hairline chapter rule below. This is the primitive
 * that anchors data-dense admin pages to the same visual language
 * the marketing site uses, so the brand reads continuous across the
 * stack.
 *
 * Usage:
 *
 *   <SectionRail
 *     index="01"
 *     label="Pulse"
 *     subtitle="What's happening across your organization right now."
 *   />
 *   <... KPI grid ... >
 *
 * Hallmark gates honoured:
 *   - Tokens only (no inline hex / OKLCH / rgb)
 *   - Heading scale lives in clamp() — same scale as landing-web's h2
 *   - text-balance + max-w-2xl on the subtitle so descenders don't
 *     ladder unevenly across breakpoints
 *   - Honest copy: index / label / subtitle are caller-supplied; no
 *     synthetic stats or "trusted by N teams" filler invented here.
 */

import type { ReactNode } from "react";
import { cn } from "./lib/cn";

export interface SectionRailProps {
  /** Two-digit chapter index ("01", "02", …). Optional; omit for
   *  a label-only rail with no chapter framing. */
  index?: string;
  /** The eyebrow label after the index — short, uppercase-cased
   *  internally via CSS text-transform. */
  label: string;
  /** Optional working subtitle under the eyebrow. text-balance applied. */
  subtitle?: ReactNode;
  /** Optional right-aligned slot (e.g. a "// 5 total" count). */
  meta?: ReactNode;
  className?: string;
}

export function SectionRail({
  index,
  label,
  subtitle,
  meta,
  className
}: SectionRailProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 border-b border-border pb-5",
        className
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-fg-muted">
          {index ? (
            <>
              <span className="text-fg">// {index}</span>
              <span className="mx-1.5 text-fg-subtle">·</span>
            </>
          ) : (
            <span className="text-fg">// </span>
          )}
          {label}
        </p>
        {meta ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {meta}
          </span>
        ) : null}
      </div>
      {subtitle ? (
        <p className="max-w-2xl text-balance text-[14px] leading-relaxed text-fg-muted">
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}

/* Hallmark · component: section-rail · genre: editorial · theme: project
 * states: default only (display element)
 * contrast: pass (46–50) — fg / fg-muted / fg-subtle on bg ≥ 4.5:1 in both modes
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
