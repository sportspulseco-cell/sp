import {
  PageHeaderSkeleton,
  Skeleton,
  StatCardSkeleton,
  TableSkeleton
} from "@/components/ui/skeleton";

export default function CommunicationsLoading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton />
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </section>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>
      <TableSkeleton rows={8} cols={7} />
    </div>
  );
}
