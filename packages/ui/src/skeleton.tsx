import { cn } from "./lib/cn";
import type { HTMLAttributes } from "react";

/**
 * Skeleton placeholder block. Composes:
 *   - bg-surface-2 base
 *   - overlay span with `animate-shimmer` translating a soft accent
 *     gradient diagonally across the element
 *
 * Apps that haven't registered the `shimmer` keyframe in their
 * tailwind config still render the static base — legible, just no
 * sweep.
 */
export function Skeleton({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-md bg-surface-2",
        className
      )}
      {...rest}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/45 to-transparent dark:via-white/10"
      />
    </div>
  );
}

// Skeleton for a list of N rows that mirrors a Table's structure.
export function TableSkeleton({
  rows = 6,
  cols = 5
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
      {/* Header bar */}
      <div className="flex items-center gap-4 border-b border-border bg-surface-2 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-3.5 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Skeleton for a stat card (KPI grid) — matches the editorial card shape.
export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-7 rounded-lg" />
      </div>
      <Skeleton className="mt-5 h-9 w-20" />
      <Skeleton className="mt-2 h-3 w-32" />
    </div>
  );
}

// Skeleton for the editorial PageHeader (mono eyebrow + display headline + sub).
export function PageHeaderSkeleton() {
  return (
    <div className="relative mb-10 pb-8">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-4 h-12 w-2/3" />
      <Skeleton className="mt-3 h-4 w-1/2" />
      <div className="absolute inset-x-0 bottom-0 flex items-center">
        <span className="h-px w-6 bg-[--accent]" />
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
