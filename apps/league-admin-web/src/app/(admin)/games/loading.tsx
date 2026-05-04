import {
  PageHeaderSkeleton,
  Skeleton,
  TableSkeleton
} from "@/components/ui/skeleton";

export default function GamesLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>
      <TableSkeleton rows={6} cols={5} />
    </div>
  );
}
