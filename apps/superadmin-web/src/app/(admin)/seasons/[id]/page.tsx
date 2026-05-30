import { notFound } from "next/navigation";
import { SeasonDetail } from "@sportspulse/admin-pages";
import { leagueMgmt, registration } from "@/lib/api/server-api";
import { ResourceAdminsSection } from "@/components/layout/resource-admins-section";
import { ChangeSeasonStatusButton } from "./change-season-status-button";

export const metadata = { title: "Season — SportsPulse" };
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
  const season = await leagueMgmt.getSeason(id).catch(() => null);
  if (!season) notFound();

  const [parentLeague, divisionsPage, formsPage] = await Promise.all([
    leagueMgmt.getLeague(season.leagueId).catch(() => null),
    leagueMgmt.listDivisions({ seasonId: season.id }).catch(() => ({ items: [] })),
    registration
      .listForms({ orgId: season.orgId })
      .catch(() => ({ items: [], nextCursor: null }))
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
      statusControl={<ChangeSeasonStatusButton season={season} />}
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
