import { adminTransfers, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { ApplicationsQueue } from "./applications-queue";

export const dynamic = "force-dynamic";

export default async function SeasonApplicationsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: seasonId } = await params;
  const [seasonsPage, initial] = await Promise.all([
    leagueMgmt.listSeasons().catch(() => ({ items: [], nextCursor: null })),
    adminTransfers.listApplications(seasonId).catch(() => ({ items: [] }))
  ]);
  const season = seasonsPage.items.find((s) => s.id === seasonId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`// admin · ${season?.name ?? "season"}`}
        title="Team applications"
        description="Captain-submitted applications awaiting your review. Approve to unlock the rollover wizard for the captain; reject (with reason) to send them back to division selection."
      />
      <ApplicationsQueue seasonId={seasonId} initial={initial} />
    </div>
  );
}
