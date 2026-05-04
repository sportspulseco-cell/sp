import { Skeleton } from "@/components/ui/skeleton";

export default function PersonDetailLoading() {
  return (
    <div className="space-y-10">
      <Skeleton className="h-3 w-24" />

      <header className="flex items-start justify-between gap-6 border-b border-border pb-8">
        <div className="flex items-start gap-5">
          <Skeleton className="h-16 w-16 rounded-xl" />
          <div className="space-y-3">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-3 w-56" />
            <div className="flex gap-3 pt-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-20 rounded-md" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-28 rounded-lg" />
          ))}
        </div>
      </header>

      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface-1">
          <div className="flex items-center gap-3 border-b border-border px-6 py-4">
            <Skeleton className="h-7 w-7 rounded-md" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <div className="space-y-3 px-6 py-5">
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} className="h-4 w-full" />
            ))}
          </div>
        </div>
      ))}

      <section className="grid gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface-1">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Skeleton className="h-7 w-7 rounded-md" />
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
