import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Editorial empty state — replaces "nothing here" with a typed
 * page-of-record breath: mono `// EMPTY` overline, headline, optional
 * description, optional CTA. Soft accent halo behind the icon tile so
 * empty doesn't feel cold.
 *
 * API kept stable; `eyebrow` is new and optional (defaults to "empty").
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  eyebrow = "empty"
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Mono overline rendered as `// {eyebrow}`. Default: "empty". */
  eyebrow?: string;
}) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-surface-1 px-6 py-14 text-center">
      {/* Soft accent halo behind the icon tile — matches landing's
          accent-glow pattern at low alpha. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-8 h-40 w-40 -translate-x-1/2 rounded-full bg-[--accent]/[0.08] blur-3xl"
      />
      <div className="relative mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-2">
        <Icon className="h-5 w-5 text-fg-muted" strokeWidth={1.5} />
      </div>
      <p className="relative mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-fg-subtle">
        <span className="text-fg-subtle/70">//</span>
        <span>{eyebrow}</span>
      </p>
      <h3 className="relative max-w-sm text-[15px] font-semibold tracking-tight text-fg">
        {title}
      </h3>
      {description ? (
        <p className="relative mt-1.5 max-w-sm text-[13px] leading-relaxed text-fg-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="relative mt-5">{action}</div> : null}
    </div>
  );
}
