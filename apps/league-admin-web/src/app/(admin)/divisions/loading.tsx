import {
  PageHeaderSkeleton,
  TableSkeleton
} from "@/components/ui/skeleton";

export default function DivisionsLoading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} cols={3} />
    </div>
  );
}
