import {
  PageHeaderSkeleton,
  TableSkeleton
} from "@/components/ui/skeleton";

// Default fallback for any (admin)/* route while RSC streams. Specific
// routes can override with their own loading.tsx.
export default function AdminLoading() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} cols={4} />
    </div>
  );
}
