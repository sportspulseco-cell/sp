import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { NoShowReport } from "./report";

export const metadata = { title: "No-show report — SportsPulse" };
export const dynamic = "force-dynamic";

export default async function NoShowReportPage() {
  const seasons = await leagueMgmt
    .listSeasons({})
    .catch(() => ({ items: [], nextCursor: null }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// admin · reports · no-show"
        title="Teams that didn't return"
        description="Diff between two seasons: which teams played the previous season but have no division entry in the new one. Use for outreach + roster forecasting."
      />
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
