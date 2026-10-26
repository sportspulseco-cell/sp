import { fetchAll, load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError } from "@sportspulse/ui";
import { SeasonDetail, SeasonFlow } from "@sportspulse/admin-pages";
import { SeasonActions } from "@/components/edit/detail-actions";
import { adminTransfers, gameOps, leagueMgmt, loadMeScope, registration, roster } from "@/lib/api/server-api";
import { getActiveOrgId } from "@/lib/active-org";
import { ChangeSeasonStatusButton } from "./change-season-status-button";

export const metadata = { title: "Season — Org Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Org-admin's read-only season detail. Mirrors sa-web's
 * /seasons/[id]/page.tsx by mounting the same shared component
 * (@sportspulse/admin-pages — SeasonDetail). No role-assignment
 * panel here (sa-only for now); the rest of the body is identical.
 *
 * Reads + status change flow through endpoints already accepting
 * org_admin via AuthorizedAccessGuard — no proxy endpoints needed.
 */
export default async function OrgAdminSeasonDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const seasonResult = await load(leagueMgmt.getSeason(id));
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

  // Defense in depth — the API already 404s out-of-scope seasons for
  // org_admin reads, but verify the season belongs to the caller's
  // active org before rendering.
  const scope = await loadMeScope();
  const activeOrgId = await getActiveOrgId(scope);
  if (activeOrgId && season.orgId !== activeOrgId) notFound();

  const [parentLeague, divisionsPage, formsPage, regions] = await Promise.all([
    leagueMgmt.getLeague(season.leagueId).catch(() => null),
    fetchAll((cursor) => leagueMgmt.listDivisions({ seasonId: season.id, limit: 100, cursor })).catch(() => ({ items: [] })),
    registration
      .listForms({ orgId: season.orgId })
      .catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt.listRegions({ orgId: season.orgId }).catch(() => ({ items: [] }))
  ]);

  const seasonForms = formsPage.items.filter((f) => f.seasonId === season.id);
  const setupHref =
    seasonForms.length === 1 ? `/forms/${seasonForms[0]!.id}` : "/forms";

  return (
    <SeasonDetail
      season={season}
      parentLeague={parentLeague}
      divisions={divisionsPage.items}
      setupHref={setupHref}
      schedulingHref={`/scheduling/${season.id}/generate`}
      lifecycle={
        <SeasonFlow
          api={{ leagueMgmt, adminTransfers, gameOps, registration, roster }}
          seasons={[season]}
          leagues={parentLeague ? [parentLeague] : []}
          orgId={season.orgId}
          links={{ rosters: "/teams", results: "/scheduling" }}
        />
      }
      statusControl={<ChangeSeasonStatusButton season={season} />}
      actions={
        <SeasonActions
          season={season}
          regions={regions.items.map((r) => ({ id: r.id, name: r.name }))}
        />
      }
    />
  );
}
