import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

// Pulse-shimmer skeleton block. Use to replace text/cards while data loads.
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-surface-2",
        className
      )}
      {...rest}
    />
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

// Skeleton for a stat card (KPI grid).
export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-7 rounded-lg" />
      </div>
      <Skeleton className="mt-5 h-9 w-16" />
      <Skeleton className="mt-2 h-3 w-32" />
    </div>
  );
}

// Skeleton for a page header (eyebrow + h1 + sub).
export function PageHeaderSkeleton() {
  return (
    <div className="mb-10 border-b border-border pb-8">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-3 h-10 w-2/3" />
      <Skeleton className="mt-3 h-4 w-1/2" />
    </div>
  );
}
