import { notFound } from "next/navigation";
import { DivisionDetail } from "@sportspulse/admin-pages";
import { adminTransfers, leagueMgmt } from "@/lib/api/server-api";
import { ResourceAdminsSection } from "@/components/layout/resource-admins-section";
import { DivisionPendingApplications } from "@/components/divisions/division-pending-applications";

export const metadata = { title: "Division — SportsPulse" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * View-only division detail. Body is rendered by the shared
 * @sportspulse/admin-pages DivisionDetail — org-admin-web mounts the
 * same component (BUG-043 family). Sa-only add-ons (pending
 * applications card, role-assignments panel) are passed as slots.
 */
export default async function DivisionDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const division = await leagueMgmt.getDivision(id).catch(() => null);
  if (!division) notFound();

  const [parentSeason, divisionTeams, pendingForSeason] = await Promise.all([
    leagueMgmt.getSeason(division.seasonId).catch(() => null),
    adminTransfers.listDivisionTeams(id).catch(() => ({ items: [] })),
    adminTransfers
      .listApplications(division.seasonId, "pending")
      .catch(() => ({
        season: { id: division.seasonId, name: "", registrationClosesAt: null },
        divisions: [],
        items: []
      }))
  ]);
  const pendingForThisDivision = pendingForSeason.items.filter(
    (a) => a.divisionId === id
  );

  return (
    <DivisionDetail
      division={division}
      parentSeason={parentSeason}
      divisionTeams={divisionTeams.items}
      editHref="/org-setup"
      applicationsQueueHref={`/seasons/${division.seasonId}/applications`}
      pendingApplications={
        <DivisionPendingApplications
          divisionId={id}
          divisionName={division.name}
          seasonId={division.seasonId}
          initial={pendingForThisDivision}
        />
      }
      extras={
        <ResourceAdminsSection
          scopeType="division"
          scopeId={division.id}
          resourceLabel={division.name}
          allowedRoleCodes={["division_admin"]}
          description="Division admins manage teams, lineups, and games inside this division."
        />
      }
    />
  );
}
