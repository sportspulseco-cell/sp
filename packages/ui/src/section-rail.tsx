/**
 * The heading above a section of a page: one short sentence-case
 * heading, an optional count or action on the right, and the
 * explanation behind a (?) button (doc/design/guided-ui.md).
 *
 *   <SectionRail label="Queue" subtitle="..." meta="2 pending" />
 *
 * `index` is accepted for older callers and ignored: numbered section
 * labels ("// 01 ·") read as noise, not guidance.
 */

import type { ReactNode } from "react";
import { cn } from "./lib/cn";
import { InfoDisclosure } from "./info-disclosure";

export interface SectionRailProps {
  /** Ignored. Kept so existing callers compile. */
  index?: string;
  /** The section heading, sentence case. */
  label: string;
  /** Optional explanation, shown only when the user opens (?). */
  subtitle?: ReactNode;
  /** Optional right-aligned slot (a count, a small action). */
  meta?: ReactNode;
  className?: string;
}

function sentence(s: string): string {
  // Callers wrote labels for an uppercase style ("QUEUE", "ice slots");
  // show them as a normal heading. Leave mixed-case labels alone.
  if (s === s.toUpperCase() || s === s.toLowerCase()) {
    const t = s.toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  return s;
}

export function SectionRail({ label, subtitle, meta, className }: SectionRailProps) {
  return (
    <header className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3", className)}>
      <InfoDisclosure info={subtitle}>
        <h2 className="text-[17px] font-semibold tracking-tight text-fg">{sentence(label)}</h2>
      </InfoDisclosure>
      {meta ? <span className="text-[13px] text-fg-muted">{meta}</span> : null}
    </header>
  );
}
