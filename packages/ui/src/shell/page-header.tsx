import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { InfoDisclosure } from "../info-disclosure";

/**
 * The header on every console page: a title and at most one primary
 * action on the right. On phones the action drops under the title.
 * Rules: doc/design/guided-ui.md (text budget).
 *
 * - `description` never shows by default. It sits behind a (?) button
 *   next to the title, for people who want the explanation.
 * - `eyebrow` shows only when it adds context ("Season · Fall 2026",
 *   or any node). A plain section name ("Finance") repeats the sidebar
 *   and the breadcrumb, so it is dropped.
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
  const showEyebrow = eyebrow != null && eyebrow !== "" && (typeof eyebrow !== "string" || eyebrow.includes("·"));
  return (
    <header className={cn("mb-6 border-b border-border pb-5", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          {showEyebrow ? (
            <div className="flex items-center gap-2 text-[13px] text-fg-muted">
              {eyebrowDot ? (
                <span className="relative inline-flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[--accent]/60 motion-reduce:hidden" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[--accent]" />
                </span>
              ) : null}
              <span className="min-w-0 truncate">{eyebrow}</span>
            </div>
          ) : null}

          <InfoDisclosure info={description}>
            <h1 className="min-w-0 text-balance font-sans text-[clamp(24px,3vw,30px)] font-semibold leading-tight tracking-tight text-fg [overflow-wrap:anywhere]">
              {title}
            </h1>
          </InfoDisclosure>
        </div>

        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </header>
  );
}
