import { fetchAll, load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError } from "@sportspulse/ui";
import { SeasonDetail, SeasonFlow } from "@sportspulse/admin-pages";
import { SeasonActions } from "@/components/edit/detail-actions";
import { adminTransfers, gameOps, leagueMgmt, registration, roster } from "@/lib/api/server-api";
import { ResourceAdminsSection } from "@/components/layout/resource-admins-section";
import { ChangeSeasonStatusButton } from "./change-season-status-button";

export const metadata = { title: "Season · Super Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * View-only season detail. Body is rendered by the shared
 * @sportspulse/admin-pages SeasonDetail — org-admin-web mounts the
 * same component (BUG-043 family). The status-change dropdown is
 * passed as a slot, bound to sa-web's browser-api leagueMgmt.
 *
 * Role-assignment panel (sa-only for now) goes through `extras`.
 */
export default async function SeasonDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Only a real 404 is "not found"; a server error must not pose as one
  // (a pool outage showed existing seasons as 404).
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

  const [parentLeague, divisionsPage, formsPage, regions] = await Promise.all([
    leagueMgmt.getLeague(season.leagueId).catch(() => null),
    fetchAll((cursor) => leagueMgmt.listDivisions({ seasonId: season.id, limit: 100, cursor })).catch(() => ({ items: [] })),
    registration
      .listForms({ orgId: season.orgId })
      .catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt.listRegions({ orgId: season.orgId }).catch(() => ({ items: [] }))
  ]);

  // Form-builder lives at /forms/[id] (canonical surface). If this
  // season has exactly one form bound to it, deep-link straight there.
  // Otherwise fall back to /forms — admin picks the right one.
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
        />
      }
      statusControl={<ChangeSeasonStatusButton season={season} />}
      actions={
        <SeasonActions
          season={season}
          regions={regions.items.map((r) => ({ id: r.id, name: r.name }))}
        />
      }
      extras={
        <ResourceAdminsSection
          scopeType="season"
          scopeId={season.id}
          resourceLabel={season.name}
          allowedRoleCodes={["season_admin", "registrar"]}
          description="Season admins manage registrations and roster locks for this season."
        />
      }
    />
  );
}
