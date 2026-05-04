import {
  PageHeaderSkeleton,
  TableSkeleton
} from "@/components/ui/skeleton";

export default function RostersLoading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} cols={4} />
    </div>
  );
}
