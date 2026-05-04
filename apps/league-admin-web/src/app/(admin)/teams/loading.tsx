import {
  PageHeaderSkeleton,
  TableSkeleton
} from "@/components/ui/skeleton";

export default function TeamsLoading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} cols={4} />
    </div>
  );
}
