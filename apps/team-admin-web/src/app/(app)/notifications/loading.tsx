import { Skeleton } from "@sportspulse/ui";
export default function Loading() {
  return <div role="status" aria-label="Loading notifications" className="space-y-5"><Skeleton className="h-9 w-48" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>;
}
