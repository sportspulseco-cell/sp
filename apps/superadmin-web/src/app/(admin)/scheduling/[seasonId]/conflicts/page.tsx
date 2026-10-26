import { load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError, PageHeader } from "@sportspulse/ui";
import Link from "next/link";
import { SchedulingConflictsClient, ScheduleTimeZoneProvider } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/server-api";

export const metadata = { title: "Conflicts · Super Admin" };
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
      <ScheduleTimeZoneProvider timeZone={season.timezone}>
        <SchedulingConflictsClient seasonId={season.id} />
      </ScheduleTimeZoneProvider>
    </div>
  );
}
