import {
  PageHeaderSkeleton,
  TableSkeleton
} from "@/components/ui/skeleton";

export default function LeaguesLoading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} cols={4} />
    </div>
  );
}
