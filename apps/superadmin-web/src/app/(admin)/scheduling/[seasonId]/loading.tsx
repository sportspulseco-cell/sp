import { Skeleton } from "@sportspulse/ui";
/* Hallmark · pre-emit critique: P4 H4 E4 S4 R5 V3 */
export default function SchedulingLoading() {
  return <div role="status" aria-label="Loading schedule workspace" className="space-y-6">
    <span className="sr-only">Loading schedule workspace…</span>
    <Skeleton className="h-8 w-56 max-w-full" />
    <Skeleton className="h-4 w-96 max-w-full" />
    <div className="space-y-4 rounded-xl border border-border p-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-32 w-full" /><Skeleton className="h-10 w-36" /></div>
  </div>;
}
