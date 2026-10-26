import { fetchAll, load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError } from "@sportspulse/ui";
import { DivisionDetail } from "@sportspulse/admin-pages";
import { DivisionActions } from "@/components/edit/detail-actions";
import { adminTransfers, leagueMgmt, orgs } from "@/lib/api/server-api";
import { ResourceAdminsSection } from "@/components/layout/resource-admins-section";
import { DivisionPendingApplications } from "@/components/divisions/division-pending-applications";
import { DivisionRegionControl } from "@/components/divisions/division-region-control";
import { PlaceTeam } from "@/components/divisions/place-team";

export const metadata = { title: "Division · Super Admin" };
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
  const divisionResult = await load(leagueMgmt.getDivision(id));
  if (!divisionResult.ok) {
    if (divisionResult.status === 404) notFound();
    return (
      <LoadError
        what="this division"
        status={divisionResult.status}
        message={divisionResult.message}
      />
    );
  }
  const division = divisionResult.data;

  const parentSeason = await leagueMgmt
    .getSeason(division.seasonId)
    .catch(() => null);
  const [parentOrg, divisionTeams, pendingForSeason, regions, orgTeams] = await Promise.all([
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
      : Promise.resolve({ items: [] }),
    parentSeason
      ? fetchAll((cursor) => leagueMgmt.listTeams({ orgId: parentSeason.orgId, status: "active", limit: 100, cursor }))
          .catch(() => ({ items: [], nextCursor: null }))
      : Promise.resolve({ items: [], nextCursor: null })
  ]);
  const inDivision = new Set(divisionTeams.items.map((t) => t.teamId));
  const candidateTeams = orgTeams.items
    .filter((t) => !inDivision.has(t.id))
    .map((t) => ({ id: t.id, name: t.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
      addTeam={<PlaceTeam divisionId={division.id} divisionName={division.name} teams={candidateTeams} />}
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
