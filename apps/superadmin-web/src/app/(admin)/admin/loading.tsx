import {
  PageHeaderSkeleton,
  Skeleton,
  StatCardSkeleton
} from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="flex items-center gap-4 border-b border-border pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-24" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="rounded-xl border border-border bg-surface-1">
        <div className="border-b border-border px-6 py-4">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-2 h-3 w-56" />
        </div>
        <div className="grid gap-px bg-border md:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="bg-surface-1 px-6 py-3">
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
