import { Skeleton } from "@/components/ui/skeleton";

export default function GameDetailLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-3 w-24" />

      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-5 w-16 rounded-md" />
        </header>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-8">
          <div className="space-y-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-7 w-48" />
          </div>
          <Skeleton className="h-12 w-32" />
          <div className="ml-auto space-y-2 text-right">
            <Skeleton className="ml-auto h-3 w-12" />
            <Skeleton className="ml-auto h-7 w-48" />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-6">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-2 h-3 w-64" />
        <div className="mt-5 flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-28 rounded-md" />
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-1 lg:col-span-2">
          <div className="border-b border-border px-6 py-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-4 px-6 py-3.5">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-1">
          <div className="border-b border-border px-6 py-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
          <div className="divide-y divide-border p-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="my-1 h-4 w-full" />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
