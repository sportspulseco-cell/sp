import { load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError } from "@sportspulse/ui";
import Link from "next/link";
import { SchedulingRunsList } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Run history · Super Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Run history (forensics).
 *
 * Read view over `schedule_runs` — every CP-SAT invocation for this
 * season, with the stored solution + input hash + duration. Click a
 * row's Details to expand seed / hash / infeasibility summary.
 */
export default async function RunsPage({
  params
}: {
  params: Promise<{ seasonId: string }>;
}) {
  const { seasonId } = await params;
  const seasonResult = await load(leagueMgmt.getSeason(seasonId));
  if (!seasonResult.ok) {
    if (seasonResult.status === 404) notFound();
    return (
      <LoadError
        what="this season"
        status={seasonResult.status}
        message={seasonResult.message}
      />
    );
  }
  const season = seasonResult.data;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="schedule"
        title={`Run history · ${season.name}`}
        description="Every generation run for this season. Each row stores its full solution + seed + input hash: the answer to 'why did the engine put X here?'"
        action={
          <Link
            href={`/seasons/${season.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
          >
            ← Season
          </Link>
        }
      />
      <SchedulingRunsList seasonId={season.id} />
    </div>
  );
}
