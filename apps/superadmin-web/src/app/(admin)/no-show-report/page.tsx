import { fetchAll, load } from "@sportspulse/api-client";
import { LoadError } from "@sportspulse/ui";
import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { NoShowReport } from "./report";

export const metadata = { title: "No-show report — SportsPulse" };
export const dynamic = "force-dynamic";

export default async function NoShowReportPage() {
  const seasonsResult = await load(
    fetchAll((cursor) => leagueMgmt.listSeasons({ limit: 100, cursor }))
  );
  if (!seasonsResult.ok) {
    console.error("[no-show-report] listSeasons failed", seasonsResult.status, seasonsResult.message);
  }
  const seasons = seasonsResult.ok
    ? seasonsResult.data
    : { items: [], nextCursor: null };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="Teams that did not return"
        description="Teams that played last season but have no place in the new one yet. Use it to reach out before registration closes."
      />
      {!seasonsResult.ok ? (
        <LoadError
          what="seasons"
          status={seasonsResult.status}
          message={seasonsResult.message}
        />
      ) : null}
      <NoShowReport
        seasons={seasons.items.map((s) => ({
          id: s.id,
          name: s.name,
          leagueId: s.leagueId,
          status: s.status
        }))}
      />
    </div>
  );
}
