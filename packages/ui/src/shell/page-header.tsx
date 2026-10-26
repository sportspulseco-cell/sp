import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * The header on every console page: mono eyebrow, display title, an
 * optional one-line description, and at most one primary action on the
 * right. On phones the action drops under the title.
 *
 * - `eyebrow` is the section or context ("Season · Fall 2026"), never a
 *   repeat of the title.
 * - `eyebrowDot` adds a live accent dot before the eyebrow.
 * - `action` is the one thing to do next. Secondary actions belong in
 *   the page body.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  eyebrowDot,
  action,
  className
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  eyebrowDot?: boolean;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("relative mb-10 pb-8", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 space-y-4">
          {eyebrow ? (
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-fg-muted">
              {eyebrowDot ? (
                <span className="relative inline-flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[--accent]/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[--accent]" />
                </span>
              ) : null}
              <span className="min-w-0 truncate">{eyebrow}</span>
            </div>
          ) : null}

          <h1 className="max-w-[22ch] text-balance font-sans text-[clamp(30px,4.6vw,56px)] font-semibold leading-[0.98] tracking-tighter text-fg">
            {title}
          </h1>

          {description ? (
            <div className="max-w-2xl text-[14px] leading-relaxed text-fg-muted">{description}</div>
          ) : null}
        </div>

        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>

      {/* Chapter rule: hairline with a short accent stub on the left. */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 flex items-center">
        <span className="h-px w-6 bg-[--accent]" />
        <span className="h-px flex-1 bg-border" />
      </div>
    </header>
  );
}
