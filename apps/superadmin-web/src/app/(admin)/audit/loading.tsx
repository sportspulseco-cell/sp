import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function AuditLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="space-y-3 rounded-xl border border-border bg-surface-1 p-4">
        <Skeleton className="h-3 w-44" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-full" />
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-border bg-surface-1">
        <div className="border-b border-border px-6 py-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-3 w-44" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[16px_140px_1fr_auto] items-center gap-4 px-6 py-3.5"
            >
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
