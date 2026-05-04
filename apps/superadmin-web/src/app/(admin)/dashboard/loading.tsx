import { Skeleton, StatCardSkeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-12">
      {/* Hero header */}
      <header>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-12 w-2/3" />
        <Skeleton className="mt-3 h-4 w-1/2" />
      </header>

      {/* KPI grid (4 cards) */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </section>

      {/* Phase progress + recent orgs row */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-1 p-6 lg:col-span-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-48" />
          <div className="mt-6 space-y-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-3 w-8" />
                </div>
                <Skeleton className="ml-8 h-[3px] w-2/3 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-1 lg:col-span-2">
          <div className="border-b border-border p-6">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="mt-2 h-3 w-56" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-5 w-16 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pending queues — 6-up */}
      <section>
        <Skeleton className="mb-4 h-3 w-20" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-1 p-4"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-7 w-7 rounded-md" />
                <Skeleton className="h-3.5 w-32" />
              </div>
              <Skeleton className="h-5 w-6" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
