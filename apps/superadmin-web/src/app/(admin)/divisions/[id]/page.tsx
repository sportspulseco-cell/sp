import { notFound } from "next/navigation";
import { DivisionDetail } from "@sportspulse/admin-pages";
import { DivisionActions } from "@/components/edit/detail-actions";
import { adminTransfers, leagueMgmt, orgs } from "@/lib/api/server-api";
import { ResourceAdminsSection } from "@/components/layout/resource-admins-section";
import { DivisionPendingApplications } from "@/components/divisions/division-pending-applications";
import { DivisionRegionControl } from "@/components/divisions/division-region-control";

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

  const parentSeason = await leagueMgmt
    .getSeason(division.seasonId)
    .catch(() => null);
  const [parentOrg, divisionTeams, pendingForSeason, regions] = await Promise.all([
    parentSeason
      ? orgs.get(parentSeason.orgId).catch(() => null)
      : Promise.resolve(null),
    adminTransfers.listDivisionTeams(id).catch(() => ({ items: [] })),
    adminTransfers
      .listApplications(division.seasonId, "pending")
      .catch(() => ({
        season: { id: division.seasonId, name: "", registrationClosesAt: null },
        divisions: [],
        items: []
      })),
    parentSeason
      ? leagueMgmt.listRegions({ orgId: parentSeason.orgId }).catch(() => ({ items: [] }))
      : Promise.resolve({ items: [] })
  ]);
  const pendingForThisDivision = pendingForSeason.items.filter(
    (a) => a.divisionId === id
  );

  return (
    <DivisionDetail
      division={division}
      parentSeason={parentSeason}
      parentOrg={parentOrg}
      divisionTeams={divisionTeams.items}
      actions={
        <DivisionActions
          division={division}
          regions={regions.items.map((r) => ({ id: r.id, name: r.name }))}
        />
      }
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
        <div className="space-y-8">
          <DivisionRegionControl
            divisionId={division.id}
            regionId={division.regionId}
            regions={regions.items}
            orgHref={parentSeason ? `/organizations/${parentSeason.orgId}` : null}
          />
          <ResourceAdminsSection
            scopeType="division"
            scopeId={division.id}
            resourceLabel={division.name}
            allowedRoleCodes={["division_admin"]}
            description="Division admins manage teams, lineups, and games inside this division."
          />
        </div>
      }
    />
  );
}
