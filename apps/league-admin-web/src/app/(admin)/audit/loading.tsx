import {
  PageHeaderSkeleton,
  Skeleton,
  TableSkeleton
} from "@/components/ui/skeleton";

export default function AuditLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>
      <TableSkeleton rows={8} cols={5} />
    </div>
  );
}
