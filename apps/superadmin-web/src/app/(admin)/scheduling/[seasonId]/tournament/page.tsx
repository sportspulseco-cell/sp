import { fetchAll, load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError } from "@sportspulse/ui";
import Link from "next/link";
import { SchedulingTournament, ScheduleTimeZoneProvider } from "@sportspulse/admin-pages";
import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Tournament — SportsPulse" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Pain #4 — dynamic tournament mode (Johnny's ask).
 *
 * Each round teams play a round-robin within their tier (upper / middle /
 * lower). At round end, top promotes and bottom relegates — fixtures for
 * the next round generate automatically against the new tier assignments.
 */
export default async function TournamentPage({
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

  const divisionsPage = await fetchAll((cursor) => leagueMgmt
    .listDivisions({ seasonId: season.id, limit: 100, cursor }))
    .catch(() => ({ items: [] as { id: string; name: string }[] }));

  const teamPages = await Promise.all(
    divisionsPage.items.map(async (d) => {
      const page = await fetchAll((cursor) => leagueMgmt
        .listTeams({ divisionId: d.id, limit: 100, cursor }))
        .catch(() => ({ items: [] as { id: string; name: string }[] }));
      return page.items.map((t) => ({ id: t.id, name: t.name, divisionId: d.id }));
    })
  );
  const teams = teamPages.flat();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="schedule"
        title={`Tournament · ${season.name}`}
        description="Dynamic tier mode. Each round, top of every tier promotes and bottom relegates. Next-round fixtures generate automatically."
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
        <SchedulingTournament
          seasonId={season.id}
          divisions={divisionsPage.items.map((d) => ({ id: d.id, name: d.name }))}
          teams={teams}
        />
      </ScheduleTimeZoneProvider>
    </div>
  );
}
