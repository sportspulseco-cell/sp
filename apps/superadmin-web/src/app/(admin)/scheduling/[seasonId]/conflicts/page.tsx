import { notFound } from "next/navigation";
import Link from "next/link";
import { SchedulingConflictsClient } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Conflicts — SportsPulse" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Pain #9 — inline conflict resolution.
 *
 * Server just validates the season; the conflict list is fetched
 * client-side via scheduler-conflicts-list so we can refresh on the
 * Realtime `schedule_updated` event after an apply.
 */
export default async function ConflictsPage({
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
        title={`Conflicts · ${season.name}`}
        description="Auto-detected team-overlap conflicts. Resolve in-place: each option is pre-validated to not create a new conflict."
        action={
          <Link
            href={`/seasons/${season.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
          >
            ← Season
          </Link>
        }
      />
      <SchedulingConflictsClient seasonId={season.id} />
    </div>
  );
}
