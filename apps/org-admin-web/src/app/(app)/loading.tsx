/* Hallmark · pre-emit critique: P4 H4 E4 S4 R5 V3 */
import { PageHeaderSkeleton, StatCardSkeleton, TableSkeleton } from "@sportspulse/ui";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading organization workspace" className="space-y-8">
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)}
      </div>
      <TableSkeleton rows={5} cols={4} />
      <span className="sr-only">Loading organization workspace</span>
    </div>
  );
}
