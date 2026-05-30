import { notFound } from "next/navigation";
import Link from "next/link";
import { SchedulingRunsList } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Run history — SportsPulse" };
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
  const season = await leagueMgmt.getSeason(seasonId).catch(() => null);
  if (!season) notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="schedule"
        title={`Run history · ${season.name}`}
        description="Every generation run for this season. Each row stores its full solution + seed + input hash — the answer to 'why did the engine put X here?'"
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
