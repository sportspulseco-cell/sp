import { fetchAll, load, mapLimit, type Division } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError, PageHeader } from "@sportspulse/ui";
import Link from "next/link";
import { ScheduleTimeZoneProvider } from "@sportspulse/admin-pages";
import { PlayoffBrackets } from "@/components/scheduling/playoff-brackets";
import { adminTransfers, leagueMgmt, loadMeScope } from "@/lib/api/server-api";
import { openInActiveOrg } from "@/lib/active-org";

export const metadata = { title: "Playoffs · Org Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OrgAdminPlayoffsPage({
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

  const scope = await loadMeScope();
  await openInActiveOrg(scope, season.orgId, `/scheduling/${seasonId}/playoffs`);

  const divisionsPage = await fetchAll((cursor) => leagueMgmt
    .listDivisions({ seasonId: season.id, limit: 100, cursor }))
    .catch(() => ({ items: [] as Division[] }));
  // Teams a bracket would seed (same statuses as the generator), so the
  // form can say "Every team in the division (7 teams)". null = not known.
  const teamCounts = await mapLimit(divisionsPage.items, 4, (d) =>
    adminTransfers.listDivisionTeams(d.id).then((r) => r.items.length).catch(() => null)
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="schedule"
        title={`Playoffs · ${season.name}`}
        description="Seeded single-elim brackets per division."
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
        <PlayoffBrackets
          seasonId={season.id}
          divisions={divisionsPage.items.map((d, i) => ({
            id: d.id,
            name: d.name,
            playoffConfig: d.playoffConfig,
            teamCount: teamCounts[i] ?? null
          }))}
        />
      </ScheduleTimeZoneProvider>
    </div>
  );
}
