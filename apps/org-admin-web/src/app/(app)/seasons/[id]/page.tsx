import { notFound } from "next/navigation";
import { SeasonDetail } from "@sportspulse/admin-pages";
import { iam, leagueMgmt, registration } from "@/lib/api/server-api";
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
  const season = await leagueMgmt.getSeason(id).catch(() => null);
  if (!season) notFound();

  // Defense in depth — the API already 404s out-of-scope seasons for
  // org_admin reads, but verify the season belongs to the caller's
  // active org before rendering.
  const scope = await iam.meScope().catch(() => null);
  const activeOrgId = await getActiveOrgId(scope);
  if (activeOrgId && season.orgId !== activeOrgId) notFound();

  const [parentLeague, divisionsPage, formsPage] = await Promise.all([
    leagueMgmt.getLeague(season.leagueId).catch(() => null),
    leagueMgmt.listDivisions({ seasonId: season.id }).catch(() => ({ items: [] })),
    registration
      .listForms({ orgId: season.orgId })
      .catch(() => ({ items: [], nextCursor: null }))
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
      statusControl={<ChangeSeasonStatusButton season={season} />}
    />
  );
}
