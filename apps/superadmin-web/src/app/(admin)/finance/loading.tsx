import {
  PageHeaderSkeleton,
  Skeleton,
  StatCardSkeleton,
  TableSkeleton
} from "@/components/ui/skeleton";

export default function FinanceLoading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </section>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>
      <TableSkeleton rows={6} cols={7} />
    </div>
  );
}
