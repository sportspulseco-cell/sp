import { Skeleton, StatCardSkeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-12">
      <header>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-12 w-2/3" />
        <Skeleton className="mt-3 h-4 w-1/2" />
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </section>
    </div>
  );
}
