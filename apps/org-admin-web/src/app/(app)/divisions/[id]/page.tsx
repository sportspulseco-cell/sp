import { fetchAll, load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError } from "@sportspulse/ui";
import { DivisionDetail } from "@sportspulse/admin-pages";
import { DivisionActions } from "@/components/edit/detail-actions";
import { adminTransfers, leagueMgmt, loadMeScope, orgs } from "@/lib/api/server-api";
import { getActiveOrgId } from "@/lib/active-org";
import { DivisionRegionControl } from "@/components/divisions/division-region-control";
import { PlaceTeam } from "@/components/divisions/place-team";

export const metadata = { title: "Division · Org Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Org-admin's read-only division detail. Mirrors sa-web by mounting
 * the same shared component (@sportspulse/admin-pages — DivisionDetail).
 * The sa-only pending-applications card and role-assignments panel
 * stay omitted today; the rest of the body is identical.
 *
 * Reads flow through endpoints that already accept org_admin:
 *   - `/league/divisions/:id` + `/league/seasons/:id` via AuthorizedAccessGuard
 *   - `/admin/divisions/:id/teams` via RolesGuard(org_admin, ...) +
 *     AuthorizedAccessGuard
 */
export default async function OrgAdminDivisionDetailPage({
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
  const [parentOrg, divisionTeams, regions, orgTeams] = await Promise.all([
    parentSeason
      ? orgs.get(parentSeason.orgId).catch(() => null)
      : Promise.resolve(null),
    adminTransfers.listDivisionTeams(id).catch(() => ({ items: [] })),
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

  // Defense in depth — the API already 404s out-of-scope divisions
  // for org_admin, but verify the parent season's org matches the
  // caller's active org before rendering.
  const scope = await loadMeScope();
  const activeOrgId = await getActiveOrgId(scope);
  if (parentSeason && activeOrgId && parentSeason.orgId !== activeOrgId) {
    notFound();
  }

  return (
    <DivisionDetail
      division={division}
      parentSeason={parentSeason}
      parentOrg={parentOrg}
      // org-admin has one organization page, not /organizations/:id (crawl 24 Oct: 404).
      orgHref="/organization"
      addTeam={<PlaceTeam divisionId={division.id} divisionName={division.name} teams={candidateTeams} />}
      divisionTeams={divisionTeams.items}
      actions={
        <DivisionActions
          division={division}
          regions={regions.items.map((r) => ({ id: r.id, name: r.name }))}
        />
      }
      extras={
        <DivisionRegionControl
          divisionId={division.id}
          regionId={division.regionId}
          regions={regions.items.map((r) => ({ id: r.id, name: r.name }))}
        />
      }
    />
  );
}
