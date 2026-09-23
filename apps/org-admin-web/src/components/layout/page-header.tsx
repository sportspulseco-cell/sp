"use client";

import type { ReactNode } from "react";

/**
 * Standard page header used on every screen. Editorial register
 * matching landing-web and sa-web:
 *   - Mono `// eyebrow` overline with wide tracking
 *   - Display headline at clamp(34px, 4.6vw, 56px) — responsive
 *   - Optional accent live-dot before the eyebrow via `eyebrowDot`
 *   - Bottom hairline with a small accent chapter marker
 *   - Heading and description render immediately during navigation
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  eyebrowDot,
  action
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  eyebrowDot?: boolean;
  action?: ReactNode;
}) {
  return (
    <header className="relative mb-10 pb-8">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-4">
          {eyebrow ? (
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-fg-muted">
              {eyebrowDot ? (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[--accent]/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[--accent]" />
                </span>
              ) : (
                <span className="text-fg-subtle/70">//</span>
              )}
              <span>{eyebrow}</span>
            </div>
          ) : null}

          <h1 className="max-w-[22ch] text-balance font-sans text-[clamp(34px,4.6vw,56px)] font-semibold leading-[0.96] tracking-tighter text-fg"
          >
            {title}
          </h1>

          {description ? (
            <p className="max-w-2xl text-[14px] leading-relaxed text-fg-muted">
              {description}
            </p>
          ) : null}
        </div>

        {action ? (
          <div className="shrink-0"
          >
            {action}
          </div>
        ) : null}
      </div>

      {/* Editorial chapter rule — full hairline with an accent stub
          on the left, like a magazine section opener. */}
      <div className="absolute inset-x-0 bottom-0 flex items-center">
        <span className="h-px w-6 bg-[--accent]" />
        <span className="h-px flex-1 bg-border" />
      </div>
    </header>
  );
}
